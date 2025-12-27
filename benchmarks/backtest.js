#!/usr/bin/env node

import { spawn, fork } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import Progress from 'progress';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default number of commits to test when no parameter is provided
const DEFAULT_COMMIT_COUNT = 50;

// Output directory for results
const OUTPUT_DIR = path.join(__dirname, 'backtest');

const urls = JSON.parse(await fs.readFile(path.join(__dirname, 'sites.json'), 'utf8'));
const fileNames = Object.keys(urls);

function git() {
  const args = [].concat.apply([], [].slice.call(arguments, 0, -1));
  const callback = arguments[arguments.length - 1];
  const task = spawn('git', args, { stdio: ['ignore', 'pipe', 'ignore'] });
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
        const data = await readText(path.join(__dirname, 'sources', fileName + '.html'));
        const startTime = performance.now();
        const minified = await minifyFn(data, getOptions(fileName, options));
        const endTime = performance.now();
        const duration = Math.round(endTime - startTime);
        if (minified) {
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

async function print(table) {
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const output = [];
  const errors = [];

  // Sort hashes by date (most recent first)
  const hashes = Object.keys(table).sort((a, b) => {
    // Fix date format: “2025-12-27 18:23:13 0100” → “2025-12-27 18:23:13 +0100”
    const dateStrA = table[a].date.replace(/\s(\d{4})$/, ' +$1');
    const dateStrB = table[b].date.replace(/\s(\d{4})$/, ' +$1');
    const dateA = new Date(dateStrA);
    const dateB = new Date(dateStrB);
    return dateB - dateA; // Descending order (newest first)
  });

  // CSV output
  let row = fileNames.slice(0);
  row.unshift('hash', 'date');
  output.push(row.join(','));
  for (const hash of hashes) {
    const data = table[hash];
    row = [hash, '"' + data.date + '"'];
    fileNames.forEach(function (fileName) {
      const sizeData = data[fileName];
      row.push(sizeData ? sizeData.size : '');
    });
    output.push(row.join(','));
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
      sites: fileNames.length,
      generated: new Date().toISOString().split('T')[0]
    },
    sites: {}
  };

  // Build per-site objects with date+hash keys
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

        // Calculate deltas from previous commit (chronologically, which is next in array)
        const prevData = index < hashes.length - 1 ? table[hashes[index + 1]][fileName] : null;
        const prevSize = prevData ? prevData.size : null;
        const prevTime = prevData ? prevData.time : null;
        const sizeDelta = prevSize ? size - prevSize : 0;
        const timeDelta = prevTime ? time - prevTime : 0;

        // Format value: “size @ time” or “size (±size%) @ time (±time%)”
        let value = `${size.toLocaleString()} @ ${time} ms`;
        if ((sizeDelta !== 0 || timeDelta !== 0) && prevSize && prevTime) {
          const sizePercent = ((sizeDelta / prevSize) * 100).toFixed(2);
          const timePercent = ((timeDelta / prevTime) * 100).toFixed(2);
          const sizeSign = sizeDelta > 0 ? '+' : '';
          const timeSign = timeDelta > 0 ? '+' : '';

          // Only show change if not 0.00%
          const sizeChange = sizePercent !== '0.00' ? ` (${sizeSign}${sizePercent}%)` : '';
          const timeChange = timePercent !== '0.00' ? ` (${timeSign}${timePercent}%)` : '';

          value = `${size.toLocaleString()}${sizeChange} @ ${time} ms${timeChange}`;
        }

        jsonOutput.sites[fileName][key] = value;
      }
    });
  });

  await writeText(path.join(OUTPUT_DIR, 'results.json'), JSON.stringify(jsonOutput, null, 2));
}

if (process.argv.length > 2 || !process.send) {
  const count = process.argv.length > 2 ? +process.argv[2] : DEFAULT_COMMIT_COUNT;
  if (count) {
    if (!process.argv[2]) {
      console.log(`Running backtest on last ${DEFAULT_COMMIT_COUNT} commits (use: "backtest.js <count>" to specify)`);
    }

    // Save current html-minifier.json to restore later
    const configPath = path.join(__dirname, 'html-minifier.json');
    let originalConfig = null;
    try {
      originalConfig = await readText(configPath);
    } catch (err) {
      // File might not exist, that’s ok
    }

    git('log', '--date=iso', '--pretty=format:%h %cd', '-' + count, async function (code, data) {
      const table = {};
      const commits = data.split(/\s*?\n/).map(function (line) {
        const index = line.indexOf(' ');
        const hash = line.substr(0, index);
        table[hash] = {
          date: line.substr(index + 1).replace('+', '').replace(/ 0000$/, '')
        };
        return hash;
      });
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
          }, 60000);
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
              await print(table);
              // Restore original html-minifier.json
              if (originalConfig) {
                try {
                  await writeText(configPath, originalConfig);
                } catch (err) {
                  console.error('Warning: Failed to restore html-minifier.json');
                }
              }
              // Restore src directory from HEAD
              git('checkout', 'HEAD', '--', 'src', function () {});
            } else {
              forkTask();
            }
          });
          task.stderr.setEncoding('utf8');
          task.stderr.on('data', function (data) {
            error += data;
          });
          task.stdout.resume();
          task.send(hash);
          running++;
        }
      }

      forkTask();
    });
  } else {
    console.error('Invalid input:', process.argv[2]);
  }
} else if (process.send) {
  // Running as forked child process
  process.on('message', function (hash) {
    const paths = ['src', 'benchmark.conf', 'html-minifier.json'];
    git('reset', 'HEAD', '--', paths, function () {
      let conf = 'html-minifier.json';

      function checkout() {
        const targetPath = paths.shift();
        git('checkout', hash, '--', targetPath, function (code) {
          if (code === 0 && targetPath === 'benchmark.conf') {
            conf = targetPath;
          }
          if (paths.length) {
            checkout();
          } else {
            readText(conf).then(data => {
              try {
                minify(hash, JSON.parse(data));
              } catch (err) {
                console.error(`Invalid JSON in ${conf}: ${err.message}`);
                process.disconnect();
              }
            }).catch(err => {
              console.error(`Failed to read ${conf}: ${err.message}`);
              process.disconnect();
            });
          }
        });
      }

      checkout();
    });
  });
}