#!/usr/bin/env node

// Regression backtest for HTML Minifier Next.
//
// Walks Git history and runs the minifier from each sampled commit against the local
// corpus (backtest/input), reporting how output size and median processing time
// changed from commit to commit. Counterpart to benchmark.js, which measures the
// current working tree rather than history.
//
// For each commit it checks out src and package.json at that revision and reads the
// matching minifier config via `git show` (falling back to the on-disk config), then
// minifies every corpus file and records output size (raw, Gzip, and Brotli; see
// compression.js) and median time; results are written to results.json (with any
// failures in errors.log). Because it temporarily checks out historical files,
// the working tree must have no uncommitted changes in src, package.json, or
// html-minifier-next.config.json.
//
// Usage (from the backtest folder):
//   npm run backtest: Test the last 50 commits (default)
//   npm run backtest 100: Test the last COUNT commits
//   npm run backtest 500/10: Test the last COUNT commits, sampling every STEPth commit
//
// The corpus is downloaded on first run (sources listed in sites.json) and shared
// with benchmark.js.

import { spawn, fork } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import https from 'https';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import zlib from 'zlib';
import { BROTLI_QUALITY, GZIP_LEVEL, compressedSizes } from './compression.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dirRoot = path.join(__dirname, '..');

// Run (or serve as a forked child) only when executed, not when imported by tests
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

// Default number of commits to test when no parameter is provided
const DEFAULT_COMMIT_COUNT = 50;

// Timing: One warm-up run (discarded) plus this many timed iterations; median is reported
const BENCH_WARMUP = 1;
const BENCH_ITERATIONS = 3;

// Timeout per commit in milliseconds (increase if testing large files with slow minification)
const TASK_TIMEOUT_MS = 60000;

// Output directory for results
const DIR_OUTPUT = __dirname;

const urls = JSON.parse(await fs.readFile(path.join(__dirname, 'sites.json'), 'utf8'));
const fileNames = Object.keys(urls);
const dirInput = path.join(__dirname, 'input');

async function downloadFile(url, pathFile, redirectsLeft = 5) {
  const pathTmp = pathFile + '.tmp';
  return new Promise((resolve) => {
    let resolved = false;
    function safeResolve(value) {
      if (!resolved) {
        resolved = true;
        if (!value) {
          fs.unlink(pathTmp).catch(() => {});
        }
        resolve(value);
      }
    }

    const parsedUrl = new URL(url);
    const request = https.get({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: {
        'Accept-Encoding': 'gzip, br, deflate',
        'User-Agent': 'html-minifier-next-backtest/0.0'
      }
    }, function (res) {
      const status = res.statusCode;

      if (status === 200) {
        let stream = res;
        if (res.headers['content-encoding'] === 'gzip') {
          stream = res.pipe(zlib.createGunzip());
        } else if (res.headers['content-encoding'] === 'br') {
          stream = res.pipe(zlib.createBrotliDecompress());
        } else if (res.headers['content-encoding'] === 'deflate') {
          stream = res.pipe(zlib.createInflate());
        }

        const writeStream = createWriteStream(pathTmp);
        stream.on('error', () => safeResolve(false));
        writeStream.on('error', () => safeResolve(false));
        writeStream.on('finish', () => {
          fs.rename(pathTmp, pathFile).then(() => safeResolve(true), () => safeResolve(false));
        });
        stream.pipe(writeStream);
      } else if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) {
          safeResolve(false);
        } else {
          downloadFile(new URL(res.headers.location, url).href, pathFile, redirectsLeft - 1).then(safeResolve);
        }
      } else {
        res.resume();
        safeResolve(false);
      }
    });

    request.setTimeout(30000, function () {
      request.destroy();
      safeResolve(false);
    });
    request.on('error', () => safeResolve(false));
  });
}

// Historical dependencies that old source code may import (not in current package.json)
const historicalDeps = ['relateurl', 'clean-css', 'he', 'change-case', 'camel-case', 'param-case'];

async function ensureHistoricalDeps() {
  const dirNodeModules = path.join(dirRoot, 'node_modules');
  const missing = [];
  for (const dep of historicalDeps) {
    try {
      await fs.stat(path.join(dirNodeModules, dep));
    } catch {
      missing.push(dep);
    }
  }
  if (missing.length === 0) return;

  console.log(`Installing ${missing.length} historical dependency(ies)…`);
  await new Promise((resolve) => {
    const proc = spawn('npm', ['install', '--no-save', ...missing], {
      cwd: dirRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    proc.on('error', (err) => {
      console.error('Warning: Failed to spawn npm install:', err.message);
      resolve();
    });
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error('Warning: Failed to install some historical dependencies; old commits may fail');
        resolve();
      }
    });
  });
}

// Loaded on use, so tests can import this module without the backtest’s own dependencies
async function loadProgress() {
  const { default: Progress } = await import('progress');
  return Progress;
}

async function ensureInput() {
  await fs.mkdir(dirInput, { recursive: true });

  const missing = [];
  for (const fileName of fileNames) {
    const pathFile = path.join(dirInput, fileName + '.html');
    try {
      await fs.stat(pathFile);
    } catch {
      missing.push(fileName);
    }
  }

  if (missing.length === 0) return;

  console.log(`Downloading ${missing.length} source file(s)…`);
  const Progress = await loadProgress();
  const progress = new Progress('[:bar] :current/:total :etas', {
    width: 40,
    total: missing.length
  });

  for (const fileName of missing) {
    const pathFile = path.join(dirInput, fileName + '.html');
    const ok = await downloadFile(urls[fileName], pathFile);
    if (!ok) {
      console.error(`Failed to download ${fileName} from ${urls[fileName]}`);
    }
    progress.tick();
  }
}

function git() {
  const args = [].concat.apply([], [].slice.call(arguments, 0, -1));
  const callback = arguments[arguments.length - 1];
  const task = spawn('git', args, { cwd: dirRoot, stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  task.stdout.setEncoding('utf8');
  task.stdout.on('data', function (data) {
    output += data;
  });
  task.on('exit', function (code) {
    callback(code, output);
  });
}

async function readText(pathFile) {
  return await fs.readFile(pathFile, 'utf8');
}

async function writeText(pathFile, data) {
  await fs.writeFile(pathFile, data, 'utf8');
}

async function loadModule() {
  const { minify: minifyModule } = await import('../src/htmlminifier.js');
  return minifyModule || global.minify;
}

function getOptions(fileName, options) {
  const result = {
    minifyURLs: {
      site: urls[fileName]
    }
  };
  for (const key in options) {
    result[key] = options[key];
  }
  return result;
}

async function minify(hash, options) {
  try {
    const minifyFn = await loadModule();
    process.send('ready');
    let count = fileNames.length;

    for (const fileName of fileNames) {
      try {
        const pathFile = path.join(dirInput, fileName + '.html');

        try {
          await fs.stat(pathFile);
        } catch {
          throw new Error(`Source file not found: ${fileName}.html`);
        }

        const data = await readText(pathFile);
        const opts = getOptions(fileName, options);

        // Warm-up (result discarded)
        for (let i = 0; i < BENCH_WARMUP; i++) {
          await minifyFn(data, opts);
        }

        // Timed iterations
        const times = [];
        let minified;
        for (let i = 0; i < BENCH_ITERATIONS; i++) {
          const t0 = performance.now();
          minified = await minifyFn(data, opts);
          times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        const mid = Math.floor(times.length / 2);
        const median = times.length % 2 === 1 ? times[mid] : (times[mid - 1] + times[mid]) / 2;
        const duration = Math.round(median);

        if (minified != null) {
          // Compressed after timing, so compression doesn’t count toward the minification time
          process.send({ name: fileName, size: minified.length, ...compressedSizes(minified), time: duration });
        } else {
          throw new Error('Unexpected result: ' + minified);
        }
      } catch (err) {
        console.error('[' + fileName + ']', err.stack || err);
      } finally {
        if (!--count) {
          process.disconnect();
        }
      }
    }
  } catch (err) {
    console.error('[FATAL]', err.stack || err);
    process.disconnect();
  }
}

// Parse “COUNT” or “COUNT/STEP”, throwing a message for the user on invalid input
function parseRange(arg) {
  const parts = arg.split('/');
  if (parts.length > 2) {
    throw new Error(`Invalid format “${arg}”—use \`COUNT\` or \`COUNT/STEP\``);
  }
  const count = parseInt(parts[0], 10);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Invalid commit count “${parts[0]}”—must be a positive integer`);
  }
  const step = parts.length === 2 ? parseInt(parts[1], 10) : 1;
  if (!Number.isInteger(step) || step < 1) {
    throw new Error(`Invalid step “${parts[1]}”—must be a positive integer`);
  }
  return { count, step };
}

// Ordinal for a positive integer (1st, 2nd, 3rd, 4th, etc.)
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Use consistent number formatting for JSON (locale-independent)
const formatNumber = new Intl.NumberFormat('en-US').format;

// Commit hashes, most recent first
function sortHashes(table) {
  // Parse ISO dates directly from Git (format: “2025-12-27 18:23:13 +0100”)
  return Object.keys(table).sort((a, b) => new Date(table[b].date) - new Date(table[a].date));
}

// Render a “ (±N%)” suffix against the older value, or nothing if there is none or it rounds to 0.00%
function formatChange(curr, prev) {
  if (!prev) {
    return '';
  }
  const percent = (((curr - prev) / prev) * 100).toFixed(2);
  if (percent === '0.00' || percent === '-0.00') {
    return '';
  }
  return ` (${curr > prev ? '+' : ''}${percent}%)`;
}

// Build the results.json structure from the per-commit table
function formatResults(table, names, step = 1, generated = new Date()) {
  const hashes = sortHashes(table);

  // JSON output—compact and readable format
  const jsonOutput = {
    summary: {
      commits: hashes.length,
      step: step,
      sites: names.length,
      compression: { gzip: GZIP_LEVEL, brotli: BROTLI_QUALITY },
      generated: generated.toISOString().split('T')[0]
    },
    sites: {}
  };

  // Build per-site objects with date and hash keys
  names.forEach(fileName => {
    jsonOutput.sites[fileName] = {};

    hashes.forEach((hash, index) => {
      const data = table[hash];
      const sizeData = data[fileName];

      if (sizeData) {
        const { size, gzip, brotli, time } = sizeData;
        // Format: “YYYY-MM-DD HH:MM hash”
        const dateShort = data.date.substring(0, 16); // “2025-12-27 18:23”
        const key = `${dateShort} ${hash}`;

        // Calculate deltas comparing to the entry displayed below (index + 1, chronologically older)
        // This shows how the commit performs compared to the older one below it
        let dataPrev = null;
        for (let i = index + 1; i < hashes.length; i++) {
          const candidateData = table[hashes[i]][fileName];
          if (candidateData) {
            dataPrev = candidateData;
            break;
          }
        }

        // Format value: “size · Gzip size · Brotli size @ time”, each value followed by “(±N%)” where it changed
        jsonOutput.sites[fileName][key] = `${formatNumber(size)}${formatChange(size, dataPrev?.size)}` +
          ` · Gzip ${formatNumber(gzip)}${formatChange(gzip, dataPrev?.gzip)}` +
          ` · Brotli ${formatNumber(brotli)}${formatChange(brotli, dataPrev?.brotli)}` +
          ` @ ${time} ms${formatChange(time, dataPrev?.time)}`;
      }
    });
  });

  return jsonOutput;
}

async function print(table, step = 1) {
  // Ensure output directory exists
  await fs.mkdir(DIR_OUTPUT, { recursive: true });

  const errors = [];

  for (const hash of sortHashes(table)) {
    if (table[hash].error) {
      errors.push(hash + ' - ' + table[hash].error);
    }
  }

  // Only write errors.log if there are errors
  const pathErrors = path.join(DIR_OUTPUT, 'errors.log');
  if (errors.length > 0) {
    await writeText(pathErrors, errors.join('\n'));
  } else {
    // Delete errors.log if it exists and is empty/not needed
    try {
      await fs.unlink(pathErrors);
    } catch {
      // Ignore if file doesn’t exist
    }
  }

  await writeText(path.join(DIR_OUTPUT, 'results.json'), JSON.stringify(formatResults(table, fileNames, step), null, 2));
}

if (isMain && (process.argv.length > 2 || !process.send)) {
  let count = DEFAULT_COMMIT_COUNT;
  let step = 1;

  if (process.argv.length > 2) {
    try {
      ({ count, step } = parseRange(process.argv[2]));
    } catch (err) {
      console.error(`Error: ${err.message}`);
      console.error('Examples: `backtest.js 50` or `backtest.js 500/10`');
      process.exit(1);
    }
  } else {
    console.log(`Running backtest on last ${DEFAULT_COMMIT_COUNT} commits (use: \`backtest.js COUNT\` to specify)`);
  }

  if (count > 0) {

    // Check for uncommitted changes in files the backtest temporarily modifies
    const pathSrc = path.join(__dirname, '..', 'src');
    const pathConfig = path.join(__dirname, 'html-minifier-next.config.json');
    const pathPkg = path.join(dirRoot, 'package.json');
    git('status', '--porcelain', '--', pathSrc, pathConfig, pathPkg, async function (_codeStatus, outputStatus) {
      if (outputStatus.trim().length > 0) {
        console.error('Error: Uncommitted changes detected in src, package.json, or html-minifier-next.config.json');
        console.error('Please commit or stash your changes before running backtest');
        console.error('This is required because backtest temporarily modifies these files for testing');
        process.exit(1);
      }

      // Download missing source files before starting
      await ensureInput();

      // Ensure historical dependencies are available for old source code
      await ensureHistoricalDeps();

      // Print backtest info after pre-flight checks pass
      if (step > 1) {
        const actualTests = Math.ceil(count / step);
        console.log(`Testing last ${count} commits, sampling every ${ordinal(step)} commit (${actualTests} tests)`);
      }

      // Clean-up function to restore files on exit/error
      let cleanupCalled = false;
      const cleanup = async function (reason) {
        if (cleanupCalled) return;
        cleanupCalled = true;

        if (reason) {
          console.log(`\nCleaning up after ${reason}…`);
        }

        // Restore src folder, package.json, and html-minifier-next.config.json from HEAD using Git
        await new Promise((resolve) => {
          git('checkout', 'HEAD', '--', pathSrc, pathConfig, pathPkg, function (code) {
            if (code !== 0) {
              console.error('Warning: Failed to restore modified files');
            }
            // Remove stale files that old commits added but HEAD doesn’t have
            git('reset', 'HEAD', '--', pathSrc, function () {
              git('clean', '-fd', pathSrc, function () {
                resolve();
              });
            });
          });
        });
      };

      // Register clean-up handlers for various exit scenarios
      const sigintHandler = async () => {
        await cleanup('SIGINT (Ctrl+C)');
        process.exit(130);
      };
      const sigtermHandler = async () => {
        await cleanup('SIGTERM');
        process.exit(143);
      };
      const uncaughtExceptionHandler = async (err) => {
        console.error('Uncaught exception:', err);
        await cleanup('uncaught exception');
        process.exit(1);
      };
      const unhandledRejectionHandler = async (reason) => {
        console.error('Unhandled rejection:', reason);
        await cleanup('unhandled rejection');
        process.exit(1);
      };

      process.on('SIGINT', sigintHandler);
      process.on('SIGTERM', sigtermHandler);
      process.on('uncaughtException', uncaughtExceptionHandler);
      process.on('unhandledRejection', unhandledRejectionHandler);

      git('log', '--date=iso', '--pretty=format:%h %cd', '-' + count, async function (_codeLog, outputLog) {
      const table = {};
      let commits = outputLog.split(/\s*?\n/).map(function (line) {
        const index = line.indexOf(' ');
        const hash = line.substring(0, index);
        table[hash] = {
          date: line.substring(index + 1)
        };
        return hash;
      });

      // Apply step filtering—keep every nth commit starting from most recent (index 0)
      if (step > 1) {
        commits = commits.filter((_, index) => index % step === 0);
      }

      const nThreads = os.cpus().length;
      let running = 0;
      const Progress = await loadProgress();
      const progress = new Progress('[:bar] :etas', {
        width: 50,
        total: commits.length * 2
      });

      function forkTask() {
        if (commits.length && running < nThreads) {
          const hash = commits.shift();
          const task = fork(path.join(__dirname, 'backtest.js'), { silent: true });
          let error = '';
          const id = setTimeout(function () {
            if (task.connected) {
              error += 'task timed out\n';
              task.kill();
            }
          }, TASK_TIMEOUT_MS);
          task.on('message', function (data) {
            if (data === 'ready') {
              progress.tick(1);
              forkTask();
            } else {
              table[hash][data.name] = { size: data.size, gzip: data.gzip, brotli: data.brotli, time: data.time };
            }
          }).on('exit', async function () {
            progress.tick(1);
            clearTimeout(id);
            if (error) {
              table[hash].error = error;
            }
            if (!--running && !commits.length) {
              await print(table, step);

              // Successful completion—clean up and unregister handlers
              await cleanup();

              // Unregister clean-up handlers to prevent duplicate clean-up
              process.removeListener('SIGINT', sigintHandler);
              process.removeListener('SIGTERM', sigtermHandler);
              process.removeListener('uncaughtException', uncaughtExceptionHandler);
              process.removeListener('unhandledRejection', unhandledRejectionHandler);
            } else {
              forkTask();
            }
          });
          task.stderr.setEncoding('utf8');
          task.stderr.on('data', function (data) {
            if (error.length < 10000) {
              error += data;
            }
          });
          task.stdout.resume();
          task.send(hash);
          running++;
        }
      }

      forkTask();
      });
    });
  }
} else if (isMain && process.send) {
  // Running as forked child process

  // Config file paths (repo-root-relative), ordered newest to oldest
  const pathsConfig = [
    'backtest/html-minifier-next.config.json',
    'backtest/html-minifier-next.json',
    'backtest/html-minifier.json',
    'benchmarks/html-minifier.json',
    'benchmarks/html-minifier-benchmarks.json',
    'benchmark.conf'
  ];

  function readConfigFromGit(hash, index, callback) {
    if (index >= pathsConfig.length) {
      // Fallback to current config file on disk
      readText(path.join(__dirname, 'html-minifier-next.config.json')).then(callback).catch(err => {
        console.error(`No config found for ${hash}: ${err.message}`);
        process.disconnect();
      });
      return;
    }
    git('show', hash + ':' + pathsConfig[index], function (code, data) {
      if (code === 0 && data.trim()) {
        callback(data);
      } else {
        readConfigFromGit(hash, index + 1, callback);
      }
    });
  }

  process.on('message', function (hash) {
    git('reset', 'HEAD', '--', ['src', 'package.json'], function () {
      git('checkout', hash, '--', 'src', function () {
        git('checkout', hash, '--', 'package.json', function () {
          readConfigFromGit(hash, 0, function (data) {
            try {
              minify(hash, JSON.parse(data));
            } catch (err) {
              console.error(`Invalid JSON in config for ${hash}: ${err.message}`);
              process.disconnect();
            }
          });
        });
      });
    });
  });
}

// Exports

export {
  formatChange,
  formatResults,
  ordinal,
  parseRange
};