#!/usr/bin/env node

// Working-tree benchmark for HTML Minifier Next.
//
// Times the current working-tree minifier against the local corpus
// (backtest/input) and reports per-file output size (raw and compressed) and
// processing time. Unlike backtest.js (which walks Git history), this measures the
// code exactly as it is right now—ideal for A/B testing a branch against a saved baseline.
//
// Usage (from the backtest folder):
//   npm run benchmark: Run; if a baseline exists, show deltas
//   npm run benchmark -- --save: Run and save the result as the baseline
//   npm run benchmark -- --core: Disable external minifiers (CSS/JS/SVG/URLs) to isolate HMN’s processing time
//   npm run benchmark -- --cold: Switch the minification caches off so CSS/JS/SVG work is
//     redone every iteration—without this, warm caches hide any change to those minifiers
//   npm run benchmark -- --iterations=10
//   npm run benchmark -- --config=path/to/config.json
//   npm run benchmark -- --preset=comprehensive: Use a preset instead of the options file
//
// The corpus is shared with backtest.js; run `npm run backtest` once to download it.

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { getPreset, getPresetNames } from '../src/presets.js';
import { BROTLI_QUALITY, GZIP_LEVEL, compressedSizes } from './compression.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One warm-up run (discarded) plus this many timed iterations
const BENCH_WARMUP = 1;
const DEFAULT_ITERATIONS = 5;

const DEFAULT_CONFIG = 'html-minifier-next.config.json';

// Cache sizes applied by `--cold`—zero switches a cache off, so no lookup can hit
const COLD_CACHE_SIZES = { cacheCSS: 0, cacheJS: 0, cacheSVG: 0 };

// External minifiers disabled by `--core` to surface HMN’s time
const CORE_DISABLED_OPTIONS = ['minifyCSS', 'minifyJS', 'minifySVG', 'minifyURLs'];

// Above this much spread between the fastest and slowest iteration, a run cannot
// resolve the kind of change this benchmark is usually used to check
const NOISE_WARN_PCT = 15;

const PATH_BASELINE = path.join(__dirname, 'benchmark-baseline.json');

// Which iteration a saved `time` stands for; a baseline naming another one is not comparable
const METRIC = 'fastest';

/** @param {{metric?: string, files?: Record<string, {spread?: number}>}} baseline */
function baselineMetric(baseline) {
  if (baseline.metric) {
    return baseline.metric;
  }
  const files = Object.values(baseline.files ?? {});
  return files.length && files.every(file => file.spread !== undefined) ? METRIC : 'median';
}

// Merge a named preset under the other options, as `minify()` would—resolved up front so
// that `optionsForSite()` also reaches a `minifyURLs` that comes from the preset
function resolvePreset(options) {
  if (!options.preset) {
    return options;
  }
  const preset = getPreset(options.preset);
  if (!preset) {
    throw new Error(`Unknown preset “${options.preset}”; available presets: ${getPresetNames().join(', ')}`);
  }
  const optionsRest = { ...options };
  delete optionsRest.preset;
  return { ...preset, ...optionsRest };
}

// Options for one corpus file: An enabled `minifyURLs` resolves URLs against the file’s site
function optionsForSite(options, site) {
  const result = { ...options };
  if (result.minifyURLs) {
    result.minifyURLs = typeof result.minifyURLs === 'object'
      ? { ...result.minifyURLs, site }
      : { site };
  }
  return result;
}

// Compressed sizes from other levels (or a baseline predating them) are not comparable
function compressionComparable(baseline) {
  return Boolean(baseline && baseline.compression &&
    baseline.compression.gzip === GZIP_LEVEL && baseline.compression.brotli === BROTLI_QUALITY);
}

// Settings that would make a comparison with the baseline not apples-to-apples
function baselineMismatches(baseline, args) {
  const mismatches = [];
  if (baseline.core !== args.core) {
    mismatches.push(`core ${baseline.core} → ${args.core}`);
  }
  if (Boolean(baseline.cold) !== args.cold) {
    mismatches.push(`cold ${Boolean(baseline.cold)} → ${args.cold}`);
  }
  if (baseline.iterations !== args.iterations) {
    mismatches.push(`iterations ${baseline.iterations} → ${args.iterations}`);
  }
  if ((baseline.config ?? null) !== args.config) {
    mismatches.push(`config ${baseline.config ?? 'none'} → ${args.config ?? 'none'}`);
  }
  if ((baseline.preset ?? null) !== args.preset) {
    mismatches.push(`preset ${baseline.preset ?? 'none'} → ${args.preset ?? 'none'}`);
  }
  return mismatches;
}

function parseArgs(argv) {
  const args = { save: false, core: false, cold: false, iterations: DEFAULT_ITERATIONS, config: null, preset: null };
  for (const arg of argv) {
    if (arg === '--save') {
      args.save = true;
    } else if (arg === '--core') {
      args.core = true;
    } else if (arg === '--cold') {
      args.cold = true;
    } else if (arg.startsWith('--iterations=')) {
      const n = parseInt(arg.slice('--iterations='.length), 10);
      args.iterations = Number.isNaN(n) ? DEFAULT_ITERATIONS : Math.max(1, n);
    } else if (arg.startsWith('--config=')) {
      args.config = arg.slice('--config='.length);
    } else if (arg.startsWith('--preset=')) {
      args.preset = arg.slice('--preset='.length);
    } else {
      console.error(`Warning: Unrecognized argument “${arg}”`);
    }
  }
  if (args.config && args.preset) {
    throw new Error('Use either `--config` or `--preset`, not both (an options file can name a `preset` itself)');
  }
  if (!args.preset) {
    args.config ??= DEFAULT_CONFIG;
  }
  return args;
}

function formatBytes(n) {
  return n.toLocaleString('en-US');
}

// Render a “(±N%)” suffix comparing a current value to its baseline
function formatDelta(curr, prev) {
  if (prev == null || prev === 0) {
    return '';
  }
  const delta = curr - prev;
  if (delta === 0) {
    return ' (±0%)';
  }
  // Two decimals, as compressed sizes often move by less than 0.1%
  const pct = ((delta / prev) * 100).toFixed(2);
  return ` (${delta > 0 ? '+' : ''}${pct}%)`;
}

// Interference can only ever make a run slower, so the fastest iteration is the most
// stable estimate of the code’s cost and the one deltas are computed from
function fastest(values) {
  return Math.min(...values);
}

// How reproducible the reported figure is: Split the iterations in half and compare
// what each half would have reported. This answers the question a delta actually
// depends on—“how much would this number move if I ran it again?”—and, unlike the
// spread between fastest and slowest, it tightens rather than inflates as iterations
// are added, because it does not chase the single worst outlier. One iteration has no
// halves to compare, and reports nothing rather than a zero that would read as a
// perfectly reproducible run.
function reproducibility(values) {
  if (values.length < 2) {
    return null;
  }
  const half = Math.floor(values.length / 2);
  const lowFirst = Math.min(...values.slice(0, half));
  const lowSecond = Math.min(...values.slice(half));
  const low = Math.min(lowFirst, lowSecond);
  return low === 0 ? 0 : (Math.abs(lowFirst - lowSecond) / low) * 100;
}

// Spread between the fastest and slowest iteration—reported for diagnosis only, since
// one descheduled run is enough to blow it up
function spread(values) {
  const low = Math.min(...values);
  return low === 0 ? 0 : ((Math.max(...values) - low) / low) * 100;
}

// Render a delta that is smaller than the run’s own noise as “~”, so a difference the
// measurement cannot actually resolve never reads as a win or a regression
function formatTimeDelta(curr, prev, noisePct) {
  if (prev == null || prev === 0) {
    return '';
  }
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) <= noisePct) {
    return ` (~${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%, within noise)`;
  }
  return ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Read and parse required JSON file
async function readJSON(pathFile, label) {
  let text;
  try {
    text = await fs.readFile(pathFile, 'utf8');
  } catch (err) {
    console.error(`Failed to read ${label} (${pathFile}): ${err.message}`);
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`Failed to parse ${label} (${pathFile}): ${err.message}`);
    process.exit(1);
  }
}

// Current Git branch and short commit, or null when unavailable
function getGitInfo() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
    const commit = execSync('git rev-parse --short HEAD', { cwd: __dirname, encoding: 'utf8' }).trim();
    return { branch, commit };
  } catch {
    return null;
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }

  const { minify } = await import('../src/htmlminifier.js');

  const urls = await readJSON(path.join(__dirname, 'sites.json'), 'sites.json');
  const fileNames = Object.keys(urls);
  const dirInput = path.join(__dirname, 'input');

  let baseOptions;
  try {
    baseOptions = resolvePreset(args.preset ? { preset: args.preset } : await readJSON(path.resolve(__dirname, args.config), args.config));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
  if (args.core) {
    for (const key of CORE_DISABLED_OPTIONS) {
      baseOptions[key] = false;
    }
  }
  if (args.cold) {
    Object.assign(baseOptions, COLD_CACHE_SIZES);
  }

  // Load an existing baseline for delta reporting (skipped when saving a new one)
  let baseline = null;
  if (!args.save) {
    try {
      baseline = JSON.parse(await fs.readFile(PATH_BASELINE, 'utf8'));
      // `time` held the median before it held the fastest iteration, and a median never
      // reads faster—comparing across the two would show an improvement that is not there.
      // A baseline predating the marker names its metric by whether it carries the
      // per-file fields introduced alongside it.
      if (baseline && baselineMetric(baseline) !== METRIC) {
        console.log(`Warning: Ignoring baseline saved with an older timing metric—re-run with \`--save\` to compare against ${METRIC}-iteration times`);
        baseline = null;
      }
    } catch (err) {
      // Whatever the baseline turned out to be, it’s not something to compare against
      baseline = null;
      // A missing baseline is normal (first run reports absolute numbers only);
      // anything else (corrupt JSON, malformed entries, permissions) is worth surfacing
      if (err.code !== 'ENOENT') {
        console.error(`Warning: Ignoring unreadable baseline (${PATH_BASELINE}): ${err.message}`);
      }
    }
  }

  const modes = [args.core ? 'core: external minifiers disabled' : '', args.cold ? 'cold: caches off, so CSS/JS/SVG work is redone every iteration' : ''].filter(Boolean);
  console.log(`Benchmarking ${fileNames.length} file(s)${modes.length ? ' (' + modes.join('; ') + ')' : ''}, fastest of ${args.iterations} iteration(s)`);
  console.log(`* Options: ${args.preset ? `preset “${args.preset}”` : args.config}; compressed with Gzip level ${GZIP_LEVEL} and Brotli quality ${BROTLI_QUALITY}`);

  const compareCompressed = compressionComparable(baseline);

  if (baseline) {
    const origin = baseline.git ? `${baseline.git.branch} @ ${baseline.git.commit}` : '(unknown revision)';
    const when = baseline.created ? new Date(baseline.created).toLocaleString() : 'unknown date';
    console.log(`Comparing against baseline: ${origin} (saved ${when})`);

    const mismatches = baselineMismatches(baseline, args);
    if (mismatches.length) {
      console.log(`* Warning: Baseline settings differ (${mismatches.join('; ')})—deltas may not be comparable`);
    }
    if (!compareCompressed) {
      console.log('* Note: Baseline has no compressed sizes at these levels—re-run with `--save` to compare them');
    }
  }
  console.log('');

  const results = {};
  const noises = [];
  let sizeTotal = 0, gzipTotal = 0, brotliTotal = 0, timeTotal = 0;
  let sizeTotalBase = 0, gzipTotalBase = 0, brotliTotalBase = 0, timeTotalBase = 0, noiseWeightedBase = 0;
  let processed = 0, matched = 0, matchedCompressed = 0;

  for (const fileName of fileNames) {
    const pathFile = path.join(dirInput, fileName + '.html');
    let data;
    try {
      data = await fs.readFile(pathFile, 'utf8');
    } catch {
      console.error(`Skipping ${fileName}: input not found (run \`npm run backtest\` once to download the corpus)`);
      continue;
    }

    const opts = optionsForSite(baseOptions, urls[fileName]);

    for (let i = 0; i < BENCH_WARMUP; i++) {
      await minify(data, opts);
    }

    const times = [];
    let minified;
    for (let i = 0; i < args.iterations; i++) {
      const t0 = performance.now();
      minified = await minify(data, opts);
      times.push(performance.now() - t0);
    }
    const time = fastest(times);
    const noise = reproducibility(times);
    const worst = spread(times);
    const size = Buffer.byteLength(minified);
    // Compressed once, outside the timed iterations
    const { gzip, brotli } = compressedSizes(minified);
    noises.push({ noise, worst, time });

    results[fileName] = {
      size,
      gzip,
      brotli,
      time: Math.round(time * 100) / 100,
      median: Math.round(median(times) * 100) / 100,
      spread: noise === null ? null : Math.round(noise * 10) / 10
    };
    sizeTotal += size;
    gzipTotal += gzip;
    brotliTotal += brotli;
    timeTotal += time;
    processed++;

    const prev = baseline && baseline.files && baseline.files[fileName];
    if (prev) {
      sizeTotalBase += prev.size;
      timeTotalBase += prev.time;
      noiseWeightedBase += (prev.spread != null ? prev.spread : 0) * prev.time;
      matched++;
    }
    const prevCompressed = compareCompressed && prev && prev.gzip != null && prev.brotli != null ? prev : null;
    if (prevCompressed) {
      gzipTotalBase += prevCompressed.gzip;
      brotliTotalBase += prevCompressed.brotli;
      matchedCompressed++;
    }
    // A delta has to clear both runs’ noise, so widen the band by the baseline’s own spread
    const band = (noise ?? 0) + (prev && prev.spread != null ? prev.spread : 0);
    const sizeStr = `${formatBytes(size)} B${prev ? formatDelta(size, prev.size) : ''}`;
    const gzipStr = `Gzip ${formatBytes(gzip)}${prevCompressed ? formatDelta(gzip, prevCompressed.gzip) : ''}`;
    const brotliStr = `Brotli ${formatBytes(brotli)}${prevCompressed ? formatDelta(brotli, prevCompressed.brotli) : ''}`;
    const timeStr = `${time.toFixed(1)} ms${prev ? formatTimeDelta(time, prev.time, band) : ''}${noise === null ? '' : ` ±${noise.toFixed(0)}%`}`;
    console.log(`${fileName.padEnd(24)} ${sizeStr.padEnd(26)} ${gzipStr.padEnd(26)} ${brotliStr.padEnd(28)} @ ${timeStr}`);
  }

  if (!processed) {
    console.error('\nNo input files found. Run `npm run backtest` once to download the corpus.');
    process.exit(1);
  }

  // Only show total deltas when every processed file has a baseline entry, so the
  // current and baseline totals cover the same files (an apples-to-apples comparison)
  const compareTotals = baseline && matched === processed;
  const sizeStrTotal = `${formatBytes(sizeTotal)} B${compareTotals ? formatDelta(sizeTotal, sizeTotalBase) : ''}`;
  const compareTotalsCompressed = compareTotals && matchedCompressed === processed;
  const gzipStrTotal = `Gzip ${formatBytes(gzipTotal)}${compareTotalsCompressed ? formatDelta(gzipTotal, gzipTotalBase) : ''}`;
  const brotliStrTotal = `Brotli ${formatBytes(brotliTotal)}${compareTotalsCompressed ? formatDelta(brotliTotal, brotliTotalBase) : ''}`;
  // Every file ran the same number of iterations, so noise is either measured or not
  const noiseMeasured = noises.every(n => n.noise !== null);
  const noiseTypical = noiseMeasured ? median(noises.map(n => n.noise)) : null;
  // The total is dominated by the big files, which are also the precisely measured
  // ones, so weight its noise band by each file’s share of the time rather than
  // letting a 3 ms file with a wide spread set the bar for the whole run
  const timeWeighted = noiseMeasured ? noises.reduce((sum, n) => sum + n.noise * n.time, 0) : 0;
  const noiseTotal = noiseMeasured ? (timeTotal > 0 ? timeWeighted / timeTotal : noiseTypical) : null;
  // As for a single file, a delta has to clear both runs’ noise
  const noiseTotalBase = timeTotalBase > 0 ? noiseWeightedBase / timeTotalBase : 0;
  const timeStrTotal = `${timeTotal.toFixed(1)} ms${compareTotals ? formatTimeDelta(timeTotal, timeTotalBase, (noiseTotal ?? 0) + noiseTotalBase) : ''}`;
  console.log(`\n${'Total'.padEnd(24)} ${sizeStrTotal.padEnd(26)} ${gzipStrTotal.padEnd(26)} ${brotliStrTotal.padEnd(28)} @ ${timeStrTotal}`);
  if (baseline && matched !== processed) {
    console.log(`Note: Total deltas omitted—only ${matched} of ${processed} processed file(s) have a baseline entry`);
  }

  // Deltas below the machine’s own noise floor mean nothing, so say what that floor is
  if (!noiseMeasured) {
    console.log('\nNoise: Unmeasured—a single iteration cannot say how much the times above would move on a re-run, so no delta is qualified as noise. Raise `--iterations` to get a band.');
  } else {
    const noiseWorst = noises.length ? Math.max(...noises.map(n => n.worst)) : 0;
    console.log(`\nNoise: ${noiseTotal.toFixed(1)}% on the total, ${noiseTypical.toFixed(1)}% typical per file (how much the reported figure moves between iteration halves; worst fastest-to-slowest spread was ${noiseWorst.toFixed(0)}%)`);
    if (noiseTotal > NOISE_WARN_PCT) {
      console.log(`Warning: This machine is too noisy to resolve changes under ~${noiseTotal.toFixed(0)}% on the total. Close other applications, or raise \`--iterations\`.`);
    }
  }

  if (args.save) {
    const payload = {
      created: new Date().toISOString(),
      git: getGitInfo(),
      metric: METRIC,
      core: args.core,
      cold: args.cold,
      iterations: args.iterations,
      config: args.config,
      preset: args.preset,
      compression: { gzip: GZIP_LEVEL, brotli: BROTLI_QUALITY },
      files: results
    };
    await fs.writeFile(PATH_BASELINE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline saved to ${path.relative(process.cwd(), PATH_BASELINE)} (${processed} file(s))`);
  }
}

// Run when executed as a script (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

// Exports

export {
  DEFAULT_CONFIG,
  DEFAULT_ITERATIONS,
  baselineMetric,
  baselineMismatches,
  compressionComparable,
  fastest,
  formatDelta,
  formatTimeDelta,
  median,
  optionsForSite,
  parseArgs,
  reproducibility,
  resolvePreset,
  spread
};