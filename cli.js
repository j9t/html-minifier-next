#!/usr/bin/env node

/**
 * html-minifier-next CLI tool
 *
 * MIT License
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
import readline from 'readline';
import { Command, Option } from 'commander';

// Simple case conversion for CLI option names (ASCII-only, no Unicode needed)
/** @param {string} str */
const paramCase = (str) => str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
/** @param {string} str */
const camelCase = (str) => paramCase(str).replace(/-([a-z])/g, (_, c) => c.toUpperCase());

// Commander derives its internal option key by applying paramCase then camelCase to the flag name,
// stripping a leading `no-` first for negated flags (e.g., `--no-foo-bar` → `fooBar`);
// because option definition keys may differ from the result of that round-trip (e.g.,
// `minifyURLs` → Commander key `minifyUrls`, `noNewlinesBeforeTagClose` → `newlinesBeforeTagClose`),
// `commanderOptionKey` uses the same paramCase + camelCase path to compute the key Commander will use
/** @param {string} key */
const commanderOptionKey = (key) => {
  const pc = paramCase(key);
  return pc.startsWith('no-') ? camelCase(pc.slice(3)) : camelCase(pc);
};

// Lazy-load HMN to reduce CLI cold-start overhead
import { getPreset, getPresetNames } from './src/presets.js';
import { parseRegExp } from './src/lib/utils.js';
import { optionDefinitions } from './src/lib/option-definitions.js';

const pkg = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const EXTENSIONS_DEFAULT = ['html', 'htm', 'shtml', 'shtm'];
const EXTENSIONS_NON_HTML = new Set(['css', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'svg']);

const MARK_ERROR = process.stderr.isTTY ? '\x1b[31m' : '';
const MARK_SUCCESS = process.stderr.isTTY ? '\x1b[32m' : '';
const MARK_WARNING = process.stderr.isTTY ? '\x1b[33m' : '';
const MARK_RESET = process.stderr.isTTY ? '\x1b[0m' : '';

const program = new Command();
program.name(pkg.name);

/**
 * @param {string} message
 * @returns {never}
 */
function fatal(message) {
  console.error(`${MARK_ERROR}${message}${MARK_RESET}`);
  process.exit(1);
}

// `catch` bindings are `unknown`, and throw values need not be `Error`s
/** @param {unknown} err */
const errorMessage = (err) => err instanceof Error ? err.message : String(err);

// Handle broken pipe (e.g., when piping to `head`)
process.stdout.on('error', (/** @type {NodeJS.ErrnoException} */ err) => {
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

/** @param {string} value */
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

/** @param {string} value */
function parseJSONArray(value) {
  if (!value) return undefined;
  const parsed = parseJSON(value);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** @param {string} value */
function parseJSONRegExpArray(value) {
  const values = parseJSONArray(value);
  return values && values.map(parseRegExp);
}

/** @param {string} value */
const parseString = value => value;

/** @param {string} optionName */
const parseValidInt = (optionName) => (/** @type {string} */ value) => {
  const s = String(value).trim();
  // Accept only non-negative whole integers
  if (!/^\d+$/.test(s)) {
    fatal(`Invalid number for \`--${paramCase(optionName)}: "${value}"\``);
  }
  const num = Number(s);
  return num;
};

// Map option types to CLI parsers—`int` is resolved by `getParser`, as its
// parser closes over the option name for error messages
/** @type {Record<string, (value: string) => any>} */
const typeParsers = {
  regexp: parseRegExp,
  regexpArray: parseJSONRegExpArray,
  json: parseJSON,
  jsonObject: parseJSON,
  jsonArray: parseJSONArray,
  string: parseString
};

/**
 * @param {string} key Option definition key, for the `int` parser’s error messages
 * @param {string} type Option definition type
 * @returns {(value: string) => any}
 */
function getParser(key, type) {
  const parser = type === 'int' ? parseValidInt(key) : typeParsers[type];
  if (!parser) {
    fatal(`No CLI parser for option \`${key}\` (type \`${type}\`)—add the type to \`typeParsers\` in cli.js`);
  }
  return parser;
}

// Configure command-line flags from shared option definitions
const mainOptionKeys = Object.keys(optionDefinitions);
Object.entries(optionDefinitions).forEach(function ([key, { description, descriptionAffirmative, type }]) {
  const flag = paramCase(key);
  if (type === 'invertedBoolean') {
    // The positive form (to re-enable after a preset/config disables it) is hidden from
    // help—the footer note covers the convention; the negative form is the primary use case
    program.addOption(new Option('--' + flag, descriptionAffirmative ?? 'Enable --' + flag).hideHelp());
    program.option('--no-' + flag, description);
  } else if (type === 'boolean') {
    program.option('--' + flag, description);
    // The negation form is hidden from help—the footer note covers the convention;
    // skip options whose flag already starts with `no-` (currently only
    // `noNewlinesBeforeTagClose`), as `--no-no-X` is not usable
    if (!flag.startsWith('no-')) {
      program.addOption(new Option('--no-' + flag, 'Disable --' + flag).hideHelp());
    }
  } else {
    const cliFlag = '--' + flag + (type === 'json' || type === 'jsonObject' ? ' [value]' : ' <value>');
    program.option(cliFlag, description, getParser(key, type));
  }
});
program.option('-i --input <file>', 'Specify input file (alternative to positional argument; pair with `--output` for output)');
program.option('-o --output <file>', 'Specify output file (reads from `--input` file argument or STDIN; outputs to STDOUT if not specified)');
program.option('-v --verbose', 'Show detailed processing information');
program.option('-d --dry', 'Dry run: Process and report statistics without writing output');
program.addHelpText('after', '\nBoolean options support a `--no-<flag>` form to disable them, overriding a preset or config file (e.g., `--preset=comprehensive --no-collapse-whitespace`).');

// Lazy import wrapper for HMN
/** @type {Promise<typeof import('./src/htmlminifier.js').minify> | undefined} */
let minifyFnPromise;
async function getMinify() {
  if (!minifyFnPromise) {
    minifyFnPromise = import('./src/htmlminifier.js').then(m => m.minify);
  }
  return minifyFnPromise;
}

/** @param {string} file */
function readFile(file) {
  try {
    return fs.readFileSync(file, { encoding: 'utf8' });
  } catch (err) {
    fatal('Cannot read ' + file + '\n' + errorMessage(err));
  }
}

/**
 * Load config from a file path. Extensions .json, .js, and .mjs are handled
 * directly; for unknown extensions, JSON is tried first, then module import.
 * @param {string} configPath - Path to config file
 * @returns {Promise<Record<string, any>>} Loaded config object
 */
async function loadConfigFromPath(configPath) {
  const abs = path.resolve(configPath);
  const ext = path.extname(configPath).toLowerCase();

  if (ext === '.json') {
    try { return JSON.parse(readFile(abs).replace(/^\uFEFF/, '')); }
    catch (err) { fatal(`Cannot parse config file as JSON: ${errorMessage(err)}`); }
  }

  if (ext === '.js' || ext === '.mjs') {
    // `import()` handles both ESM and CJS .js files—Node resolves the type via the
    // nearest package.json `type` field, same as it does for regular module loading
    try { const mod = await import(pathToFileURL(abs).href); return 'default' in mod ? mod.default : mod; }
    catch (err) { fatal(`Cannot load config file: ${errorMessage(err)}`); }
  }

  // Unknown extension: Try JSON, then module import
  /** @type {unknown} */
  let jsonErr;
  try { return JSON.parse(readFile(abs).replace(/^\uFEFF/, '')); }
  catch (err) { jsonErr = err; }

  try { const mod = await import(pathToFileURL(abs).href); return 'default' in mod ? mod.default : mod; }
  catch (esmErr) {
    fatal(`Cannot read the specified config file.\nAs JSON: ${errorMessage(jsonErr)}\nAs module: ${errorMessage(esmErr)}`);
  }
}

// Config keys the CLI handles itself, beyond the options in `optionDefinitions`
const CONFIG_KEYS_EXTRA = new Set(['$schema', 'preset', 'fileExt', 'ignoreDir']);

// Default config files, looked up in the working directory in this order when
// `--config-file` isn’t specified
const CONFIG_FILES_DEFAULT = ['html-minifier-next.config.json', 'htmlminifier.config.json'];

/**
 * Normalize and validate config object by applying parsers and transforming values.
 * @param {Record<string, any>} config - Raw config object
 * @returns {Record<string, any>} Normalized config object
 */
function normalizeConfig(config) {
  /** @type {Record<string, any>} */
  const normalized = { ...config };

  // Warn about unrecognized config keys—catches typos as well as options removed in earlier versions
  Object.keys(normalized).forEach(function (key) {
    if (!Object.hasOwn(optionDefinitions, key) && !CONFIG_KEYS_EXTRA.has(key)) {
      console.error(`Ignoring unknown or deprecated config option \`${key}\` (see \`--help\` or README for available options)`);
    }
  });

  // Apply parsers to main options
  Object.entries(optionDefinitions).forEach(function ([key, { type }]) {
    if (key in normalized) {
      if (type !== 'boolean' && type !== 'invertedBoolean') {
        const value = normalized[key];
        normalized[key] = getParser(key, type)(typeof value === 'string' ? value : JSON.stringify(value));
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

/** @type {Record<string, any>} */
let config = {};
program.option('-z, --zero', 'Minify all HTML files in the current folder and its subfolders in place (except node_modules), using comprehensive settings (standalone—flag is ignored when combined with other options)');
program.option('-I --input-dir <dir>', 'Specify an input directory');
program.option('-X --ignore-dir <patterns>', 'Exclude directories—relative to input directory—from processing (comma-separated), e.g., `libs` or `libs,vendor,node_modules`');
program.option('-O --output-dir <dir>', 'Specify an output directory');
program.option('-f --file-ext <extensions>', 'Specify file extension(s) to process (comma-separated); defaults to `html,htm,shtml,shtm`; use `*` for all files');
program.option('-p --preset <name>', `Use a preset configuration (${getPresetNames().join(', ')})`);
program.option('-c --config-file <file>', 'Use config file');
program.version(pkg.version, '-V, --version', 'Output the version number');
program.helpOption('-h, --help', 'Display help for command');

/**
 * Progress state shared between the file walk and the indicator; `total` stays
 * `null` until the background count finishes
 * @typedef {{current: number, total: number | null}} Progress
 */

(async () => {
  /** @type {string} */
  let content;
  let filesProvided = false;
  /** @type {string[]} */
  let capturedFiles = [];
  await program.arguments('[files...]').action(function (files) {
    capturedFiles = files;
    filesProvided = files.length > 0;
    // Defer reading files until after check for consumed filenames
  }).parseAsync(process.argv);

  const programOptions = program.opts();

  // Check if any `parseJSON` options consumed a filename as their value
  // If so, treat the option as boolean true and add the filename back to the files list
  const jsonOptionKeys = ['minifyCss', 'minifyJs', 'minifyUrls'];
  for (const key of jsonOptionKeys) {
    const value = programOptions[key];
    if (typeof value === 'string' && /\.(html?|shtml?|xhtml?|php|xml|svg|jsx|tsx|vue|ejs|hbs|mustache|twig)$/i.test(value)) {
      // The option consumed a filename—inject it back
      programOptions[key] = true;
      capturedFiles.push(value);
      filesProvided = true;
    }
  }

  // If `--input` was specified, treat it as a positional file argument
  if (programOptions.input) {
    capturedFiles.unshift(programOptions.input);
    filesProvided = true;
  }

  // Handle zero config mode (standalone in-place minification of the current folder)
  if (programOptions.zero) {
    const hasOtherArgs = process.argv.slice(2).some(arg => arg !== '--zero' && arg !== '-z');
    if (hasOtherArgs) {
      console.error('Note: `--zero` was ignored—it can only be used on its own, to minify the current folder at comprehensive settings.');
    } else {
      const cwd = process.cwd();
      const [execPath = '', scriptPath = ''] = process.argv;
      const commandName = process.env.npm_command === 'exec'
        ? 'npx html-minifier-next'
        : scriptPath.endsWith('.js')
          ? `${path.basename(execPath)} ${scriptPath}`
          : path.basename(scriptPath);

      process.stderr.write(
        `${MARK_WARNING}Zero-config mode minifies all HTML files in the current folder and its subfolders (${cwd}) in place, using comprehensive settings. If you want to compare results and be able to revert, do this under version control.${MARK_RESET}\n` +
        `Equivalent to: ${commandName} --input-dir=. --output-dir=. --ignore-dir=node_modules --preset=comprehensive\n\n` +
        `Do you want to continue? [y/N] `
      );

      const answer = await new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin });
        rl.once('line', (line) => {
          resolve(line.trim().toLowerCase());
          rl.close();
        });
        rl.once('close', () => resolve(''));
      });

      if (answer !== 'y') {
        process.stderr.write(`${MARK_ERROR}In-place minification aborted.${MARK_RESET}\n`);
        process.exit(0);
      }

      // Apply comprehensive preset for all processing
      programOptions.preset = 'comprehensive';

      const inputDirResolved = await fs.promises.realpath(cwd).catch(() => cwd);
      const extensions = EXTENSIONS_DEFAULT;
      const ignorePatterns = ['node_modules'];

      const showProgress = process.stderr.isTTY;
      /** @type {Progress | null} */
      let progress = null;
      if (showProgress) {
        progress = { current: 0, total: null };
      }

      const allFiles = await collectFiles(cwd, extensions, undefined, ignorePatterns, inputDirResolved);
      const concurrency = Math.max(1, Math.min(os.cpus().length || 4, 8));

      if (progress) {
        progress.total = allFiles.length;
      }

      await runWithConcurrency(allFiles, concurrency, async (file) => {
        await processFile(file, file, false, false);
        if (progress) {
          progress.current++;
          updateProgress(progress.current, progress.total);
        }
      });

      if (progress) {
        clearProgress();
      }
      console.error(`${MARK_SUCCESS}Processed ${allFiles.length.toLocaleString()} file${allFiles.length === 1 ? '' : 's'}.${MARK_RESET}`);

      process.exit(0);
    }
  }

  // Load and normalize config if `--config-file` was specified; otherwise look
  // for a default config file in the working directory
  if (programOptions.configFile) {
    config = await loadConfigFromPath(programOptions.configFile);
    config = normalizeConfig(config);
  } else {
    const configFileDefault = CONFIG_FILES_DEFAULT.find(name => fs.existsSync(path.resolve(name)));
    if (configFileDefault) {
      console.error(`Using config file ${configFileDefault}`);
      config = normalizeConfig(await loadConfigFromPath(configFileDefault));
    }
  }

  function createOptions() {
    /** @type {Record<string, any>} */
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
    Object.entries(optionDefinitions).forEach(function ([key, { type }]) {
      const ck = commanderOptionKey(key);
      if (program.getOptionValueSource(ck) === 'cli') {
        const val = programOptions[ck];
        // For boolean options whose param-case name starts with `no-`, Commander treats
        // the flag as a negation and stores the inverted value under the stripped key;
        // invert back so the option definition key gets the intended value
        options[key] = (type === 'boolean' && paramCase(key).startsWith('no-')) ? !val : val;
      }
    });

    // 4. Surface minifier diagnostics when verbose
    if (programOptions.verbose || programOptions.dry) {
      options.log = (/** @type {unknown} */ message) => {
        // The hook carries the minifier’s per-call timing as well, which the run's own
        // per-file statistics already cover
        if (typeof message === 'string' && message.startsWith('minified in: ')) {
          return;
        }
        // Only `continueOnMinifyError` passes `Error` objects, always after leaving the
        // offending content unminified—so say that
        if (message instanceof Error) {
          console.error(`  ${MARK_WARNING}Warning: Minification failed, content left as-is: ${message.message || message}${MARK_RESET}`);
        } else if (String(message).startsWith('Warning: ') || String(message).startsWith('HTML Minifier Next: ')) {
          console.error(`  ${MARK_WARNING}${message}${MARK_RESET}`);
        } else {
          console.error(`  ${message}`);
        }
      };
    }

    return options;
  }

  /** @param {Record<string, unknown>} minifierOptions */
  function getActiveOptionsDisplay(minifierOptions) {
    const presetName = programOptions.preset || config.preset;
    if (presetName) {
      console.error(`Using preset: ${presetName}`);
    }
    const activeOptions = Object.entries(minifierOptions)
      .filter(([k]) => program.getOptionValueSource(commanderOptionKey(k)) === 'cli')
      .map(([k, v]) => (typeof v === 'boolean' ? (v ? k : `no-${k}`) : k));
    if (activeOptions.length > 0) {
      console.error('CLI options: ' + activeOptions.join(', '));
    }
  }

  /**
   * @param {string} original
   * @param {string} minified
   */
  function calculateStats(original, minified) {
    const originalSize = Buffer.byteLength(original, 'utf8');
    const minifiedSize = Buffer.byteLength(minified, 'utf8');
    const saved = originalSize - minifiedSize;
    const sign = saved >= 0 ? '-' : '+';
    const percentage = originalSize ? ((Math.abs(saved) / originalSize) * 100).toFixed(1) : '0.0';
    return { originalSize, minifiedSize, saved, sign, percentage };
  }

  // Print a one-line-per-cache hits/misses/size summary to STDERR, skipping caches
  // that were never touched (e.g., their minifier is disabled)
  async function printCacheStats() {
    const { getCacheStats } = await import('./src/htmlminifier.js');
    const cacheStats = getCacheStats();
    /** @type {Record<string, string>} */
    const labels = { css: 'CSS', js: 'JS', svg: 'SVG' };

    /** @type {string[]} */
    const lines = [];
    for (const [key, { gets, hits, size, limit }] of Object.entries(cacheStats)) {
      if (gets === 0) continue;
      const misses = gets - hits;
      lines.push(`  ${labels[key]} cache: ${hits.toLocaleString()} hit${hits === 1 ? '' : 's'}, ${misses.toLocaleString()} miss${misses === 1 ? '' : 'es'}, ${size.toLocaleString()}/${limit.toLocaleString()} entries`);
    }

    if (lines.length === 0) return;
    console.error('Cache stats:');
    lines.forEach(line => console.error(line));
  }

  /**
   * @param {string} inputFile
   * @param {string} outputFile
   * @param {boolean} [isDryRun]
   * @param {boolean} [isVerbose]
   */
  async function processFile(inputFile, outputFile, isDryRun = false, isVerbose = false) {
    const data = await fs.promises.readFile(inputFile, { encoding: 'utf8' }).catch(err => {
      fatal('Cannot read ' + inputFile + '\n' + errorMessage(err));
    });

    let minified;
    try {
      const minify = await getMinify();
      minified = await minify(data, createOptions());
    } catch (err) {
      fatal('Minification error on ' + inputFile + '\n' + errorMessage(err));
    }

    const stats = calculateStats(data, minified);

    // Show stats if dry run or verbose mode
    if (isDryRun || isVerbose) {
      console.error(`  ${MARK_SUCCESS}✓${MARK_RESET} ${path.relative(process.cwd(), inputFile)}: ${stats.originalSize.toLocaleString()} → ${stats.minifiedSize.toLocaleString()} bytes (${stats.sign}${Math.abs(stats.saved).toLocaleString()}, ${stats.percentage}%)`);
    }

    if (isDryRun) {
      return { originalSize: stats.originalSize, minifiedSize: stats.minifiedSize, saved: stats.saved };
    }

    await fs.promises.writeFile(outputFile, minified, { encoding: 'utf8' }).catch(err => {
      fatal('Cannot write ' + outputFile + '\n' + err.message);
    });

    return { originalSize: stats.originalSize, minifiedSize: stats.minifiedSize, saved: stats.saved };
  }

  /**
   * @param {string} fileExt
   * @returns {string[]}
   */
  function parseFileExtensions(fileExt) {
    if (!fileExt) return [];
    if (fileExt.trim() === '*') return ['*'];
    const list = fileExt
      .split(',')
      .map(ext => ext.trim().replace(/^\.+/, '').toLowerCase())
      .filter(ext => ext.length > 0);
    return [...new Set(list)];
  }

  /**
   * @param {string} filename
   * @param {string[]} fileExtensions
   */
  function shouldProcessFile(filename, fileExtensions) {
    // Wildcard: process all files
    if (fileExtensions.includes('*')) {
      return true;
    }

    const fileExt = path.extname(filename).replace(/^\.+/, '').toLowerCase();
    return fileExtensions.includes(fileExt);
  }

  /**
   * Parse comma-separated ignore patterns into an array.
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
   * Check if a directory should be ignored based on ignore patterns.
   * Supports matching by directory name or relative path.
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

  /**
   * @param {string} dir
   * @param {string[]} extensions
   * @param {string | undefined} skipRootAbs
   * @param {string[]} ignorePatterns
   * @param {string} baseDir
   * @returns {Promise<number>}
   */
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

  /**
   * @param {number} current
   * @param {number | null} total
   */
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
  /**
   * @template T, R
   * @param {T[]} items
   * @param {number} limit
   * @param {(item: T, index: number) => Promise<R>} worker
   * @returns {Promise<R[]>}
   */
  async function runWithConcurrency(items, limit, worker) {
    /** @type {R[]} */
    const results = new Array(items.length);
    let next = 0;
    let active = 0;
    return new Promise((resolve, reject) => {
      const launch = () => {
        while (active < limit && next < items.length) {
          const current = next++;
          const item = /** @type {T} */ (items[current]);
          active++;
          Promise.resolve(worker(item, current))
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

  /**
   * @param {string} dir
   * @param {string[]} extensions
   * @param {string | undefined} skipRootAbs
   * @param {string[]} ignorePatterns
   * @param {string} baseDir
   * @returns {Promise<string[]>}
   */
  async function collectFiles(dir, extensions, skipRootAbs, ignorePatterns, baseDir) {
    /** @type {string[]} */
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

  /**
   * @param {string} inputDir
   * @param {string} outputDir
   * @param {string | string[]} extensions
   * @param {boolean} [isDryRun]
   * @param {boolean} [isVerbose]
   * @param {string} [skipRootAbs]
   * @param {Progress | null} [progress]
   * @param {string[]} [ignorePatterns]
   * @param {string | null} [baseDir]
   */
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
          fatal('Cannot create directory ' + outDir + '\n' + errorMessage(err));
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
      fatal('Minification error:\n' + errorMessage(err));
    }

    const stats = calculateStats(content, minified);

    if (programOptions.dry) {
      const inputSource = program.args.length > 0 ? program.args.join(', ') : 'STDIN';
      const outputDest = programOptions.output || 'STDOUT';

      console.error(`[DRY RUN] Would minify: ${inputSource} → ${outputDest}`);
      console.error(`  Original: ${stats.originalSize.toLocaleString()} bytes`);
      console.error(`  Minified: ${stats.minifiedSize.toLocaleString()} bytes`);
      console.error(`  Saved: ${stats.sign}${Math.abs(stats.saved).toLocaleString()} bytes (${stats.percentage}%)`);
      await printCacheStats();
      return;
    }

    // Show stats if verbose
    if (programOptions.verbose) {
      const inputSource = program.args.length > 0 ? program.args.join(', ') : 'STDIN';
      console.error(`  ${MARK_SUCCESS}✓${MARK_RESET} ${inputSource}: ${stats.originalSize.toLocaleString()} → ${stats.minifiedSize.toLocaleString()} bytes (${stats.sign}${Math.abs(stats.saved).toLocaleString()}, ${stats.percentage}%)`);
      await printCacheStats();
    }

    if (programOptions.output) {
      try {
        await fs.promises.mkdir(path.dirname(programOptions.output), { recursive: true });
        await fs.promises.writeFile(programOptions.output, minified, { encoding: 'utf8' });
      } catch (err) {
        fatal('Cannot write ' + programOptions.output + '\n' + errorMessage(err));
      }
      return;
    }

    process.stdout.write(minified);
  };

  const { inputDir, outputDir, fileExt, ignoreDir } = programOptions;

  // Resolve file extensions: CLI argument > config file > defaults
  const hasCliFileExt = program.getOptionValueSource('fileExt') === 'cli';
  const resolvedFileExt = hasCliFileExt ? (fileExt || '*') : (config.fileExt || EXTENSIONS_DEFAULT);

  // Resolve ignore patterns: CLI argument takes priority over config file
  const hasCliIgnoreDir = program.getOptionValueSource('ignoreDir') === 'cli';
  const resolvedIgnoreDir = hasCliIgnoreDir ? ignoreDir : config.ignoreDir;

  if (inputDir || outputDir) {
    if (!inputDir) {
      fatal('The option `output-dir` needs to be used with the option `input-dir`—if you are working with a single file, use `--input`/`--output`');
    } else if (!outputDir) {
      fatal('You need to specify where to write the output files with the option `--output-dir`');
    }

    {
      const extList = Array.isArray(resolvedFileExt) ? resolvedFileExt : parseFileExtensions(String(resolvedFileExt || ''));
      const isWildcard = extList.includes('*');
      const nonHtmlExts = isWildcard ? [] : extList.filter(e => EXTENSIONS_NON_HTML.has(e));
      if (isWildcard || nonHtmlExts.length > 0) {
        const label = isWildcard ? 'all file types' : nonHtmlExts.map(e => `.${e}`).join(', ');
        console.error(`${MARK_WARNING}Warning: Processing ${label}—HTML Minifier Next processes CSS, JavaScript, and SVG only when embedded in HTML. Non-HTML files may produce incomplete or broken output.${MARK_RESET}`);
      }
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
      let outputReal;
      const inputReal = await fs.promises.realpath(inputDir).catch(() => undefined);
      try {
        outputReal = await fs.promises.realpath(outputDir);
      } catch {
        outputReal = path.resolve(outputDir);
      }
      let skipRootAbs;
      if (inputReal && outputReal && outputReal !== inputReal && outputReal.startsWith(inputReal + path.sep)) {
        // Skip traversing into the output directory when it is nested inside the input directory
        skipRootAbs = outputReal;
      }

      if (programOptions.dry) {
        console.error(`[DRY RUN] Would process directory: ${inputDir} → ${outputDir}`);
      }

      // Set up progress indicator (only in TTY and when not verbose/dry)
      const showProgress = process.stderr.isTTY && !isVerbose;
      /** @type {Progress | null} */
      let progress = null;

      // Parse ignore patterns
      const ignorePatterns = parseIgnorePatterns(resolvedIgnoreDir);

      // Validate that the input directory exists and is readable
      try {
        const stat = await fs.promises.stat(inputDir);
        if (!stat.isDirectory()) {
          fatal(`${inputDir} is not a directory—to minify a single file, use \`--input\`/\`--output\`: html-minifier-next [options] -i ${inputDir} -o <output-file>`);
        }
      } catch (err) {
        fatal('Cannot read directory ' + inputDir + '\n' + errorMessage(err));
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
        console.error(`${MARK_SUCCESS}Processed ${progress.current.toLocaleString()} file${progress.current === 1 ? '' : 's'}.${MARK_RESET}`);
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

      if (isVerbose) {
        await printCacheStats();
      }
    })();
  } else if (filesProvided) { // Minifying one or more files specified on the CMD line
    // Process each file independently, then concatenate outputs
    const minifierOptions = createOptions();
    // Show config info if verbose/dry
    if (programOptions.verbose || programOptions.dry) {
      getActiveOptionsDisplay(minifierOptions);
    }

    for (const file of capturedFiles) {
      const ext = path.extname(file).replace(/^\./, '').toLowerCase();
      if (EXTENSIONS_NON_HTML.has(ext)) {
        console.error(`${MARK_WARNING}Warning: ${path.basename(file)} does not appear to be an HTML file—HTML Minifier Next processes CSS, JavaScript, and SVG only when embedded in HTML. The output may be incomplete or broken.${MARK_RESET}`);
      }
    }

    const concurrency = Math.max(1, Math.min(os.cpus().length || 4, 8));
    const inputs = capturedFiles.slice();

    // Read originals and minify in parallel with bounded concurrency
    const originals = new Array(inputs.length);
    const outputs = new Array(inputs.length);

    await runWithConcurrency(inputs, concurrency, async (file, idx) => {
      const data = await fs.promises.readFile(file, 'utf8').catch(err => fatal('Cannot read ' + file + '\n' + errorMessage(err)));
      const minify = await getMinify();
      let out;
      try {
        out = await minify(data, minifierOptions);
      } catch (err) {
        fatal('Minification error on ' + file + '\n' + errorMessage(err));
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
      await printCacheStats();
      process.exit(0);
    }

    if (programOptions.verbose) {
      const inputSource = capturedFiles.join(', ');
      console.error(`  ${MARK_SUCCESS}✓${MARK_RESET} ${inputSource}: ${stats.originalSize.toLocaleString()} → ${stats.minifiedSize.toLocaleString()} bytes (${stats.sign}${Math.abs(stats.saved).toLocaleString()}, ${stats.percentage}%)`);
      await printCacheStats();
    }

    if (programOptions.output) {
      try {
        await fs.promises.mkdir(path.dirname(programOptions.output), { recursive: true });
        await fs.promises.writeFile(programOptions.output, minifiedCombined, 'utf8');
      } catch (err) {
        fatal('Cannot write ' + programOptions.output + '\n' + errorMessage(err));
      }
    } else {
      process.stdout.write(minifiedCombined);
    }
    process.exit(0);
  } else { // Minifying input coming from STDIN
    content = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', function (/** @type {string} */ data) {
      content += data;
    }).on('end', async function() {
      await writeMinify();
      process.exit(0);
    });
  }
})();