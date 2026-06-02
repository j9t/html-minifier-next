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

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One warm-up run (discarded) plus this many timed iterations; the median is reported
const BENCH_WARMUP = 1;
const DEFAULT_ITERATIONS = 5;

// External minifiers disabled by `--core` to surface HMN’s own time
const CORE_DISABLED_OPTIONS = ['minifyCSS', 'minifyJS', 'minifySVG', 'minifyURLs'];

const BASELINE_PATH = path.join(__dirname, 'benchmark-baseline.json');

function parseArgs(argv) {
  const args = { save: false, core: false, iterations: DEFAULT_ITERATIONS, config: 'html-minifier.json' };
  for (const arg of argv) {
    if (arg === '--save') {
      args.save = true;
    } else if (arg === '--core') {
      args.core = true;
    } else if (arg.startsWith('--iterations=')) {
      args.iterations = Math.max(1, parseInt(arg.slice('--iterations='.length), 10) || DEFAULT_ITERATIONS);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const { minify } = await import('../src/htmlminifier.js');

  const urls = JSON.parse(await fs.readFile(path.join(__dirname, 'sites.json'), 'utf8'));
  const fileNames = Object.keys(urls);
  const inputDir = path.join(__dirname, 'input');

  const baseOptions = JSON.parse(await fs.readFile(path.join(__dirname, args.config), 'utf8'));
  if (args.core) {
    for (const key of CORE_DISABLED_OPTIONS) {
      baseOptions[key] = false;
    }
  }

  // Load an existing baseline for delta reporting (skipped when saving a new one)
  let baseline = null;
  if (!args.save) {
    try {
      baseline = JSON.parse(await fs.readFile(BASELINE_PATH, 'utf8'));
      if (baseline.core !== args.core) {
        console.error(`Warning: Baseline was recorded with core=${baseline.core}; comparing against core=${args.core}\n`);
      }
    } catch {
      // No baseline yet—first run reports absolute numbers only
    }
  }

  console.log(`Benchmarking ${fileNames.length} file(s)${args.core ? ' (core: external minifiers disabled)' : ''}, median of ${args.iterations} iteration(s)\n`);

  const results = {};
  let totalSize = 0, totalTime = 0;
  let baseTotalSize = 0, baseTotalTime = 0;
  let processed = 0;

  for (const fileName of fileNames) {
    const filePath = path.join(inputDir, fileName + '.html');
    let data;
    try {
      data = await fs.readFile(filePath, 'utf8');
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
    totalSize += size;
    totalTime += time;
    processed++;

    const prev = baseline && baseline.files && baseline.files[fileName];
    if (prev) {
      baseTotalSize += prev.size;
      baseTotalTime += prev.time;
    }
    const sizeStr = `${formatBytes(size)} B${prev ? formatDelta(size, prev.size) : ''}`;
    const timeStr = `${time.toFixed(1)} ms${prev ? formatDelta(time, prev.time) : ''}`;
    console.log(`${fileName.padEnd(24)} ${sizeStr.padEnd(24)} @ ${timeStr}`);
  }

  if (!processed) {
    console.error('\nNo input files found. Run “npm run backtest” once to download the corpus.');
    process.exit(1);
  }

  const totalSizeStr = `${formatBytes(totalSize)} B${baseline ? formatDelta(totalSize, baseTotalSize) : ''}`;
  const totalTimeStr = `${totalTime.toFixed(1)} ms${baseline ? formatDelta(totalTime, baseTotalTime) : ''}`;
  console.log(`\n${'Total'.padEnd(24)} ${totalSizeStr.padEnd(28)} @ ${totalTimeStr}`);

  if (args.save) {
    const payload = {
      created: new Date().toISOString(),
      core: args.core,
      iterations: args.iterations,
      config: args.config,
      files: results
    };
    await fs.writeFile(BASELINE_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline saved to ${path.relative(process.cwd(), BASELINE_PATH)} (${processed} file(s))`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});