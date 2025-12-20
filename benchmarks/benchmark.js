#!/usr/bin/env node

import fs from 'fs/promises';
import zlib from 'zlib';
import https from 'https';
import path from 'path';
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { styleText } from 'node:util';
import lzma from 'lzma';
import Minimize from 'minimize';
import Progress from 'progress';
import Table from 'cli-table3';
import htmlnano from 'htmlnano';
import { minify as minifySWC } from '@swc/html';
import minifyHTMLPkg from '@minify-html/node';

const { minify: minifyHTML } = minifyHTMLPkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure required directories exist for fresh runs
await fs.mkdir(path.join(__dirname, 'generated'), { recursive: true });
await fs.mkdir(path.join(__dirname, 'sources'), { recursive: true });

const user_agent = 'html-minifier-next-benchmarks/0.0';
const urls = JSON.parse(await fs.readFile(path.join(__dirname, 'sites.json'), 'utf8'));
const fileNames = Object.keys(urls);
const minifierConfig = JSON.parse(await fs.readFile(path.join(__dirname, 'html-minifier.json'), 'utf8'));
const minimize = new Minimize();
const benchmarkErrors = [];

// Verbose logging flag (run via `VERBOSE=true npm run benchmarks`)
const VERBOSE = process.env.VERBOSE === 'true';
function log(message) {
  if (VERBOSE) {
    console.error(`[DEBUG] ${message}`);
  }
}

const progress = new Progress(':current/:total [:bar] :percent :etas :fileName', {
  width: 40,
  total: fileNames.length,
  complete: '=',
  incomplete: '-',
  clear: !VERBOSE,
  stream: process.stderr
});

// Timeout for HTML Minifier runs (ms)
const TEST_TIMEOUT = 30000;

// Concurrency for site processing
// Default to 1 (sequential) for accurate per-minifier performance comparison
// Set `BENCH_CONCURRENCY=6` for faster parallel execution (may show CPU contention)
const BENCH_CONCURRENCY = Math.max(1, parseInt(process.env.BENCH_CONCURRENCY || '1', 10) || 1);

const table = new Table({
  head: ['File', 'Before', 'HTML Minifier Next', 'HTML Minifier Terser', 'htmlnano', '@swc/html', 'minify-html', 'Minimize', 'htmlcompressor.com', 'Savings', 'Time'],
  colWidths: [fileNames.reduce(function (length, fileName) {
    return Math.max(length, fileName.length);
  }, 0) + 2, 25, 25, 25, 25, 25, 25, 25, 25, 25, 20]
});

function toKb(size, precision) {
  return (size / 1024).toFixed(precision || 0);
}

function redSize(size) {
  return styleText(['red', 'bold'], String(size)) + styleText(['white'], ' (' + toKb(size, 2) + ' KB)');
}

function greenSize(size) {
  // Only accept valid positive numbers
  if (typeof size === 'number' && size > 0) {
    return styleText(['green', 'bold'], String(size)) + styleText(['white'], ' (' + toKb(size, 2) + ' KB)');
  }
  return styleText(['white'], 'n/a');
}

function blueSavings(oldSize, newSize) {
  // Only calculate savings when both inputs are valid positive numbers
  if (typeof oldSize === 'number' && oldSize > 0 && typeof newSize === 'number' && newSize > 0) {
    const savingsPercent = (1 - newSize / oldSize) * 100;
    const savings = oldSize - newSize;
    return styleText(['cyan', 'bold'], savingsPercent.toFixed(2)) + styleText(['white'], '% (' + toKb(savings, 2) + ' KB)');
  }
  return styleText(['white'], 'n/a');
}

function blueTime(time) {
  // Only accept valid non-negative numbers
  if (typeof time === 'number' && !isNaN(time) && time >= 0) {
    return styleText(['cyan', 'bold'], String(time)) + styleText(['white'], ' ms');
  }
  return styleText(['white'], 'n/a');
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
const totalTimes = {
  minifier: 0,
  minifierterser: 0,
  htmlnano: 0,
  swchtml: 0,
  minifyhtml: 0,
  minimize: 0,
  compressor: 0
};
const successCounts = {
  minifier: 0,
  minifierterser: 0,
  htmlnano: 0,
  swchtml: 0,
  minifyhtml: 0,
  minimize: 0,
  compressor: 0
};

function generateMarkdownTable() {
  const headers = [
    'Site',
    'Original Size (KB)',
    '[HTML Minifier Next](https://github.com/j9t/html-minifier-next) ([config](https://github.com/j9t/html-minifier-next/blob/main/benchmarks/html-minifier.json))<br>[![npm last update](https://img.shields.io/npm/last-update/html-minifier-next)](https://socket.dev/npm/package/html-minifier-next)',
    '[HTML Minifier Terser](https://github.com/terser/html-minifier-terser)<br>[![npm last update](https://img.shields.io/npm/last-update/html-minifier-terser)](https://socket.dev/npm/package/html-minifier-terser)',
    '[htmlnano](https://github.com/posthtml/htmlnano)<br>[![npm last update](https://img.shields.io/npm/last-update/htmlnano)](https://socket.dev/npm/package/htmlnano)',
    '[@swc/html](https://github.com/swc-project/swc)<br>[![npm last update](https://img.shields.io/npm/last-update/@swc/html)](https://socket.dev/npm/package/@swc/html)',
    '[minify-html](https://github.com/wilsonzlin/minify-html)<br>[![npm last update](https://img.shields.io/npm/last-update/@minify-html/node)](https://socket.dev/npm/package/@minify-html/node)',
    '[minimize](https://github.com/Swaagie/minimize)<br>[![npm last update](https://img.shields.io/npm/last-update/minimize)](https://socket.dev/npm/package/minimize)',
    '[html­com­pressor.­com](https://htmlcompressor.com/)'
  ];

  fileNames.forEach(function (fileName) {
    // Add a check for `rows[fileName]`
    if (!rows[fileName] || !rows[fileName].report) {
      benchmarkErrors.push(`Skipping ${fileName}: row or report is missing`);
      return;
    }

    const row = rows[fileName].report;

    // Find the best (smallest) size among all minifiers
    // Minifier results start at index 2 (HTML Minifier Next)
    const minifierResults = [];
    for (let i = 2; i < row.length; i++) {
      const raw = row[i];
      // Skip non-numeric markers
      if (raw === 'n/a' || raw === '<1') continue;

      const numericValue = parseFloat(raw);
      if (!Number.isNaN(numericValue)) {
        minifierResults.push({ index: i, value: numericValue });
      }
    }

    if (minifierResults.length > 0) {
      // Find and store indices of cells with minimum value
      const minValue = Math.min(...minifierResults.map(r => r.value));
      rows[fileName].boldIndices = new Set(
        minifierResults.filter(r => r.value === minValue).map(r => r.index)
      );
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
    const row = rows[fileName].report;
    const boldIndices = rows[fileName].boldIndices;
    // Apply bold formatting during output without modifying original data
    const formattedRow = row.map((cell, i) => boldIndices?.has(i) ? `**${cell}**` : cell);
    output(formattedRow);
  });

  // Add average processing time row
  const timeRow = ['**Average processing time**', ''];
  const minifierNames = ['minifier', 'minifierterser', 'htmlnano', 'swchtml', 'minifyhtml', 'minimize', 'compressor'];

  // Count only sites that were actually processed (not skipped due to download failure)
  const processedSites = fileNames.filter(name => rows[name] && rows[name].report).length;

  // Calculate averages and find fastest
  const averages = {};
  let fastestAvg = null;
  minifierNames.forEach(function (name) {
    const successCount = successCounts[name];
    if (successCount > 0) {
      averages[name] = totalTimes[name] / successCount;
      // Find the fastest average across all tools that succeeded on at least one site
      if (fastestAvg === null || averages[name] < fastestAvg) {
        fastestAvg = averages[name];
      }
    }
  });

  minifierNames.forEach(function (name) {
    const successCount = successCounts[name];
    if (successCount > 0) {
      const avgTime = Math.round(averages[name]);
      const display = avgTime + ' ms (' + successCount + '/' + processedSites + ')';
      // Bold if this is the fastest average
      if (fastestAvg !== null && averages[name] === fastestAvg) {
        timeRow.push('**' + display + '**');
      } else {
        timeRow.push(display);
      }
    } else {
      timeRow.push('n/a');
    }
  });
  output(timeRow);

  return content;
}

function displayTable() {
  fileNames.forEach(function (fileName) {
    if (rows[fileName]) { // Ensure the `fileName` exists in rows
      table.push(rows[fileName].display);
    } else {
      benchmarkErrors.push(`No data available for ${fileName}. Skipping.`);
    }
  });

  // Add average processing time row
  const timeRow = ['Average processing time', ''];
  const minifierNames = ['minifier', 'minifierterser', 'htmlnano', 'swchtml', 'minifyhtml', 'minimize', 'compressor'];

  // Count only sites that were actually processed (not skipped due to download failure)
  const processedSites = fileNames.filter(name => rows[name]).length;

  minifierNames.forEach(function (name) {
    const successCount = successCounts[name];
    if (successCount > 0) {
      const avgTime = Math.round(totalTimes[name] / successCount);
      const display = styleText(['cyan', 'bold'], String(avgTime)) +
                      styleText(['white'], ' ms (' + successCount + '/' + processedSites + ')');
      timeRow.push(display);
    } else {
      timeRow.push(styleText(['white'], 'n/a'));
    }
  });
  timeRow.push('', '');
  table.push(timeRow);

  console.log();
  console.log(table.toString());
}

async function processFiles() {
  // Generator that yields file names to process
  function* fileNameGenerator() {
    for (const name of fileNames) {
      yield name;
    }
  }

  const generator = fileNameGenerator();

  // Thread-safe (single-threaded JS) function to get next file name
  // Returns undefined when all files have been assigned
  function getNextFile() {
    const next = generator.next();
    return next.done ? undefined : next.value;
  }

  async function worker() {
    while (true) {
      const name = getNextFile();
      if (name === undefined) break;
      try {
        await processFile(name);
      } catch (err) {
        benchmarkErrors.push(`Unhandled error processing ${name}: ${err?.message || err}`);
      }
    }
  }

  const workers = Array.from({ length: Math.min(BENCH_CONCURRENCY, fileNames.length) }, () => worker());
  await Promise.all(workers);
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
    ['minifier', 'minifierterser', 'htmlnano', 'swchtml', 'minifyhtml', 'minimize', 'compressor'].forEach(function (name) {
      infos[name] = {
        filePath: path.join('./generated/', fileName + '.' + name + '.html'),
        gzFilePath: path.join('./generated/', fileName + '.' + name + '.html.gz'),
        lzFilePath: path.join('./generated/', fileName + '.' + name + '.html.lz'),
        brFilePath: path.join('./generated/', fileName + '.' + name + '.html.br')
      };
    });

    function resetSizes(info) {
      info.size = 0;
      info.gzSize = 0;
      info.lzSize = 0;
      info.brSize = 0;
    }

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
      const configPath = path.join(__dirname, 'html-minifier.json');
      // Pass site URL via CLI (not config) since each test uses a different base URL
      const args = [filePath, '-c', configPath, '--minify-urls', site, '-o', info.filePath];

      return new Promise((resolve) => {
        const child = fork(path.join(__dirname, '../cli.js'), args);
        let timeoutId;

        // Set timeout for CLI process
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          benchmarkErrors.push(`HTML Minifier CLI timed out after ${TEST_TIMEOUT / 1000} seconds for ${fileName}`);
          resetSizes(info);
          resolve();
        }, TEST_TIMEOUT);

        child.on('exit', async function (code, signal) {
          clearTimeout(timeoutId);

          if (code !== 0) {
            benchmarkErrors.push(`HTML Minifier CLI failed with exit code ${code}${signal ? ` (signal: ${signal})` : ''} for ${fileName}`);
            resetSizes(info);
            resolve();
            return;
          }

          try {
            await readSizes(info);
            resolve();
          } catch (err) {
            benchmarkErrors.push(`Failed to read sizes after HTML Minifier processing ${fileName}: ${err.message}`);
            resetSizes(info);
            resolve();
          }
        });

        child.on('error', function (error) {
          clearTimeout(timeoutId);
          benchmarkErrors.push(`HTML Minifier CLI process error for ${fileName}: ${error.message}`);
          resetSizes(info);
          resolve();
        });
      });
    }

    // HTML Minifier Terser (run in separate process for timeout support)
    async function testHTMLMinifierTerser() {
      const info = infos.minifierterser;
      info.startTime = Date.now();
      const configPath = path.join(__dirname, 'html-minifier-terser.json');
      // Pass site URL via CLI (not config) since each test uses a different base URL
      const args = [filePath, '-c', configPath, '--minify-urls', site, '-o', info.filePath];

      return new Promise((resolve) => {
        const child = fork(path.join(__dirname, 'node_modules/html-minifier-terser/cli.js'), args);
        let timeoutId;

        // Set timeout for CLI process
        timeoutId = setTimeout(() => {
          child.kill('SIGTERM');
          benchmarkErrors.push(`HTML Minifier Terser timed out after ${TEST_TIMEOUT / 1000} seconds for ${fileName}`);
          resetSizes(info);
          resolve();
        }, TEST_TIMEOUT);

        child.on('exit', async function (code, signal) {
          clearTimeout(timeoutId);

          if (code !== 0) {
            benchmarkErrors.push(`HTML Minifier Terser failed with exit code ${code}${signal ? ` (signal: ${signal})` : ''} for ${fileName}`);
            resetSizes(info);
            resolve();
            return;
          }

          try {
            await readSizes(info);
            resolve();
          } catch (err) {
            benchmarkErrors.push(`Failed to read sizes after HTML Minifier Terser processing ${fileName}: ${err.message}`);
            resetSizes(info);
            resolve();
          }
        });

        child.on('error', function (error) {
          clearTimeout(timeoutId);
          benchmarkErrors.push(`HTML Minifier Terser process error for ${fileName}: ${error.message}`);
          resetSizes(info);
          resolve();
        });
      });
    }

    // htmlnano, https://htmlnano.netlify.app/presets
    async function testhtmlnano() {
      const data = await readText(filePath);
      const info = infos.htmlnano;
      info.startTime = Date.now();

      try {
        const result = await htmlnano.process(data, {}, htmlnano.presets.max);
        await writeText(info.filePath, result.html);
        await readSizes(info);
      } catch (err) {
        benchmarkErrors.push(`htmlnano failed for ${fileName}: ${err.message}`);
        resetSizes(info);
      }
    }

    // @swc/html, https://swc.rs/docs/usage/html
    async function testSWCHTML() {
      const data = await readText(filePath);
      const info = infos.swchtml;
      info.startTime = Date.now();

      try {
        const result = await minifySWC(data, {
          // Use most aggressive settings that keep HTML valid
          minify_js: true,
          minify_css: true,
          collapseWhitespaces: 'all',
          remove_comments: true,
          remove_empty_attributes: true,
          remove_redundant_attributes: true,
          collapse_boolean_attributes: true,
          normalize_attributes: true,
          remove_empty_metadata_elements: true,
          minify_conditional_comments: true
        });
        await writeText(info.filePath, result.code);
        await readSizes(info);
      } catch (err) {
        benchmarkErrors.push(`@swc/html failed for ${fileName}: ${err.message}`);
        resetSizes(info);
      }
    }

    // minify-html, https://github.com/wilsonzlin/minify-html
    async function testMinifyHTML() {
      const data = await readBuffer(filePath);
      const info = infos.minifyhtml;
      info.startTime = Date.now();

      try {
        const result = minifyHTML(data, {
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
      } catch (err) {
        benchmarkErrors.push(`minify-html failed for ${fileName}: ${err.message}`);
        resetSizes(info);
      }
    }

    // Minimize, https://github.com/Swaagie/minimize
    async function testMinimize() {
      const data = await readText(filePath);
      const info = infos.minimize;
      info.startTime = Date.now();

      return new Promise((resolve) => {
        minimize.parse(data, function (err, data) {
          if (err) {
            benchmarkErrors.push(`Minimize failed for ${fileName}: ${err.message}`);
            resetSizes(info);
            return resolve();
          }

          Promise.resolve()
            .then(() => writeBuffer(info.filePath, data))
            .then(() => readSizes(info))
            .then(() => resolve())
            .catch(err => {
              benchmarkErrors.push(`Failed after minimize processing ${fileName}: ${err.message}`);
              resetSizes(info);
              resolve();
            });
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
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': user_agent
        }
      };

      let info = infos.compressor;
      info.startTime = Date.now();

      function failed() {
        // Site refused to process content
        if (info) {
          resetSizes(info);
          info = null;
        }
      }

      return new Promise((resolve) => {
        const request = https.request(url, options, function (res) {
          // Check HTTP status code
          if (res.statusCode < 200 || res.statusCode >= 300) {
            benchmarkErrors.push(`htmlcompressor.com failed for ${fileName}: HTTP ${res.statusCode}`);
            failed();
            resolve();
            return;
          }

          // Validate content type for better response parsing
          const contentType = res.headers['content-type'] || '';
          const isJson = contentType.includes('application/json');

          let stream = res;
          if (res.headers['content-encoding'] === 'gzip') {
            stream = stream.pipe(zlib.createGunzip());
          } else if (res.headers['content-encoding'] === 'br') {
            stream = stream.pipe(zlib.createBrotliDecompress());
          } else if (res.headers['content-encoding'] === 'deflate') {
            stream = stream.pipe(zlib.createInflate());
          }
          stream.setEncoding('utf8');
          let response = '';
          stream.on('data', function (chunk) {
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
              } catch (err) {
                console.warn('Failed to parse JSON response from htmlcompressor.com');
              }
            } else {
              // Treat as direct text response (new API format)
              // Compare byte lengths instead of string lengths for accuracy
              const responseBytes = Buffer.byteLength(response, 'utf8');
              const originalBytes = Buffer.byteLength(data, 'utf8');

              if (response && response.length > 0 && response.includes('<') && responseBytes <= originalBytes) {
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
          benchmarkErrors.push(`htmlcompressor.com timed out for ${fileName}`);
          request.destroy();
          failed();
          resolve();
        });

        request.on('error', (err) => {
          benchmarkErrors.push(`htmlcompressor.com error for ${fileName}: ${err.message}`);
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

    await readSizes(original);

    log(`${fileName}: Running HTML Minifier Next`);
    await testHTMLMinifier();

    log(`${fileName}: Running HTML Minifier Terser`);
    await testHTMLMinifierTerser();

    log(`${fileName}: Running htmlnano`);
    await testhtmlnano();

    log(`${fileName}: Running @swc/html`);
    await testSWCHTML();

    log(`${fileName}: Running minify-html`);
    await testMinifyHTML();

    log(`${fileName}: Running Minimize`);
    await testMinimize();

    log(`${fileName}: Running htmlcompressor.com`);
    await testHTMLCompressor();

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

    // Accumulate total processing times and count successes
    for (const name in infos) {
      const info = infos[name];
      if (info.startTime && info.endTime && info.size > 0) {
        totalTimes[name] += (info.endTime - info.startTime);
        successCounts[name]++;
      }
    }

    progress.tick({ fileName: `Completed ${fileName}` });
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

      const request = https.get({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: {
          'Accept-Encoding': 'gzip, br, deflate',
          'User-Agent': user_agent
        }
      }, function (res) {
        const status = res.statusCode;

        if (status === 200) {
          let stream = res;
          let decompressionStream = null;

          // Handle compression
          if (res.headers['content-encoding'] === 'gzip') {
            decompressionStream = zlib.createGunzip();
            stream = res.pipe(decompressionStream);
          } else if (res.headers['content-encoding'] === 'br') {
            decompressionStream = zlib.createBrotliDecompress();
            stream = res.pipe(decompressionStream);
          } else if (res.headers['content-encoding'] === 'deflate') {
            decompressionStream = zlib.createInflate();
            stream = res.pipe(decompressionStream);
          }

          if (decompressionStream) {
            decompressionStream.on('error', function (err) {
              benchmarkErrors.push(`Decompression error for ${site}: ${err.message}`);
              safeResolve(null);
            });
          }

          const writeStream = createWriteStream(filePath);

          // Handle all possible stream errors
          res.on('error', function (err) {
            benchmarkErrors.push(`Response stream error for ${site}: ${err.message}`);
            safeResolve(null);
          });

          writeStream.on('error', function (err) {
            benchmarkErrors.push(`Write stream error for ${site}: ${err.message}`);
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
          benchmarkErrors.push(`HTTP error ${status} for ${site}`);
          res.resume(); // Consume response to free memory
          safeResolve(null);
        }
      });

      // Set request timeout (30 seconds)
      request.setTimeout(30000, function() {
        benchmarkErrors.push(`Request timeout for ${site}`);
        request.destroy();
        safeResolve(null);
      });

      request.on('error', function (err) {
        benchmarkErrors.push(`Failed to fetch ${site}: ${err.message}`);
        safeResolve(null);
      });
    });
  }

  log(`Starting ${fileName}`);
  log(`Downloading ${fileName}…`);
  progress.tick(0, { fileName: `Starting ${fileName}` });

  const site = await get(urls[fileName]);
  if (!site) {
    benchmarkErrors.push(`Skipping ${fileName} due to download failure`);
    rows[fileName] = null; // Explicitly mark as skipped
    return;
  }

  log(`Processing ${fileName}…`);
  log(`${fileName}: Downloaded, starting processing`);
  await processFileInternal(site);
}

// Log concurrency setting
const actualConcurrency = Math.min(BENCH_CONCURRENCY, fileNames.length);
if (VERBOSE || BENCH_CONCURRENCY > 1) {
  console.error(`Running benchmarks with concurrency: ${actualConcurrency} (BENCH_CONCURRENCY=${BENCH_CONCURRENCY})`);
}

await processFiles();

displayTable();

// Display issues that occurred during benchmarking
if (benchmarkErrors.length > 0) {
  console.log();
  console.log('Benchmark warnings and errors:');
  benchmarkErrors.forEach(error => {
    console.log(styleText(['red'], `• ${error}`));
  });
  console.log();
}

const content = generateMarkdownTable();

// Generate date stamp in format “MMM DD, YYYY”
const now = new Date();
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dateStamp = `(Last updated: ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()})`;

const readme = '../README.md';
const data = await readText(readme);
let start = data.indexOf('## Minification comparison');

// Use specific table header for more stable anchor
const tableHeader = '| Site | Original Size (KB) |';
let headerPos = data.indexOf(tableHeader, start);
if (headerPos !== -1) {
  start = headerPos;
} else {
  // Fallback to first pipe for backward compatibility
  start = data.indexOf('|', start);
}

let end = data.indexOf('##', start);

// Check if there’s already a date stamp and remove it
const existingDateStamp = data.slice(start, end).match(/\(Last updated:.*?\)\n*/);
if (existingDateStamp) {
  // Move end pointer past the old date stamp so it gets replaced
  end = start + data.slice(start, end).lastIndexOf(existingDateStamp[0]) + existingDateStamp[0].length;
}

const newData = data.slice(0, start) + content + '\n' + dateStamp + '\n' + data.slice(end);
await writeText(readme, newData);