#!/usr/bin/env node

// Working-tree benchmark for HTML Minifier Next.
//
// Times the current working-tree minifier against the local corpus
// (`backtest/input`) and reports per-file output size and median processing time.
// Unlike `backtest.js` (which walks Git history), this measures the code exactly as
// it is right now—ideal for A/B testing a branch against a saved baseline.
//
// Usage (from the “backtest” folder):
//   npm run benchmark: Run; if a baseline exists, show deltas
//   npm run benchmark -- --save: Run and save the result as the baseline
//   npm run benchmark -- --core: Disable external minifiers (CSS/JS/SVG/URLs) to isolate HMN’s own processing time
//   npm run benchmark -- --iterations=10
//   npm run benchmark -- --config=path/to/config.json
//
// The corpus is shared with `backtest.js`; run `npm run backtest` once to download it.

import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One warm-up run (discarded) plus this many timed iterations; the median is reported
const BENCH_WARMUP = 1;
const DEFAULT_ITERATIONS = 5;

// External minifiers disabled by `--core` to surface HMN’s own time
const CORE_DISABLED_OPTIONS = ['minifyCSS', 'minifyJS', 'minifySVG', 'minifyURLs'];

const PATH_BASELINE = path.join(__dirname, 'benchmark-baseline.json');

function parseArgs(argv) {
  const args = { save: false, core: false, iterations: DEFAULT_ITERATIONS, config: 'html-minifier-next.config.json' };
  for (const arg of argv) {
    if (arg === '--save') {
      args.save = true;
    } else if (arg === '--core') {
      args.core = true;
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

  // Load an existing baseline for delta reporting (skipped when saving a new one)
  let baseline = null;
  if (!args.save) {
    try {
      baseline = JSON.parse(await fs.readFile(PATH_BASELINE, 'utf8'));
    } catch (err) {
      // A missing baseline is normal (first run reports absolute numbers only);
      // anything else (corrupt JSON, permissions) is worth surfacing
      if (err.code !== 'ENOENT') {
        console.error(`Warning: Ignoring unreadable baseline (${PATH_BASELINE}): ${err.message}`);
      }
    }
  }

  console.log(`Benchmarking ${fileNames.length} file(s)${args.core ? ' (core: external minifiers disabled)' : ''}, median of ${args.iterations} iteration(s)`);

  if (baseline) {
    const origin = baseline.git ? `${baseline.git.branch} @ ${baseline.git.commit}` : '(unknown revision)';
    const when = baseline.created ? new Date(baseline.created).toLocaleString() : 'unknown date';
    console.log(`Comparing against baseline: ${origin} (saved ${when})`);

    // Flag settings that would make the comparison not apples-to-apples
    const mismatches = [];
    if (baseline.core !== args.core) {
      mismatches.push(`core ${baseline.core} → ${args.core}`);
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
  let sizeTotal = 0, timeTotal = 0;
  let sizeTotalBase = 0, timeTotalBase = 0;
  let processed = 0, matched = 0;

  for (const fileName of fileNames) {
    const pathFile = path.join(dirInput, fileName + '.html');
    let data;
    try {
      data = await fs.readFile(pathFile, 'utf8');
    } catch {
      console.error(`Skipping “${fileName}”: input not found (run “npm run backtest” once to download the corpus)`);
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
    const time = median(times);
    const size = minified.length;

    results[fileName] = { size, time: Math.round(time * 100) / 100 };
    sizeTotal += size;
    timeTotal += time;
    processed++;

    const prev = baseline && baseline.files && baseline.files[fileName];
    if (prev) {
      sizeTotalBase += prev.size;
      timeTotalBase += prev.time;
      matched++;
    }
    const sizeStr = `${formatBytes(size)} B${prev ? formatDelta(size, prev.size) : ''}`;
    const timeStr = `${time.toFixed(1)} ms${prev ? formatDelta(time, prev.time) : ''}`;
    console.log(`${fileName.padEnd(24)} ${sizeStr.padEnd(24)} @ ${timeStr}`);
  }

  if (!processed) {
    console.error('\nNo input files found. Run “npm run backtest” once to download the corpus.');
    process.exit(1);
  }

  // Only show total deltas when every processed file has a baseline entry, so the
  // current and baseline totals cover the same files (an apples-to-apples comparison)
  const compareTotals = baseline && matched === processed;
  const sizeStrTotal = `${formatBytes(sizeTotal)} B${compareTotals ? formatDelta(sizeTotal, sizeTotalBase) : ''}`;
  const timeStrTotal = `${timeTotal.toFixed(1)} ms${compareTotals ? formatDelta(timeTotal, timeTotalBase) : ''}`;
  console.log(`\n${'Total'.padEnd(24)} ${sizeStrTotal.padEnd(24)} @ ${timeStrTotal}`);
  if (baseline && matched !== processed) {
    console.log(`Note: Total deltas omitted—only ${matched} of ${processed} processed file(s) have a baseline entry`);
  }

  if (args.save) {
    const payload = {
      created: new Date().toISOString(),
      git: getGitInfo(),
      core: args.core,
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