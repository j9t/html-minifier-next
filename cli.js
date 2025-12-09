#!/usr/bin/env node
/**
 * html-minifier-next CLI tool
 *
 * The MIT License (MIT)
 *
 *  Copyright (c) 2014-2016 Zoltan Frombach
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy of
 *  this software and associated documentation files (the "Software"), to deal in
 *  the Software without restriction, including without limitation the rights to
 *  use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 *  the Software, and to permit persons to whom the Software is furnished to do so,
 *  subject to the following conditions:
 *
 *  The above copyright notice and this permission notice shall be included in all
 *  copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 *  FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 *  COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 *  IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 *  CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 */

import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import { camelCase, paramCase } from 'change-case';
import { Command } from 'commander';
import { minify } from './src/htmlminifier.js';
import { getPreset, getPresetNames } from './src/presets.js';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const program = new Command();
program.name(pkg.name);
program.version(pkg.version);

function fatal(message) {
  console.error(message);
  process.exit(1);
}

// Handle broken pipe (e.g., when piping to `head`)
process.stdout.on('error', (err) => {
  if (err && err.code === 'EPIPE') {
    process.exit(0);
  }
  fatal('STDOUT error\n' + (err && err.message ? err.message : String(err)));
});

/**
 * JSON does not support regexes, so, e.g., JSON.parse() will not create
 * a RegExp from the JSON value `[ "/matchString/" ]`, which is
 * technically just an array containing a string that begins and end with
 * a forward slash. To get a RegExp from a JSON string, it must be
 * constructed explicitly in JavaScript.
 *
 * The likelihood of actually wanting to match text that is enclosed in
 * forward slashes is probably quite rare, so if forward slashes were
 * included in an argument that requires a regex, the user most likely
 * thought they were part of the syntax for specifying a regex.
 *
 * In the unlikely case that forward slashes are indeed desired in the
 * search string, the user would need to enclose the expression in a
 * second set of slashes:
 *
 *    --customAttrSurround "[\"//matchString//\"]"
 */
function parseRegExp(value) {
  if (value) {
    return new RegExp(value.replace(/^\/(.*)\/$/, '$1'));
  }
}

function parseJSON(value) {
  if (value) {
    try {
      return JSON.parse(value);
    } catch {
      if (/^\s*[{[]/.test(value)) {
        fatal('Could not parse JSON value `' + value + '`');
      }
      return value;
    }
  }
}

function parseJSONArray(value) {
  if (value) {
    value = parseJSON(value);
    return Array.isArray(value) ? value : [value];
  }
}

function parseJSONRegExpArray(value) {
  value = parseJSONArray(value);
  return value && value.map(parseRegExp);
}

const parseString = value => value;

const parseValidInt = (optionName) => (value) => {
  const s = String(value).trim();
  // Accept only non-negative whole integers
  if (!/^\d+$/.test(s)) {
    fatal(`Invalid number for \`--${paramCase(optionName)}: "${value}"\``);
  }
  const num = Number(s);
  return num;
};

const mainOptions = {
  caseSensitive: 'Treat attributes in case-sensitive manner (useful for custom HTML elements)',
  collapseBooleanAttributes: 'Omit attribute values from boolean attributes',
  customFragmentQuantifierLimit: ['Set maximum quantifier limit for custom fragments to prevent ReDoS attacks (default: 200)', parseValidInt('customFragmentQuantifierLimit')],
  collapseInlineTagWhitespace: 'Don’t leave any spaces between “display: inline;” elements when collapsing—use with “collapseWhitespace=true”',
  collapseWhitespace: 'Collapse whitespace that contributes to text nodes in a document tree',
  conservativeCollapse: 'Always collapse to 1 space (never remove it entirely)—use with “collapseWhitespace=true”',
  continueOnMinifyError: 'Abort on minification errors',
  continueOnParseError: 'Handle parse errors instead of aborting',
  customAttrAssign: ['Arrays of regexes that allow to support custom attribute assign expressions (e.g., “<div flex?="{{mode != cover}}"></div>”)', parseJSONRegExpArray],
  customAttrCollapse: ['Regex that specifies custom attribute to strip newlines from (e.g., /ng-class/)', parseRegExp],
  customAttrSurround: ['Arrays of regexes that allow to support custom attribute surround expressions (e.g., “<input {{#if value}}checked="checked"{{/if}}>”)', parseJSONRegExpArray],
  customEventAttributes: ['Arrays of regexes that allow to support custom event attributes for minifyJS (e.g., “ng-click”)', parseJSONRegExpArray],
  decodeEntities: 'Use direct Unicode characters whenever possible',
  html5: 'Don’t parse input according to the HTML specification (not recommended for modern HTML)',
  ignoreCustomComments: ['Array of regexes that allow to ignore certain comments, when matched', parseJSONRegExpArray],
  ignoreCustomFragments: ['Array of regexes that allow to ignore certain fragments, when matched (e.g., “<?php … ?>”, “{{ … }}”)', parseJSONRegExpArray],
  includeAutoGeneratedTags: 'Don’t insert elements generated by HTML parser',
  inlineCustomElements: ['Array of names of custom elements which are inline', parseJSONArray],
  keepClosingSlash: 'Keep the trailing slash on void elements',
  maxInputLength: ['Maximum input length to prevent ReDoS attacks', parseValidInt('maxInputLength')],
  maxLineLength: ['Specify a maximum line length; compressed output will be split by newlines at valid HTML split-points', parseValidInt('maxLineLength')],
  minifyCSS: ['Minify CSS in “style” elements and “style” attributes (uses Lightning CSS)', parseJSON],
  minifyJS: ['Minify JavaScript in “script” elements and event attributes (uses Terser)', parseJSON],
  minifyURLs: ['Minify URLs in various attributes (uses relateurl)', parseJSON],
  noNewlinesBeforeTagClose: 'Never add a newline before a tag that closes an element',
  partialMarkup: 'Treat input as a partial HTML fragment, preserving stray end tags and unclosed tags',
  preserveLineBreaks: 'Always collapse to 1 line break (never remove it entirely) when whitespace between tags includes a line break—use with "collapseWhitespace=true"',
  preventAttributesEscaping: 'Prevents the escaping of the values of attributes',
  processConditionalComments: 'Process contents of conditional comments through minifier',
  processScripts: ['Array of strings corresponding to types of “script” elements to process through minifier (e.g., “text/ng-template”, “text/x-handlebars-template”, etc.)', parseJSONArray],
  quoteCharacter: ['Type of quote to use for attribute values (“\'” or “"”)', parseString],
  removeAttributeQuotes: 'Remove quotes around attributes when possible',
  removeComments: 'Strip HTML comments',
  removeEmptyAttributes: 'Remove all attributes with whitespace-only values',
  removeEmptyElements: 'Remove all elements with empty contents',
  removeOptionalTags: 'Remove unrequired tags',
  removeRedundantAttributes: 'Remove attributes when value matches default',
  removeScriptTypeAttributes: 'Remove “type="text/javascript"” from “script” elements; other “type” attribute values are left intact',
  removeStyleLinkTypeAttributes: 'Remove “type="text/css"” from “style” and “link” elements; other “type” attribute values are left intact',
  removeTagWhitespace: 'Remove space between attributes whenever possible; note that this will result in invalid HTML',
  sortAttributes: 'Sort attributes by frequency',
  sortClassName: 'Sort style classes by frequency',
  trimCustomFragments: 'Trim whitespace around “ignoreCustomFragments”',
  useShortDoctype: 'Replaces the doctype with the short (HTML) doctype'
};

// Configure command line flags
const mainOptionKeys = Object.keys(mainOptions);
mainOptionKeys.forEach(function (key) {
  const option = mainOptions[key];
  if (Array.isArray(option)) {
    key = key === 'minifyURLs' ? '--minify-urls' : '--' + paramCase(key);
    key += option[1] === parseJSON ? ' [value]' : ' <value>';
    program.option(key, option[0], option[1]);
  } else if (~['html5', 'includeAutoGeneratedTags', 'continueOnMinifyError'].indexOf(key)) {
    program.option('--no-' + paramCase(key), option);
  } else {
    program.option('--' + paramCase(key), option);
  }
});
program.option('-o --output <file>', 'Specify output file (reads from file arguments or STDIN; outputs to STDOUT if not specified)');
program.option('-v --verbose', 'Show detailed processing information');
program.option('-d --dry', 'Dry run: process and report statistics without writing output');

function readFile(file) {
  try {
    return fs.readFileSync(file, { encoding: 'utf8' });
  } catch (err) {
    fatal('Cannot read ' + file + '\n' + err.message);
  }
}

/**
 * Load config from a file path, trying JSON, CJS, then ESM
 * @param {string} configPath - Path to config file
 * @returns {Promise<object>} Loaded config object
 */
async function loadConfigFromPath(configPath) {
  const data = readFile(configPath);

  // Try JSON first
  try {
    return JSON.parse(data);
  } catch (jsonErr) {
    const abs = path.resolve(configPath);

    // Try CJS require
    try {
      const result = require(abs);
      // Handle ESM interop: if `require()` loads an ESM file, it may return `{__esModule: true, default: …}`
      return (result && result.__esModule && result.default) ? result.default : result;
    } catch (cjsErr) {
      // Try ESM import
      try {
        const mod = await import(pathToFileURL(abs).href);
        return mod.default || mod;
      } catch (esmErr) {
        fatal('Cannot read the specified config file.\nAs JSON: ' + jsonErr.message + '\nAs CJS: ' + cjsErr.message + '\nAs ESM: ' + esmErr.message);
      }
    }
  }
}

/**
 * Normalize and validate config object by applying parsers and transforming values.
 * @param {object} config - Raw config object
 * @returns {object} Normalized config object
 */
function normalizeConfig(config) {
  const normalized = { ...config };

  // Apply parsers to main options
  mainOptionKeys.forEach(function (key) {
    if (key in normalized) {
      const option = mainOptions[key];
      if (Array.isArray(option)) {
        const value = normalized[key];
        normalized[key] = option[1](typeof value === 'string' ? value : JSON.stringify(value));
      }
    }
  });

  // Handle fileExt in config file
  if ('fileExt' in normalized) {
    // Support both string (`html,htm`) and array (`["html", "htm"]`) formats
    if (Array.isArray(normalized.fileExt)) {
      normalized.fileExt = normalized.fileExt.join(',');
    }
  }

  return normalized;
}

let config = {};
program.option('-c --config-file <file>', 'Use config file');
program.option('--preset <name>', `Use a preset configuration (${getPresetNames().join(', ')})`);
program.option('--input-dir <dir>', 'Specify an input directory');
program.option('--output-dir <dir>', 'Specify an output directory');
program.option('--file-ext <extensions>', 'Specify file extension(s) to process (comma-separated), e.g., "html" or "html,htm,php"');

(async () => {
  let content;
  let filesProvided = false;
  await program.arguments('[files...]').action(function (files) {
    content = files.map(readFile).join('');
    filesProvided = files.length > 0;
  }).parseAsync(process.argv);

  const programOptions = program.opts();

  // Load and normalize config if `--config-file` was specified
  if (programOptions.configFile) {
    config = await loadConfigFromPath(programOptions.configFile);
    config = normalizeConfig(config);
  }

  function createOptions() {
    const options = {};

    // Priority order: preset < config < CLI
    // 1. Apply preset if specified (CLI `--preset` takes priority over config.preset)
    const presetName = programOptions.preset || config.preset;
    if (presetName) {
      const preset = getPreset(presetName);
      if (!preset) {
        fatal(`Unknown preset "${presetName}". Available presets: ${getPresetNames().join(', ')}`);
      }
      Object.assign(options, preset);
    }

    // 2. Apply config file options (overrides preset)
    mainOptionKeys.forEach(function (key) {
      if (key in config) {
        options[key] = config[key];
      }
    });

    // 3. Apply CLI options (overrides config and preset)
    mainOptionKeys.forEach(function (key) {
      const param = programOptions[key === 'minifyURLs' ? 'minifyUrls' : camelCase(key)];
      if (typeof param !== 'undefined') {
        options[key] = param;
      }
    });

    return options;
  }

  function getActiveOptionsDisplay(minifierOptions) {
    const presetName = programOptions.preset || config.preset;
    if (presetName) {
      console.error(`Using preset: ${presetName}`);
    }
    const activeOptions = Object.entries(minifierOptions)
      .filter(([k]) => program.getOptionValueSource(k === 'minifyURLs' ? 'minifyUrls' : camelCase(k)) === 'cli')
      .map(([k, v]) => (typeof v === 'boolean' ? (v ? k : `no-${k}`) : k));
    if (activeOptions.length > 0) {
      console.error('CLI options: ' + activeOptions.join(', '));
    }
  }

  function calculateStats(original, minified) {
    const originalSize = Buffer.byteLength(original, 'utf8');
    const minifiedSize = Buffer.byteLength(minified, 'utf8');
    const saved = originalSize - minifiedSize;
    const sign = saved >= 0 ? '-' : '+';
    const percentage = originalSize ? ((Math.abs(saved) / originalSize) * 100).toFixed(1) : '0.0';
    return { originalSize, minifiedSize, saved, sign, percentage };
  }

  async function processFile(inputFile, outputFile, isDryRun = false, isVerbose = false) {
    const data = await fs.promises.readFile(inputFile, { encoding: 'utf8' }).catch(err => {
      fatal('Cannot read ' + inputFile + '\n' + err.message);
    });

    let minified;
    try {
      minified = await minify(data, createOptions());
    } catch (err) {
      fatal('Minification error on ' + inputFile + '\n' + err.message);
    }

    const stats = calculateStats(data, minified);

    // Show stats if dry run or verbose mode
    if (isDryRun || isVerbose) {
      console.error(`  ✓ ${path.relative(process.cwd(), inputFile)}: ${stats.originalSize.toLocaleString()} → ${stats.minifiedSize.toLocaleString()} bytes (${stats.sign}${Math.abs(stats.saved).toLocaleString()}, ${stats.percentage}%)`);
    }

    if (isDryRun) {
      return { originalSize: stats.originalSize, minifiedSize: stats.minifiedSize, saved: stats.saved };
    }

    await fs.promises.writeFile(outputFile, minified, { encoding: 'utf8' }).catch(err => {
      fatal('Cannot write ' + outputFile + '\n' + err.message);
    });

    return { originalSize: stats.originalSize, minifiedSize: stats.minifiedSize, saved: stats.saved };
  }

  function parseFileExtensions(fileExt) {
    if (!fileExt) return [];
    const list = fileExt
      .split(',')
      .map(ext => ext.trim().replace(/^\.+/, '').toLowerCase())
      .filter(ext => ext.length > 0);
    return [...new Set(list)];
  }

  function shouldProcessFile(filename, fileExtensions) {
    if (!fileExtensions || fileExtensions.length === 0) {
      return true; // No extensions specified, process all files
    }

    const fileExt = path.extname(filename).replace(/^\.+/, '').toLowerCase();
    return fileExtensions.includes(fileExt);
  }

  async function countFiles(dir, extensions, skipRootAbs) {
    let count = 0;

    const files = await fs.promises.readdir(dir).catch(() => []);

    for (const file of files) {
      const filePath = path.join(dir, file);

      // Skip anything inside the output root
      if (skipRootAbs) {
        const real = await fs.promises.realpath(filePath).catch(() => undefined);
        if (real && (real === skipRootAbs || real.startsWith(skipRootAbs + path.sep))) {
          continue;
        }
      }

      const lst = await fs.promises.lstat(filePath).catch(() => null);
      if (!lst || lst.isSymbolicLink()) {
        continue;
      }

      if (lst.isDirectory()) {
        count += await countFiles(filePath, extensions, skipRootAbs);
      } else if (shouldProcessFile(file, extensions)) {
        count++;
      }
    }

    return count;
  }

  function updateProgress(current, total) {
    // Clear the line first, then write simple progress
    process.stderr.write(`\r\x1b[K`);
    if (total) {
      const ratio = Math.min(current / total, 1);
      const percentage = (ratio * 100).toFixed(1);
      process.stderr.write(`Processing ${current.toLocaleString()}/${total.toLocaleString()} (${percentage}%)`);
    } else {
      // Indeterminate progress - no total known yet
      process.stderr.write(`Processing ${current.toLocaleString()} files…`);
    }
  }

  function clearProgress() {
    process.stderr.write('\r\x1b[K'); // Clear the line
  }

  async function processDirectory(inputDir, outputDir, extensions, isDryRun = false, isVerbose = false, skipRootAbs, progress = null) {
    // If first call provided a string, normalize once; otherwise assume pre-parsed array
    if (typeof extensions === 'string') {
      extensions = parseFileExtensions(extensions);
    }

    const files = await fs.promises.readdir(inputDir).catch(err => {
      fatal('Cannot read directory ' + inputDir + '\n' + err.message);
    });

    const allStats = [];

    for (const file of files) {
      const inputFile = path.join(inputDir, file);
      const outputFile = path.join(outputDir, file);

      // Skip anything inside the output root to avoid reprocessing
      if (skipRootAbs) {
        const real = await fs.promises.realpath(inputFile).catch(() => undefined);
        if (real && (real === skipRootAbs || real.startsWith(skipRootAbs + path.sep))) {
          continue;
        }
      }

      const lst = await fs.promises.lstat(inputFile).catch(err => {
        fatal('Cannot read ' + inputFile + '\n' + err.message);
      });

      if (lst.isSymbolicLink()) {
        continue;
      }

      if (lst.isDirectory()) {
        const dirStats = await processDirectory(inputFile, outputFile, extensions, isDryRun, isVerbose, skipRootAbs, progress);
        if (dirStats) {
          allStats.push(...dirStats);
        }
      } else if (shouldProcessFile(file, extensions)) {
        if (!isDryRun) {
          await fs.promises.mkdir(outputDir, { recursive: true }).catch(err => {
            fatal('Cannot create directory ' + outputDir + '\n' + err.message);
          });
        }
        const fileStats = await processFile(inputFile, outputFile, isDryRun, isVerbose);
        if (fileStats) {
          allStats.push(fileStats);
        }

        // Update progress after processing
        if (progress) {
          progress.current++;
          updateProgress(progress.current, progress.total);
        }
      }
    }

    return allStats;
  }

  const writeMinify = async () => {
    const minifierOptions = createOptions();

    // Show config info if verbose
    if (programOptions.verbose || programOptions.dry) {
      getActiveOptionsDisplay(minifierOptions);
    }

    let minified;

    try {
      minified = await minify(content, minifierOptions);
    } catch (err) {
      fatal('Minification error:\n' + err.message);
    }

    const stats = calculateStats(content, minified);

    if (programOptions.dry) {
      const inputSource = program.args.length > 0 ? program.args.join(', ') : 'STDIN';
      const outputDest = programOptions.output || 'STDOUT';

      console.error(`[DRY RUN] Would minify: ${inputSource} → ${outputDest}`);
      console.error(`  Original: ${stats.originalSize.toLocaleString()} bytes`);
      console.error(`  Minified: ${stats.minifiedSize.toLocaleString()} bytes`);
      console.error(`  Saved: ${stats.sign}${Math.abs(stats.saved).toLocaleString()} bytes (${stats.percentage}%)`);
      return;
    }

    // Show stats if verbose
    if (programOptions.verbose) {
      const inputSource = program.args.length > 0 ? program.args.join(', ') : 'STDIN';
      console.error(`  ✓ ${inputSource}: ${stats.originalSize.toLocaleString()} → ${stats.minifiedSize.toLocaleString()} bytes (${stats.sign}${Math.abs(stats.saved).toLocaleString()}, ${stats.percentage}%)`);
    }

    if (programOptions.output) {
      await fs.promises.mkdir(path.dirname(programOptions.output), { recursive: true }).catch((e) => {
        fatal('Cannot create directory ' + path.dirname(programOptions.output) + '\n' + e.message);
      });
      await new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(programOptions.output)
          .on('error', reject)
          .on('finish', resolve);
        fileStream.end(minified);
        }).catch((e) => {
        fatal('Cannot write ' + programOptions.output + '\n' + e.message);
      });
      return;
    }

    process.stdout.write(minified);
  };

  const { inputDir, outputDir, fileExt } = programOptions;

  // Resolve file extensions: CLI argument takes priority over config file, even if empty string
  const hasCliFileExt = program.getOptionValueSource('fileExt') === 'cli';
  const resolvedFileExt = hasCliFileExt ? fileExt : config.fileExt;

  if (inputDir || outputDir) {
    if (!inputDir) {
      fatal('The option `output-dir` needs to be used with the option `input-dir`—if you are working with a single file, use `-o`');
    } else if (!outputDir) {
      fatal('You need to specify where to write the output files with the option `--output-dir`');
    }

    await (async () => {
      // `--dry` automatically enables verbose mode
      const isVerbose = programOptions.verbose || programOptions.dry;

      // Show config info if verbose
      if (isVerbose) {
        const minifierOptions = createOptions();
        getActiveOptionsDisplay(minifierOptions);
      }

      // Prevent traversing into the output directory when it is inside the input directory
      let inputReal;
      let outputReal;
      inputReal = await fs.promises.realpath(inputDir).catch(() => undefined);
      try {
        outputReal = await fs.promises.realpath(outputDir);
      } catch {
        outputReal = path.resolve(outputDir);
      }
      let skipRootAbs;
      if (inputReal && outputReal && (outputReal === inputReal || outputReal.startsWith(inputReal + path.sep))) {
        // Instead of aborting, skip traversing into the output directory
        skipRootAbs = outputReal;
      }

      if (programOptions.dry) {
        console.error(`[DRY RUN] Would process directory: ${inputDir} → ${outputDir}`);
      }

      // Set up progress indicator (only in TTY and when not verbose/dry)
      const showProgress = process.stderr.isTTY && !isVerbose;
      let progress = null;

      if (showProgress) {
        // Start with indeterminate progress, count in background
        progress = {current: 0, total: null};

        // Note: `countFiles` runs asynchronously and mutates `progress.total` when complete.
        // This shared-state mutation is safe because JavaScript is single-threaded—
        // `updateProgress` may read `progress.total` as `null` initially,
        // then see the updated value once `countFiles` resolves,
        // transitioning the indicator from indeterminate to determinate progress without race conditions.
        const extensions = typeof resolvedFileExt === 'string' ? parseFileExtensions(resolvedFileExt) : resolvedFileExt;
        countFiles(inputDir, extensions, skipRootAbs).then(total => {
          if (progress) {
            progress.total = total;
          }
        }).catch(() => {
          // Ignore count errors, just keep showing indeterminate progress
        });
      }

      const stats = await processDirectory(inputDir, outputDir, resolvedFileExt, programOptions.dry, isVerbose, skipRootAbs, progress);

      // Show completion message and clear progress indicator
      if (progress) {
        clearProgress();
        console.error(`Processed ${progress.current.toLocaleString()} file${progress.current === 1 ? '' : 's'}`);
      }

      if (isVerbose && stats && stats.length > 0) {
        const totalOriginal = stats.reduce((sum, s) => sum + s.originalSize, 0);
        const totalMinified = stats.reduce((sum, s) => sum + s.minifiedSize, 0);
        const totalSaved = totalOriginal - totalMinified;
        const sign = totalSaved >= 0 ? '-' : '+';
        const totalPercentage = totalOriginal ? ((Math.abs(totalSaved) / totalOriginal) * 100).toFixed(1) : '0.0';

        console.error('---');
        console.error(`Total: ${totalOriginal.toLocaleString()} → ${totalMinified.toLocaleString()} bytes (${sign}${Math.abs(totalSaved).toLocaleString()}, ${totalPercentage}%)`);
      }
    })();
  } else if (filesProvided) { // Minifying one or more files specified on the CMD line
    writeMinify();
  } else { // Minifying input coming from STDIN
    content = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (data) {
      content += data;
    }).on('end', writeMinify);
  }
})();