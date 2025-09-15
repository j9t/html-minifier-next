#!/usr/bin/env node

import fs from 'fs/promises';
import zlib from 'zlib';
import https from 'https';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';

import chalk from 'chalk';
import lzma from 'lzma';
import Minimize from 'minimize';
import Progress from 'progress';
import Table from 'cli-table3';
import htmlnano from 'htmlnano';
import minifyHtmlPkg from '@minify-html/node';
const { minify: minifyHtml } = minifyHtmlPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const urls = JSON.parse(await fs.readFile(path.join(__dirname, 'sites.json'), 'utf8'));
const fileNames = Object.keys(urls);

const minimize = new Minimize();

const progress = new Progress('[:bar] :etas :fileName', {
  width: 50,
  total: fileNames.length
});

const table = new Table({
  head: ['File', 'Before', 'HTML Minifier Next', 'Minimize', 'htmlcompressor.com', 'htmlnano', 'minify-html', 'Savings', 'Time'],
  colWidths: [fileNames.reduce(function (length, fileName) {
    return Math.max(length, fileName.length);
  }, 0) + 2, 25, 25, 25, 25, 25, 25, 25, 20]
});

function toKb(size, precision) {
  return (size / 1024).toFixed(precision || 0);
}

function redSize(size) {
  return chalk.red.bold(size) + chalk.white(' (' + toKb(size, 2) + ' KB)');
}

function greenSize(size) {
  return chalk.green.bold(size) + chalk.white(' (' + toKb(size, 2) + ' KB)');
}

function blueSavings(oldSize, newSize) {
  // Handle invalid inputs
  if (!oldSize || oldSize <= 0 || typeof oldSize !== 'number') {
    return chalk.white('N/A');
  }
  if (typeof newSize !== 'number' || newSize < 0) {
    newSize = 0; // Treat invalid newSize as 0
  }

  const savingsPercent = (1 - newSize / oldSize) * 100;
  const savings = oldSize - newSize;
  return chalk.cyan.bold(savingsPercent.toFixed(2)) + chalk.white('% (' + toKb(savings, 2) + ' KB)');
}

function blueTime(time) {
  return chalk.cyan.bold(time) + chalk.white(' ms');
}

async function readBuffer(filePath) {
  return await fs.readFile(filePath);
}

async function readText(filePath) {
  return await fs.readFile(filePath, 'utf8');
}

async function writeBuffer(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

async function writeText(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data, 'utf8');
}

async function readSize(filePath) {
  const stats = await fs.stat(filePath);
  return stats.size;
}

async function gzipFile(inPath, outPath) {
  await pipeline(
    createReadStream(inPath),
    zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION }),
    createWriteStream(outPath)
  );
}

async function brotliFile(inPath, outPath) {
  await pipeline(
    createReadStream(inPath),
    zlib.createBrotliCompress(),
    createWriteStream(outPath)
  );
}

function promiseLzma(data) {
  return new Promise((resolve, reject) => {
    lzma.compress(data, 1, function (result, error) {
      if (error) reject(error);
      else resolve(Buffer.from(result));
    });
  });
}

const rows = {};

function generateMarkdownTable() {
  const headers = [
    'Site',
    'Original size (KB)',
    'HTML Minifier Next',
    'minimize',
    'html­compressor.com',
    'htmlnano',
    'minify-html'
  ];

  fileNames.forEach(function (fileName) {
    // Add a check for `rows[fileName]`
    if (!rows[fileName] || !rows[fileName].report) {
      console.error(`Skipping ${fileName}: row or report is missing`);
      return;
    }

    const row = rows[fileName].report;

    // Find the best (smallest) size among all minifiers
    // Minifier results start at index 2 (HTML Minifier Next)
    const minifierResults = [];
    for (let i = 2; i < row.length; i++) {
      const value = row[i];
      // Skip “n/a” results and parse numeric values
      if (value !== 'n/a' && value !== '<1') {
        const numericValue = parseFloat(value);
        if (!isNaN(numericValue)) {
          minifierResults.push({ index: i, value: numericValue, originalText: value });
        }
      }
    }

    if (minifierResults.length > 0) {
      // Find the minimum value
      const minValue = Math.min(...minifierResults.map(r => r.value));

      // Bold all results that equal the minimum value
      minifierResults.forEach(result => {
        if (result.value === minValue) {
          // Prevent double-bolding when regenerating README table
          if (!result.originalText.startsWith('**')) {
            row[result.index] = '**' + result.originalText + '**';
          }
        } else {
          // Remove existing bold formatting if it’s not the best result
          if (result.originalText.startsWith('**') && result.originalText.endsWith('**')) {
            row[result.index] = result.originalText.slice(2, -2);
          }
        }
      });
    }
  });

  let content = '';

  function output(row) {
    content += '| ' + row.join(' | ') + ' |\n';
  }

  output(headers);
  content += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

  fileNames.forEach(function (fileName) {
    if (!rows[fileName] || !rows[fileName].report) return; // Prevent outputting rows with missing data
    output(rows[fileName].report);
  });

  return content;
}

function displayTable() {
  fileNames.forEach(function (fileName) {
    if (rows[fileName]) { // Ensure the `fileName` exists in rows
      table.push(rows[fileName].display);
    } else {
      console.warn(`Warning: No data available for ${fileName}. Skipping.`);
    }
  });
  console.log();
  console.log(table.toString());
}

async function processFiles() {
  for (const fileName of fileNames) {
    await processFile(fileName);
  }
}

async function processFile(fileName) {
  const filePath = path.join('./sources', fileName + '.html');

  async function processFileInternal(site) {
    const original = {
      filePath: filePath,
      gzFilePath: path.join('./generated/', fileName + '.html.gz'),
      lzFilePath: path.join('./generated/', fileName + '.html.lz'),
      brFilePath: path.join('./generated/', fileName + '.html.br')
    };
    const infos = {};
    ['minifier', 'minimize', 'compressor', 'htmlnano', 'minifyhtml'].forEach(function (name) {
      infos[name] = {
        filePath: path.join('./generated/', fileName + '.' + name + '.html'),
        gzFilePath: path.join('./generated/', fileName + '.' + name + '.html.gz'),
        lzFilePath: path.join('./generated/', fileName + '.' + name + '.html.lz'),
        brFilePath: path.join('./generated/', fileName + '.' + name + '.html.br')
      };
    });

    async function readSizes(info) {
      info.endTime = Date.now();

      // Apply Gzip on minified output
      await gzipFile(info.filePath, info.gzFilePath);
      info.gzTime = Date.now();
      info.gzSize = await readSize(info.gzFilePath);

      // Apply LZMA on minified output
      const data = await readBuffer(info.filePath);
      const lzmaResult = await promiseLzma(data);
      await writeBuffer(info.lzFilePath, lzmaResult);
      info.lzTime = Date.now();
      info.lzSize = await readSize(info.lzFilePath);

      // Apply Brotli on minified output
      await brotliFile(info.filePath, info.brFilePath);
      info.brTime = Date.now();
      info.brSize = await readSize(info.brFilePath);

      // Read the size of the minified output
      info.size = await readSize(info.filePath);
    }

    // HTML Minifier Next
    async function testHTMLMinifier() {
      const info = infos.minifier;
      info.startTime = Date.now();
      const configPath = path.join(__dirname, 'html-minifier-benchmarks.json');
      const args = [filePath, '-c', configPath, '--minify-urls', site, '-o', info.filePath];

      return new Promise((resolve, reject) => {
        const child = fork(path.join(__dirname, '../cli.js'), args);
        let timeoutId;

        // Set timeout for CLI process (30 seconds)
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error(`HTML Minifier CLI timed out after 30 seconds for ${fileName}`));
        }, 30000);

        child.on('exit', async function (code, signal) {
          clearTimeout(timeoutId);

          if (code !== 0) {
            reject(new Error(`HTML Minifier CLI failed with exit code ${code}${signal ? ` (signal: ${signal})` : ''} for ${fileName}`));
            return;
          }

          try {
            await readSizes(info);
            resolve();
          } catch (error) {
            reject(new Error(`Failed to read sizes after HTML Minifier processing ${fileName}: ${error.message}`));
          }
        });

        child.on('error', function (error) {
          clearTimeout(timeoutId);
          reject(new Error(`HTML Minifier CLI process error for ${fileName}: ${error.message}`));
        });
      });
    }

    // Minimize, https://github.com/Swaagie/minimize
    async function testMinimize() {
      const data = await readBuffer(filePath);
      return new Promise((resolve, reject) => {
        minimize.parse(data, function (err, data) {
          if (err) {
            return reject(new Error(`Minimize failed for ${fileName}: ${err.message}`));
          }

          const info = infos.minimize;

          Promise.resolve()
            .then(() => writeBuffer(info.filePath, data))
            .then(() => readSizes(info))
            .then(() => resolve())
            .catch(error => reject(new Error(`Failed after minimize processing ${fileName}: ${error.message}`)));
        });
      });
    }

    // htmlcompressor.com, https://htmlcompressor.com/api/#:~:text=HTMLCompressor%20API%20reference
    async function testHTMLCompressor() {
      const data = await readText(filePath);
      const url = new URL('https://htmlcompressor.com/compress');
      const options = {
        method: 'POST',
        headers: {
          'Accept-Encoding': 'gzip',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      };

      let info = infos.compressor;

      function failed() {
        // Site refused to process content
        if (info) {
          info.size = 0;
          info.gzSize = 0;
          info.lzSize = 0;
          info.brSize = 0;
          info = null;
        }
      }

      return new Promise((resolve) => {
        const request = https.request(url, options, function (res) {
          // Check HTTP status code
          if (res.statusCode < 200 || res.statusCode >= 300) {
            console.warn(`htmlcompressor.com failed for ${fileName}: HTTP ${res.statusCode}`);
            failed();
            resolve();
            return;
          }

          // Validate content type for better response parsing
          const contentType = res.headers['content-type'] || '';
          const isJson = contentType.includes('application/json');

          if (res.headers['content-encoding'] === 'gzip') {
            res = res.pipe(zlib.createGunzip());
          }
          res.setEncoding('utf8');
          let response = '';
          res.on('data', function (chunk) {
            response += chunk;
          }).on('end', async function () {
            let compressedContent = '';
            let isSuccess = false;

            // Parse response based on content-type
            if (isJson) {
              // Try to parse as JSON first (old API format)
              try {
                const jsonResponse = JSON.parse(response);
                if (jsonResponse.success && jsonResponse.result) {
                  compressedContent = jsonResponse.result;
                  isSuccess = true;
                }
              } catch (e) {
                console.warn('Failed to parse JSON response from htmlcompressor.com');
              }
            } else {
              // Treat as direct text response (new API format)
              // Compare byte lengths instead of string lengths for accuracy
              const responseBytes = Buffer.byteLength(response, 'utf8');
              const originalBytes = Buffer.byteLength(data, 'utf8');

              if (response && response.length > 0 && response.includes('<') && responseBytes < originalBytes) {
                compressedContent = response;
                isSuccess = true;
              }
            }

            if (info && isSuccess && compressedContent) {
              await writeText(info.filePath, compressedContent);
              await readSizes(info);
            } else { // Site refused to process content or returned error
              failed();
            }
            resolve();
          });
        });

        // Set request timeout (15 seconds)
        request.setTimeout(15000, function() {
          console.warn(`htmlcompressor.com timed out for ${fileName}`);
          request.destroy();
          failed();
          resolve();
        });

        request.on('error', (err) => {
          console.warn(`htmlcompressor.com error for ${fileName}: ${err.message}`);
          failed();
          resolve();
        }).end(new URLSearchParams({
          code_type: 'html',
          html_level: 3,
          html_single_line: 1,
          html_strip_quotes: 1,
          minimize_style: 1,
          minimize_events: 1,
          minimize_js_href: 1,
          minimize_css: 1,
          minimize_js: 1,
          html_optional_cdata: 1,
          js_engine: 'yui',
          js_fallback: 1,
          code: data
        }).toString());
      });
    }

    // htmlnano, https://htmlnano.netlify.app/presets
    async function testhtmlnano() {
      const data = await readText(filePath);
      const info = infos.htmlnano;

      try {
        const result = await htmlnano.process(data, {}, htmlnano.presets.max);
        await writeText(info.filePath, result.html);
        await readSizes(info);
      } catch (e) {
        console.warn(`htmlnano failed for ${fileName}: ${e.message}`);
        info.size = 0;
        info.gzSize = 0;
        info.lzSize = 0;
        info.brSize = 0;
      }
    }

    // minify-html, https://github.com/wilsonzlin/minify-html
    async function testMinifyHTML() {
      const data = await readBuffer(filePath);
      const info = infos.minifyhtml;

      try {
        const result = minifyHtml(data, {
          keep_closing_tags: false,
          keep_comments: false,
          keep_html_and_head_opening_tags: false,
          keep_input_type_text_attr: false,
          keep_ssi_comments: false,
          minify_css: true,
          minify_js: true, // Disable if Rust panics get too frequent
          preserve_brace_template_syntax: false,
          preserve_chevron_percent_template_syntax: false,
          remove_bangs: true,
          remove_processing_instructions: true,
          // Excluded invalidating options:
          // allow_noncompliant_unquoted_attribute_values
          // allow_optimal_entities
          // allow_removing_spaces_between_attributes
          // minify_doctype
        });
        await writeBuffer(info.filePath, result);
        await readSizes(info);
      } catch (e) {
        console.warn(`minify-html failed for ${fileName}:`, e.message);
        info.size = 0;
        info.gzSize = 0;
        info.lzSize = 0;
        info.brSize = 0;
      }
    }

    await readSizes(original);
    await testHTMLMinifier();
    await testMinimize();
    await testHTMLCompressor();
    await testhtmlnano();
    await testMinifyHTML();

    const display = [
      [fileName, '+ gzip', '+ lzma', '+ brotli'].join('\n'),
      [redSize(original.size), redSize(original.gzSize), redSize(original.lzSize), redSize(original.brSize)].join('\n')
    ];
    const report = [
      '[' + fileName + '](' + urls[fileName] + ')',
      toKb(original.size)
    ];
    for (const name in infos) {
      const info = infos[name];
      display.push([greenSize(info.size), greenSize(info.gzSize), greenSize(info.lzSize), greenSize(info.brSize)].join('\n'));
      // Use raw bytes to determine display logic
      if (info.size == null || info.size === undefined) {
        report.push('n/a');
      } else if (info.size === 0) {
        report.push('n/a'); // 0 bytes = failed/no output
      } else if (info.size < 1024) {
        report.push('<1'); // Sub-1KB files
      } else {
        report.push(toKb(info.size)); // 1KB+ files
      }
    }
    display.push(
      [
        blueSavings(original.size, infos.minifier.size),
        blueSavings(original.gzSize, infos.minifier.gzSize),
        blueSavings(original.lzSize, infos.minifier.lzSize),
        blueSavings(original.brSize, infos.minifier.brSize)
      ].join('\n'),
      [
        blueTime(infos.minifier.endTime - infos.minifier.startTime),
        blueTime(infos.minifier.gzTime - infos.minifier.endTime),
        blueTime(infos.minifier.lzTime - infos.minifier.gzTime),
        blueTime(infos.minifier.brTime - infos.minifier.lzTime)
      ].join('\n')
    );
    rows[fileName] = {
      display: display,
      report: report
    };
    progress.tick({ fileName: '' });
  }

  async function get(site) {
    const url = new URL(site);

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    return new Promise((resolve) => {
      let resolved = false;

      function safeResolve(value) {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      }

      const request = https.get(url, function (res) {
        const status = res.statusCode;

        if (status === 200) {
          let stream = res;
          let gunzipStream = null;

          // Handle gzip compression
          if (res.headers['content-encoding'] === 'gzip') {
            gunzipStream = zlib.createGunzip();
            stream = res.pipe(gunzipStream);

            gunzipStream.on('error', function (err) {
              console.error(`Gunzip error for ${site}: ${err.message}`);
              safeResolve(null);
            });
          }

          const writeStream = createWriteStream(filePath);

          // Handle all possible stream errors
          res.on('error', function (err) {
            console.error(`Response stream error for ${site}: ${err.message}`);
            safeResolve(null);
          });

          writeStream.on('error', function (err) {
            console.error(`Write stream error for ${site}: ${err.message}`);
            safeResolve(null);
          });

          writeStream.on('finish', function () {
            safeResolve(site);
          });

          writeStream.on('close', function () {
            // Ensure cleanup if stream closes without finish
            if (!resolved) {
              safeResolve(null);
            }
          });

          stream.pipe(writeStream);

        } else if (status >= 300 && status < 400 && res.headers.location) {
          res.resume(); // Consume response to free memory
          get(new URL(res.headers.location, site)).then(safeResolve);
        } else {
          console.warn(`Warning: HTTP error ${status} for ${site}`);
          res.resume(); // Consume response to free memory
          safeResolve(null);
        }
      });

      // Set request timeout (30 seconds)
      request.setTimeout(30000, function() {
        console.warn(`Request timeout for ${site}`);
        request.destroy();
        safeResolve(null);
      });

      request.on('error', function (err) {
        console.error(`Error: Failed to fetch ${site} - ${err.message}`);
        safeResolve(null);
      });
    });
  }

  progress.tick(0, { fileName: fileName });
  const site = await get(urls[fileName]);
  if (!site) {
    console.warn(`Skipping ${fileName} due to download failure.`);
    rows[fileName] = null; // Explicitly mark as skipped
    return;
  }
  await processFileInternal(site);
}

await processFiles();

displayTable();
const content = generateMarkdownTable();
const readme = '../README.md';
const data = await readText(readme);
let start = data.indexOf('## Minification comparison');
start = data.indexOf('|', start);
let end = data.indexOf('##', start);
end = data.lastIndexOf('|\n', end) + '|\n'.length;
const newData = data.slice(0, start) + content + data.slice(end);
await writeText(readme, newData);