#!/usr/bin/env node

import { spawn, fork } from 'child_process';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import https from 'https';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';
import Progress from 'progress';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..');

// Default number of commits to test when no parameter is provided
const DEFAULT_COMMIT_COUNT = 50;

// Timeout per commit in milliseconds (increase if testing large files with slow minification)
const TASK_TIMEOUT_MS = 60000;

// Output directory for results
const OUTPUT_DIR = __dirname;

const urls = JSON.parse(await fs.readFile(path.join(__dirname, 'sites.json'), 'utf8'));
const fileNames = Object.keys(urls);
const inputDir = path.join(__dirname, 'input');

async function downloadFile(url, filePath) {
  return new Promise((resolve) => {
    let resolved = false;
    function safeResolve(value) {
      if (!resolved) {
        resolved = true;
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

        const writeStream = createWriteStream(filePath);
        stream.on('error', () => safeResolve(false));
        writeStream.on('error', () => safeResolve(false));
        writeStream.on('finish', () => safeResolve(true));
        stream.pipe(writeStream);
      } else if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        downloadFile(new URL(res.headers.location, url).href, filePath).then(safeResolve);
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
  const rootNodeModules = path.join(repoRoot, 'node_modules');
  const missing = [];
  for (const dep of historicalDeps) {
    try {
      await fs.stat(path.join(rootNodeModules, dep));
    } catch {
      missing.push(dep);
    }
  }
  if (missing.length === 0) return;

  console.log(`Installing ${missing.length} historical dependency(ies)…`);
  await new Promise((resolve, reject) => {
    const proc = spawn('npm', ['install', '--no-save', ...missing], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
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

async function ensureInput() {
  await fs.mkdir(inputDir, { recursive: true });

  const missing = [];
  for (const fileName of fileNames) {
    const filePath = path.join(inputDir, fileName + '.html');
    try {
      await fs.stat(filePath);
    } catch {
      missing.push(fileName);
    }
  }

  if (missing.length === 0) return;

  console.log(`Downloading ${missing.length} source file(s)…`);
  const progress = new Progress('[:bar] :current/:total :etas', {
    width: 40,
    total: missing.length
  });

  for (const fileName of missing) {
    const filePath = path.join(inputDir, fileName + '.html');
    const ok = await downloadFile(urls[fileName], filePath);
    if (!ok) {
      console.error(`Failed to download ${fileName} from ${urls[fileName]}`);
    }
    progress.tick();
  }
}

function git() {
  const args = [].concat.apply([], [].slice.call(arguments, 0, -1));
  const callback = arguments[arguments.length - 1];
  const task = spawn('git', args, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] });
  let output = '';
  task.stdout.setEncoding('utf8');
  task.stdout.on('data', function (data) {
    output += data;
  });
  task.on('exit', function (code) {
    callback(code, output);
  });
}

async function readText(filePath) {
  return await fs.readFile(filePath, 'utf8');
}

async function writeText(filePath, data) {
  await fs.writeFile(filePath, data, 'utf8');
}

async function loadModule() {
  const { minify } = await import('../src/htmlminifier.js');
  return minify || global.minify;
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
        const filePath = path.join(inputDir, fileName + '.html');

        try {
          await fs.stat(filePath);
        } catch {
          throw new Error(`Source file not found: "${fileName}.html"`);
        }

        const data = await readText(filePath);
        const startTime = performance.now();
        const minified = await minifyFn(data, getOptions(fileName, options));
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        if (minified != null) {
          process.send({ name: fileName, size: minified.length, time: duration });
        } else {
          throw new Error('unexpected result: ' + minified);
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

async function print(table, step = 1) {
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const output = [];
  const errors = [];

  // Sort hashes by date (most recent first)
  const hashes = Object.keys(table).sort((a, b) => {
    // Parse ISO dates directly from Git (format: “2025-12-27 18:23:13 +0100”)
    const dateA = new Date(table[a].date);
    const dateB = new Date(table[b].date);
    return dateB - dateA; // Descending order (newest first)
  });

  // CSV output
  let row = fileNames.slice(0);
  row.unshift('hash', 'date');
  output.push(row.join(','));
  for (const hash of hashes) {
    const data = table[hash];
    row = [hash, '"' + data.date + '"'];
    let hasData = false;
    fileNames.forEach(function (fileName) {
      const sizeData = data[fileName];
      row.push(sizeData ? sizeData.size : '');
      if (sizeData) {
        hasData = true;
      }
    });
    // Only include rows that have at least one data point
    if (hasData) {
      output.push(row.join(','));
    }
    if (data.error) {
      errors.push(hash + ' - ' + data.error);
    }
  }
  await writeText(path.join(OUTPUT_DIR, 'results.csv'), output.join('\n'));

  // Only write errors.log if there are errors
  const errorsPath = path.join(OUTPUT_DIR, 'errors.log');
  if (errors.length > 0) {
    await writeText(errorsPath, errors.join('\n'));
  } else {
    // Delete errors.log if it exists and is empty/not needed
    try {
      await fs.unlink(errorsPath);
    } catch (err) {
      // Ignore if file doesn’t exist
    }
  }

  // JSON output—compact and readable format
  const jsonOutput = {
    summary: {
      commits: hashes.length,
      step: step,
      sites: fileNames.length,
      generated: new Date().toISOString().split('T')[0]
    },
    sites: {}
  };

  // Use consistent number formatting for JSON (locale-independent)
  const formatNumber = new Intl.NumberFormat('en-US').format;

  // Build per-site objects with date and hash keys
  fileNames.forEach(fileName => {
    jsonOutput.sites[fileName] = {};

    hashes.forEach((hash, index) => {
      const data = table[hash];
      const sizeData = data[fileName];

      if (sizeData) {
        const { size, time } = sizeData;
        // Format: “YYYY-MM-DD HH:MM hash”
        const dateShort = data.date.substring(0, 16); // “2025-12-27 18:23”
        const key = `${dateShort} ${hash}`;

        // Calculate deltas comparing to the entry displayed below (index + 1, chronologically older)
        // This shows how the commit performs compared to the older one below it
        let prevData = null;
        for (let i = index + 1; i < hashes.length; i++) {
          const candidateData = table[hashes[i]][fileName];
          if (candidateData) {
            prevData = candidateData;
            break;
          }
        }

        const prevSize = prevData ? prevData.size : null;
        const prevTime = prevData ? prevData.time : null;
        const sizeDelta = prevSize ? size - prevSize : 0;
        const timeDelta = prevTime ? time - prevTime : 0;

        // Format value: “size @ time” or “size (±size%) @ time (±time%)”
        let value = `${formatNumber(size)} @ ${time} ms`;
        if ((sizeDelta !== 0 || timeDelta !== 0) && prevSize && prevTime) {
          const sizePercent = ((sizeDelta / prevSize) * 100).toFixed(2);
          const timePercent = ((timeDelta / prevTime) * 100).toFixed(2);
          const sizeSign = sizeDelta > 0 ? '+' : '';
          const timeSign = timeDelta > 0 ? '+' : '';

          // Only show change if not 0.00%
          const sizeChange = sizePercent !== '0.00' ? ` (${sizeSign}${sizePercent}%)` : '';
          const timeChange = timePercent !== '0.00' ? ` (${timeSign}${timePercent}%)` : '';

          value = `${formatNumber(size)}${sizeChange} @ ${time} ms${timeChange}`;
        }

        jsonOutput.sites[fileName][key] = value;
      }
    });
  });

  await writeText(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify(jsonOutput, null, 2));
}

if (process.argv.length > 2 || !process.send) {
  let count = DEFAULT_COMMIT_COUNT;
  let step = 1;

  if (process.argv.length > 2) {
    const arg = process.argv[2];

    // Parse “COUNT/STEP” or just “COUNT”
    if (arg.includes('/')) {
      const parts = arg.split('/');
      if (parts.length !== 2) {
        console.error(`Error: Invalid format “${arg}”—use “COUNT” or “COUNT/STEP”`);
        console.error(`Examples: “backtest.js 50” or “backtest.js 500/10”`);
        process.exit(1);
      }

      count = parseInt(parts[0], 10);
      step = parseInt(parts[1], 10);

      if (!Number.isInteger(count) || count < 1) {
        console.error(`Error: Invalid commit count “${parts[0]}”—must be a positive integer`);
        process.exit(1);
      }
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Error: Invalid step “${parts[1]}”—must be a positive integer`);
        process.exit(1);
      }
    } else {
      count = parseInt(arg, 10);
      if (!Number.isInteger(count) || count < 1) {
        console.error(`Error: Invalid commit count “${arg}”—must be a positive integer`);
        console.error(`Example: “backtest.js 50”`);
        process.exit(1);
      }
    }
  } else {
    console.log(`Running backtest on last ${DEFAULT_COMMIT_COUNT} commits (use: “backtest.js COUNT” to specify)`);
  }

  if (count > 0) {

    // Check for uncommitted changes in files the backtest temporarily modifies
    const srcPath = path.join(__dirname, '..', 'src');
    const configPath = path.join(__dirname, 'html-minifier.json');
    const pkgPath = path.join(repoRoot, 'package.json');
    git('status', '--porcelain', '--', srcPath, configPath, pkgPath, async function (code, output) {
      if (output.trim().length > 0) {
        console.error('Error: Uncommitted changes detected in src, package.json, or html-minifier.json');
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
        // Generate proper ordinal suffix (1st, 2nd, 3rd, 4th, etc.)
        const getOrdinal = (n) => {
          const s = ['th', 'st', 'nd', 'rd'];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };
        const actualTests = Math.ceil(count / step);
        console.log(`Testing last ${count} commits, sampling every ${getOrdinal(step)} commit (${actualTests} tests)`);
      }

      // Clean-up function to restore files on exit/error
      let cleanupCalled = false;
      const cleanup = async function (reason) {
        if (cleanupCalled) return;
        cleanupCalled = true;

        if (reason) {
          console.log(`\nCleaning up after ${reason}…`);
        }

        // Restore “src” folder, package.json, and html-minifier.json from HEAD using Git
        await new Promise((resolve) => {
          const srcPath = path.join(__dirname, '..', 'src');
          const configPath = path.join(__dirname, 'html-minifier.json');
          const pkgPath = path.join(repoRoot, 'package.json');
          git('checkout', 'HEAD', '--', srcPath, configPath, pkgPath, function (code) {
            if (code !== 0) {
              console.error('Warning: Failed to restore modified files');
            }
            // Remove stale files that old commits added but HEAD doesn’t have
            git('reset', 'HEAD', '--', srcPath, function () {
              git('clean', '-fd', srcPath, function () {
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

      git('log', '--date=iso', '--pretty=format:%h %cd', '-' + count, async function (code, data) {
      const table = {};
      let commits = data.split(/\s*?\n/).map(function (line) {
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
              table[hash][data.name] = { size: data.size, time: data.time };
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
} else if (process.send) {
  // Running as forked child process

  // Config file paths (repo-root-relative), ordered newest to oldest
  const configPaths = [
    'backtest/html-minifier.json',
    'benchmarks/html-minifier.json',
    'benchmarks/html-minifier-benchmarks.json',
    'benchmark.conf'
  ];

  function readConfigFromGit(hash, index, callback) {
    if (index >= configPaths.length) {
      // Fallback to current config file on disk
      readText(path.join(__dirname, 'html-minifier.json')).then(callback).catch(err => {
        console.error(`No config found for ${hash}: ${err.message}`);
        process.disconnect();
      });
      return;
    }
    git('show', hash + ':' + configPaths[index], function (code, data) {
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