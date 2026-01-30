#!/usr/bin/env node

/**
 * html-minifier-next CLI tool
 *
 * The MIT License (MIT)
 *
 *  Copyright 2014–2016 Zoltan Frombach
 *  Copyright Juriy “kangax” Zaytsev
 *  Copyright 2025 Jens Oliver Meiert
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
import os from 'os';
import { createRequire } from 'module';
import { camelCase, paramCase } from 'change-case';
import { Command } from 'commander';
// Lazy-load HMN to reduce CLI cold-start overhead
import { getPreset, getPresetNames } from './src/presets.js';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');

const DEFAULT_FILE_EXTENSIONS = ['html', 'htm', 'xhtml', 'shtml'];

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
 * JSON does not support regexes, so, e.g., `JSON.parse()` will not create
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
  collapseAttributeWhitespace: 'Trim and collapse whitespace characters within attribute values',
  collapseBooleanAttributes: 'Omit attribute values from boolean attributes',
  collapseInlineTagWhitespace: 'Collapse whitespace more aggressively between inline elements—use with `--collapse-whitespace`',
  collapseWhitespace: 'Collapse whitespace that contributes to text nodes in a document tree',
  conservativeCollapse: 'Always collapse to one space (never remove it entirely)—use with `--collapse-whitespace`',
  continueOnMinifyError: 'Abort on minification errors',
  continueOnParseError: 'Handle parse errors instead of aborting',
  customAttrAssign: ['Array of regexes that allow to support custom attribute assign expressions (e.g., `<div flex?="{{mode != cover}}"></div>`)', parseJSONRegExpArray],
  customAttrCollapse: ['Regex that specifies custom attribute to strip newlines from (e.g., /ng-class/)', parseRegExp],
  customAttrSurround: ['Array of regexes that allow to support custom attribute surround expressions (e.g., `<input {{#if value}}checked="checked"{{/if}}>`)', parseJSONRegExpArray],
  customEventAttributes: ['Array of regexes that allow to support custom event attributes for minifyJS (e.g., `ng-click`)', parseJSONRegExpArray],
  customFragmentQuantifierLimit: ['Set maximum quantifier limit for custom fragments to prevent ReDoS attacks (default: 200)', parseValidInt('customFragmentQuantifierLimit')],
  decodeEntities: 'Use direct Unicode characters whenever possible',
  html5: 'Don’t parse input according to the HTML specification (not recommended for modern HTML)',
  ignoreCustomComments: ['Array of regexes that allow to ignore certain comments, when matched', parseJSONRegExpArray],
  ignoreCustomFragments: ['Array of regexes that allow to ignore certain fragments, when matched (e.g., `<?php … ?>`, `{{ … }}`)', parseJSONRegExpArray],
  includeAutoGeneratedTags: 'Don’t insert elements generated by HTML parser',
  inlineCustomElements: ['Array of names of custom elements which are inline', parseJSONArray],
  keepClosingSlash: 'Keep the trailing slash on void elements',
  maxInputLength: ['Maximum input length to prevent ReDoS attacks', parseValidInt('maxInputLength')],
  maxLineLength: ['Specify a maximum line length; compressed output will be split by newlines at valid HTML split-points', parseValidInt('maxLineLength')],
  mergeScripts: 'Merge consecutive inline `script` elements into one',
  minifyCSS: ['Minify CSS in `style` elements and attributes (uses Lightning CSS)', parseJSON],
  minifyJS: ['Minify JavaScript in `script` elements and event attributes (uses Terser or SWC; pass `{"engine": "swc"}` for SWC)', parseJSON],
  minifySVG: ['Minify SVG elements and attributes (numeric precision, default attributes, colors)', parseJSON],
  minifyURLs: ['Minify URLs in various attributes (uses relateurl)', parseJSON],
  noNewlinesBeforeTagClose: 'Never add a newline before a tag that closes an element',
  partialMarkup: 'Treat input as a partial HTML fragment, preserving stray end tags and unclosed tags',
  preserveLineBreaks: 'Always collapse to one line break (never remove it entirely) when whitespace between tags includes a line break—use with `--collapse-whitespace`',
  preventAttributesEscaping: 'Prevents the escaping of the values of attributes',
  processConditionalComments: 'Process contents of conditional comments through minifier',
  processScripts: ['Array of strings corresponding to types of `script` elements to process through minifier (e.g., `text/ng-template`, `text/x-handlebars-template`, etc.)', parseJSONArray],
  quoteCharacter: ['Type of quote to use for attribute values (“\'” or “"”)', parseString],
  removeAttributeQuotes: 'Remove quotes around attributes when possible',
  removeComments: 'Strip HTML comments',
  removeEmptyAttributes: 'Remove all attributes with whitespace-only values',
  removeEmptyElements: 'Remove all elements with empty contents',
  removeEmptyElementsExcept: ['Array of elements to preserve when `--remove-empty-elements` is enabled (e.g., `td`, `["td", "<span aria-hidden=\'true\'>"]`)', parseJSONArray],
  removeOptionalTags: 'Remove unrequired tags',
  removeRedundantAttributes: 'Remove attributes when value matches default',
  removeScriptTypeAttributes: 'Remove `type="text/javascript"` from `script` elements; other `type` attribute values are left intact',
  removeStyleLinkTypeAttributes: 'Remove `type="text/css"` from `style` and `link` elements; other `type` attribute values are left intact',
  removeTagWhitespace: 'Remove space between attributes whenever possible; note that this will result in invalid HTML',
  sortAttributes: 'Sort attributes by frequency',
  sortClassName: 'Sort style classes by frequency',
  trimCustomFragments: 'Trim whitespace around custom fragments (`--ignore-custom-fragments`)',
  useShortDoctype: 'Replaces the doctype with the short HTML doctype'
};

// Configure command-line flags
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
program.option('-d --dry', 'Dry run: Process and report statistics without writing output');

// Lazy import wrapper for HMN
let minifyFnPromise;
async function getMinify() {
  if (!minifyFnPromise) {
    minifyFnPromise = import('./src/htmlminifier.js').then(m => m.minify);
  }
  return minifyFnPromise;
}

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
      // Handle ESM interop: If `require()` loads an ESM file, it may return `{__esModule: true, default: …}`
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

  // Handle `fileExt` in config file
  if ('fileExt' in normalized) {
    // Support both string (`html,htm`) and array (`["html", "htm"]`) formats
    if (Array.isArray(normalized.fileExt)) {
      normalized.fileExt = normalized.fileExt.join(',');
    }
  }

  // Handle `ignoreDir` in config file
  if ('ignoreDir' in normalized) {
    // Support both string (`libs,vendor`) and array (`["libs", "vendor"]`) formats
    if (Array.isArray(normalized.ignoreDir)) {
      normalized.ignoreDir = normalized.ignoreDir.join(',');
    }
  }

  return normalized;
}

let config = {};
program.option('--input-dir <dir>', 'Specify an input directory');
program.option('--ignore-dir <patterns>', 'Exclude directories—relative to input directory—from processing (comma-separated), e.g., “libs” or “libs,vendor,node_modules”');
program.option('--output-dir <dir>', 'Specify an output directory');
program.option('--file-ext <extensions>', 'Specify file extension(s) to process (comma-separated); defaults to “html,htm,xhtml,shtml”; use “*” for all files');
program.option('--preset <name>', `Use a preset configuration (${getPresetNames().join(', ')})`);
program.option('-c --config-file <file>', 'Use config file');
program.option('--cache-css <size>', 'Set CSS minification cache size (number of entries, default: 500)', parseValidInt('cacheCSS'));
program.option('--cache-js <size>', 'Set JavaScript minification cache size (number of entries, default: 500)', parseValidInt('cacheJS'));

(async () => {
  let content;
  let filesProvided = false;
  let capturedFiles = [];
  await program.arguments('[files...]').action(function (files) {
    capturedFiles = files;
    filesProvided = files.length > 0;
    // Defer reading files until after we check for consumed filenames
  }).parseAsync(process.argv);

  const programOptions = program.opts();

  // Check if any `parseJSON` options consumed a filename as their value
  // If so, treat the option as boolean true and add the filename back to the files list
  const jsonOptionKeys = ['minifyCss', 'minifyJs', 'minifyUrls'];
  for (const key of jsonOptionKeys) {
    const value = programOptions[key];
    if (typeof value === 'string' && /\.(html?|php|xml|svg|xhtml|jsx|tsx|vue|ejs|hbs|mustache|twig)$/i.test(value)) {
      // The option consumed a filename - inject it back
      programOptions[key] = true;
      capturedFiles.push(value);
      filesProvided = true;
    }
  }

  // Defer reading files—multi-file mode will process per-file later

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
        fatal(`Unknown preset “${presetName}”. Available presets: ${getPresetNames().join(', ')}`);
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
      const minify = await getMinify();
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
    if (fileExt.trim() === '*') return ['*'];
    const list = fileExt
      .split(',')
      .map(ext => ext.trim().replace(/^\.+/, '').toLowerCase())
      .filter(ext => ext.length > 0);
    return [...new Set(list)];
  }

  function shouldProcessFile(filename, fileExtensions) {
    // Wildcard: process all files
    if (fileExtensions.includes('*')) {
      return true;
    }

    const fileExt = path.extname(filename).replace(/^\.+/, '').toLowerCase();
    return fileExtensions.includes(fileExt);
  }

  /**
   * Parse comma-separated ignore patterns into an array
   * @param {string} patterns - Comma-separated directory patterns (e.g., "libs,vendor")
   * @returns {string[]} Array of trimmed pattern strings with normalized separators
   */
  function parseIgnorePatterns(patterns) {
    if (!patterns) return [];
    return patterns
      .split(',')
      .map(p => p.trim().replace(/\\/g, '/').replace(/\/+$/, ''))
      .filter(p => p.length > 0);
  }

  /**
   * Check if a directory should be ignored based on ignore patterns
   * Supports matching by directory name or relative path
   * @param {string} dirPath - Absolute path to the directory
   * @param {string[]} ignorePatterns - Array of patterns to match against (with forward slashes)
   * @param {string} baseDir - Base directory for relative path calculation
   * @returns {boolean} True if directory should be ignored
   */
  function shouldIgnoreDirectory(dirPath, ignorePatterns, baseDir) {
    if (!ignorePatterns || ignorePatterns.length === 0) return false;

    // Normalize to forward slashes for cross-platform comparison
    const relativePath = path.relative(baseDir, dirPath).replace(/\\/g, '/');
    const dirName = path.basename(dirPath);

    return ignorePatterns.some(pattern => {
      // Support both exact directory names and relative paths
      return dirName === pattern || relativePath === pattern || relativePath.startsWith(pattern + '/');
    });
  }

  async function countFiles(dir, extensions, skipRootAbs, ignorePatterns, baseDir) {
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
        // Skip ignored directories
        if (shouldIgnoreDirectory(filePath, ignorePatterns, baseDir)) {
          continue;
        }
        count += await countFiles(filePath, extensions, skipRootAbs, ignorePatterns, baseDir);
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

  // Utility: concurrency runner
  async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let next = 0;
    let active = 0;
    return new Promise((resolve, reject) => {
      const launch = () => {
        while (active < limit && next < items.length) {
          const current = next++;
          active++;
          Promise.resolve(worker(items[current], current))
            .then((res) => {
              results[current] = res;
              active--;
              launch();
            })
            .catch(reject);
        }
        if (next >= items.length && active === 0) {
          resolve(results);
        }
      };
      launch();
    });
  }

  async function collectFiles(dir, extensions, skipRootAbs, ignorePatterns, baseDir) {
    const out = [];
    const entries = await fs.promises.readdir(dir).catch(() => []);
    for (const name of entries) {
      const filePath = path.join(dir, name);
      if (skipRootAbs) {
        const real = await fs.promises.realpath(filePath).catch(() => undefined);
        if (real && (real === skipRootAbs || real.startsWith(skipRootAbs + path.sep))) continue;
      }
      const lst = await fs.promises.lstat(filePath).catch(() => null);
      if (!lst || lst.isSymbolicLink()) continue;
      if (lst.isDirectory()) {
        if (shouldIgnoreDirectory(filePath, ignorePatterns, baseDir)) continue;
        const sub = await collectFiles(filePath, extensions, skipRootAbs, ignorePatterns, baseDir);
        out.push(...sub);
      } else if (shouldProcessFile(name, extensions)) {
        out.push(filePath);
      }
    }
    return out;
  }

  async function processDirectory(inputDir, outputDir, extensions, isDryRun = false, isVerbose = false, skipRootAbs, progress = null, ignorePatterns = [], baseDir = null) {
    // If first call provided a string, normalize once; otherwise assume pre-parsed array
    if (typeof extensions === 'string') {
      extensions = parseFileExtensions(extensions);
    }

    // Set `baseDir` on first call
    if (baseDir === null) {
      baseDir = inputDir;
    }

    // Collect all files first for bounded parallel processing
    const list = await collectFiles(inputDir, extensions, skipRootAbs, ignorePatterns, baseDir);
    const allStats = new Array(list.length);
    const concurrency = Math.max(1, Math.min(os.cpus().length || 4, 8));
    await runWithConcurrency(list, concurrency, async (inputFile, idx) => {
      const rel = path.relative(inputDir, inputFile);
      const outFile = path.join(outputDir, rel);
      const outDir = path.dirname(outFile);
      if (!isDryRun) {
        await fs.promises.mkdir(outDir, { recursive: true }).catch(err => {
          fatal('Cannot create directory ' + outDir + '\n' + err.message);
        });
      }
      const stats = await processFile(inputFile, outFile, isDryRun, isVerbose);
      allStats[idx] = stats;
      if (progress) {
        progress.current++;
        updateProgress(progress.current, progress.total);
      }
    });
    return allStats.filter(Boolean);
  }

  const writeMinify = async () => {
    const minifierOptions = createOptions();

    // Show config info if verbose
    if (programOptions.verbose || programOptions.dry) {
      getActiveOptionsDisplay(minifierOptions);
    }

    let minified;

    try {
      const minify = await getMinify();
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
      try {
        await fs.promises.mkdir(path.dirname(programOptions.output), { recursive: true });
        await fs.promises.writeFile(programOptions.output, minified, { encoding: 'utf8' });
      } catch (err) {
        fatal('Cannot write ' + programOptions.output + '\n' + err.message);
      }
      return;
    }

    process.stdout.write(minified);
  };

  const { inputDir, outputDir, fileExt, ignoreDir } = programOptions;

  // Resolve file extensions: CLI argument > config file > defaults
  const hasCliFileExt = program.getOptionValueSource('fileExt') === 'cli';
  const resolvedFileExt = hasCliFileExt ? (fileExt || '*') : (config.fileExt || DEFAULT_FILE_EXTENSIONS);

  // Resolve ignore patterns: CLI argument takes priority over config file
  const hasCliIgnoreDir = program.getOptionValueSource('ignoreDir') === 'cli';
  const resolvedIgnoreDir = hasCliIgnoreDir ? ignoreDir : config.ignoreDir;

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

      // Parse ignore patterns
      const ignorePatterns = parseIgnorePatterns(resolvedIgnoreDir);

      // Validate that the input directory exists and is readable
      try {
        const stat = await fs.promises.stat(inputDir);
        if (!stat.isDirectory()) {
          fatal(inputDir + ' is not a directory');
        }
      } catch (err) {
        fatal('Cannot read directory ' + inputDir + '\n' + err.message);
      }

      // Resolve base directory for consistent path comparisons
      const inputDirResolved = inputReal || inputDir;

      if (showProgress) {
        // Start with indeterminate progress, count in background
        progress = {current: 0, total: null};

        // Note: `countFiles` runs asynchronously and mutates `progress.total` when complete.
        // This shared-state mutation is safe because JavaScript is single-threaded—
        // `updateProgress` may read `progress.total` as `null` initially,
        // then see the updated value once `countFiles` resolves,
        // transitioning the indicator from indeterminate to determinate progress without race conditions.
        const extensions = typeof resolvedFileExt === 'string' ? parseFileExtensions(resolvedFileExt) : resolvedFileExt;
        countFiles(inputDir, extensions, skipRootAbs, ignorePatterns, inputDirResolved).then(total => {
          if (progress) {
            progress.total = total;
          }
        }).catch(() => {
          // Ignore count errors, just keep showing indeterminate progress
        });
      }

      const stats = await processDirectory(inputDir, outputDir, resolvedFileExt, programOptions.dry, isVerbose, skipRootAbs, progress, ignorePatterns, inputDirResolved);

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
    // Process each file independently, then concatenate outputs to preserve current behavior
    const minifierOptions = createOptions();
    // Show config info if verbose/dry
    if (programOptions.verbose || programOptions.dry) {
      getActiveOptionsDisplay(minifierOptions);
    }

    const concurrency = Math.max(1, Math.min(os.cpus().length || 4, 8));
    const inputs = capturedFiles.slice();

    // Read originals and minify in parallel with bounded concurrency
    const originals = new Array(inputs.length);
    const outputs = new Array(inputs.length);

    await runWithConcurrency(inputs, concurrency, async (file, idx) => {
      const data = await fs.promises.readFile(file, 'utf8').catch(err => fatal('Cannot read ' + file + '\n' + err.message));
      const minify = await getMinify();
      let out;
      try {
        out = await minify(data, minifierOptions);
      } catch (err) {
        fatal('Minification error on ' + file + '\n' + err.message);
      }
      originals[idx] = data;
      outputs[idx] = out;
    });

    const originalCombined = originals.join('');
    const minifiedCombined = outputs.join('');

    const stats = calculateStats(originalCombined, minifiedCombined);

    if (programOptions.dry) {
      const inputSource = capturedFiles.join(', ');
      const outputDest = programOptions.output || 'STDOUT';
      console.error(`[DRY RUN] Would minify: ${inputSource} → ${outputDest}`);
      console.error(`  Original: ${stats.originalSize.toLocaleString()} bytes`);
      console.error(`  Minified: ${stats.minifiedSize.toLocaleString()} bytes`);
      console.error(`  Saved: ${stats.sign}${Math.abs(stats.saved).toLocaleString()} bytes (${stats.percentage}%)`);
      process.exit(0);
    }

    if (programOptions.verbose) {
      const inputSource = capturedFiles.join(', ');
      console.error(`  ✓ ${inputSource}: ${stats.originalSize.toLocaleString()} → ${stats.minifiedSize.toLocaleString()} bytes (${stats.sign}${Math.abs(stats.saved).toLocaleString()}, ${stats.percentage}%)`);
    }

    if (programOptions.output) {
      try {
        await fs.promises.mkdir(path.dirname(programOptions.output), { recursive: true });
        await fs.promises.writeFile(programOptions.output, minifiedCombined, 'utf8');
      } catch (err) {
        fatal('Cannot write ' + programOptions.output + '\n' + err.message);
      }
    } else {
      process.stdout.write(minifiedCombined);
    }
    process.exit(0);
  } else { // Minifying input coming from STDIN
    content = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (data) {
      content += data;
    }).on('end', async function() {
      await writeMinify();
      process.exit(0);
    });
  }
})();