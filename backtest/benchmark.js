#!/usr/bin/env node

// Working-tree benchmark for HTML Minifier Next.
//
// Times the current working-tree minifier against the local corpus
// (backtest/input) and reports per-file output size and median processing time.
// Unlike backtest.js (which walks Git history), this measures the code exactly as
// it is right now—ideal for A/B testing a branch against a saved baseline.
//
// Usage (from the backtest folder):
//   npm run benchmark: Run; if a baseline exists, show deltas
//   npm run benchmark -- --save: Run and save the result as the baseline
//   npm run benchmark -- --core: Disable external minifiers (CSS/JS/SVG/URLs) to isolate HMN’s processing time
//   npm run benchmark -- --cold: Shrink the minification caches so most CSS/JS/SVG work is
//     redone every iteration—without this, warm caches hide any change to those minifiers
//   npm run benchmark -- --iterations=10
//   npm run benchmark -- --config=path/to/config.json
//
// The corpus is shared with backtest.js; run `npm run backtest` once to download it.

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One warm-up run (discarded) plus this many timed iterations; the median is reported
const BENCH_WARMUP = 1;
const DEFAULT_ITERATIONS = 5;

// Cache sizes applied by `--cold`. (One entry is the smallest the options allow, so
// back-to-back repeats still hit—about a third of CSS and SVG lookups on the corpus.)
const COLD_CACHE_SIZES = { cacheCSS: 1, cacheJS: 1, cacheSVG: 1 };

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

function parseArgs(argv) {
  const args = { save: false, core: false, cold: false, iterations: DEFAULT_ITERATIONS, config: 'html-minifier-next.config.json' };
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
    } else {
      console.error(`Warning: Unrecognized argument “${arg}”`);
    }
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
  const pct = ((delta / prev) * 100).toFixed(1);
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
// are added, because it does not chase the single worst outlier.
function reproducibility(values) {
  if (values.length < 2) {
    return 0;
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
  const args = parseArgs(process.argv.slice(2));

  const { minify } = await import('../src/htmlminifier.js');

  const urls = await readJSON(path.join(__dirname, 'sites.json'), 'sites.json');
  const fileNames = Object.keys(urls);
  const dirInput = path.join(__dirname, 'input');

  const baseOptions = await readJSON(path.resolve(__dirname, args.config), args.config);
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
      // A missing baseline is normal (first run reports absolute numbers only);
      // anything else (corrupt JSON, permissions) is worth surfacing
      if (err.code !== 'ENOENT') {
        console.error(`Warning: Ignoring unreadable baseline (${PATH_BASELINE}): ${err.message}`);
      }
    }
  }

  const modes = [args.core ? 'core: external minifiers disabled' : '', args.cold ? 'cold: caches shrunk to one entry, so most CSS/JS/SVG work is redone' : ''].filter(Boolean);
  console.log(`Benchmarking ${fileNames.length} file(s)${modes.length ? ' (' + modes.join('; ') + ')' : ''}, fastest of ${args.iterations} iteration(s)`);

  if (baseline) {
    const origin = baseline.git ? `${baseline.git.branch} @ ${baseline.git.commit}` : '(unknown revision)';
    const when = baseline.created ? new Date(baseline.created).toLocaleString() : 'unknown date';
    console.log(`Comparing against baseline: ${origin} (saved ${when})`);

    // Flag settings that would make the comparison not apples-to-apples
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
    if (baseline.config !== args.config) {
      mismatches.push(`config ${baseline.config} → ${args.config}`);
    }
    if (mismatches.length) {
      console.log(`Warning: Baseline settings differ (${mismatches.join('; ')})—deltas may not be comparable`);
    }
  }
  console.log('');

  const results = {};
  const noises = [];
  let sizeTotal = 0, timeTotal = 0;
  let sizeTotalBase = 0, timeTotalBase = 0, noiseWeightedBase = 0;
  let processed = 0, matched = 0;

  for (const fileName of fileNames) {
    const pathFile = path.join(dirInput, fileName + '.html');
    let data;
    try {
      data = await fs.readFile(pathFile, 'utf8');
    } catch {
      console.error(`Skipping ${fileName}: input not found (run \`npm run backtest\` once to download the corpus)`);
      continue;
    }

    const opts = { ...baseOptions };
    if (opts.minifyURLs) {
      opts.minifyURLs = typeof opts.minifyURLs === 'object'
        ? { ...opts.minifyURLs, site: urls[fileName] }
        : { site: urls[fileName] };
    }

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
    const size = minified.length;
    noises.push({ noise, worst, time });

    results[fileName] = {
      size,
      time: Math.round(time * 100) / 100,
      median: Math.round(median(times) * 100) / 100,
      spread: Math.round(noise * 10) / 10
    };
    sizeTotal += size;
    timeTotal += time;
    processed++;

    const prev = baseline && baseline.files && baseline.files[fileName];
    if (prev) {
      sizeTotalBase += prev.size;
      timeTotalBase += prev.time;
      noiseWeightedBase += (prev.spread != null ? prev.spread : 0) * prev.time;
      matched++;
    }
    // A delta has to clear both runs’ noise, so widen the band by the baseline’s own spread
    const band = noise + (prev && prev.spread != null ? prev.spread : 0);
    const sizeStr = `${formatBytes(size)} B${prev ? formatDelta(size, prev.size) : ''}`;
    const timeStr = `${time.toFixed(1)} ms${prev ? formatTimeDelta(time, prev.time, band) : ''} ±${noise.toFixed(0)}%`;
    console.log(`${fileName.padEnd(24)} ${sizeStr.padEnd(24)} @ ${timeStr}`);
  }

  if (!processed) {
    console.error('\nNo input files found. Run `npm run backtest` once to download the corpus.');
    process.exit(1);
  }

  // Only show total deltas when every processed file has a baseline entry, so the
  // current and baseline totals cover the same files (an apples-to-apples comparison)
  const compareTotals = baseline && matched === processed;
  const sizeStrTotal = `${formatBytes(sizeTotal)} B${compareTotals ? formatDelta(sizeTotal, sizeTotalBase) : ''}`;
  const noiseTypical = noises.length ? median(noises.map(n => n.noise)) : 0;
  // The total is dominated by the big files, which are also the precisely measured
  // ones, so weight its noise band by each file’s share of the time rather than
  // letting a 3 ms file with a wide spread set the bar for the whole run
  const timeWeighted = noises.reduce((sum, n) => sum + n.noise * n.time, 0);
  const noiseTotal = timeTotal > 0 ? timeWeighted / timeTotal : noiseTypical;
  // As for a single file, a delta has to clear both runs’ noise
  const noiseTotalBase = timeTotalBase > 0 ? noiseWeightedBase / timeTotalBase : 0;
  const timeStrTotal = `${timeTotal.toFixed(1)} ms${compareTotals ? formatTimeDelta(timeTotal, timeTotalBase, noiseTotal + noiseTotalBase) : ''}`;
  console.log(`\n${'Total'.padEnd(24)} ${sizeStrTotal.padEnd(24)} @ ${timeStrTotal}`);
  if (baseline && matched !== processed) {
    console.log(`Note: Total deltas omitted—only ${matched} of ${processed} processed file(s) have a baseline entry`);
  }

  // Deltas below the machine’s own noise floor mean nothing, so say what that floor is
  const noiseWorst = noises.length ? Math.max(...noises.map(n => n.worst)) : 0;
  console.log(`\nNoise: ${noiseTotal.toFixed(1)}% on the total, ${noiseTypical.toFixed(1)}% typical per file (how much the reported figure moves between iteration halves; worst fastest-to-slowest spread was ${noiseWorst.toFixed(0)}%)`);
  if (noiseTotal > NOISE_WARN_PCT) {
    console.log(`Warning: This machine is too noisy to resolve changes under ~${noiseTotal.toFixed(0)}% on the total. Close other applications, or raise --iterations.`);
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
      files: results
    };
    await fs.writeFile(PATH_BASELINE, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline saved to ${path.relative(process.cwd(), PATH_BASELINE)} (${processed} file(s))`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});