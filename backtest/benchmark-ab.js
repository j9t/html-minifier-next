#!/usr/bin/env node

// A/B timing benchmark for HTML Minifier Next.
//
// Times the working-tree minifier against the one at a Git ref (e.g., `main`), to resolve
// changes of 1% or less, which benchmark.js cannot. Both copies run in one process,
// interleaved per file, fastest of all rounds per file, external minifiers off (as with
// benchmark.js `--core`). Whichever copy is imported second runs up to 1% faster, so every
// pair runs in both orders, each in a fresh process, and the result is their mean.
// `collapseWhitespace` on and off are timed separately, as a whitespace change often costs
// in one of them only.
//
// Usage (from the backtest folder):
//   npm run benchmark:ab -- main: Compare the working tree (B) with `main` (A)
//   npm run benchmark:ab -- main --aa: Compare `main` with a copy of itself instead, for the
//     noise floor—a difference smaller than this in the same session is not a finding
//   npm run benchmark:ab -- main --pairs=3 --rounds=10 --collapse=on|off|both
//   npm run benchmark:ab -- main --files=ECMAScript,BBC --top=10
//
// The ref’s src is extracted to backtest/.ab and removed again after the run. The corpus is
// shared with backtest.js; run `npm run backtest` once to download it.

import { execFileSync, spawnSync } from 'child_process';
import fs from 'fs/promises';
import { existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR_REPO = path.resolve(__dirname, '..');
const DIR_AB = path.join(__dirname, '.ab');
const DIR_INPUT = path.join(__dirname, 'input');
const PATH_CONFIG = path.join(__dirname, 'html-minifier-next.config.json');

const CORE_DISABLED_OPTIONS = ['minifyCSS', 'minifyJS', 'minifySVG', 'minifyURLs'];

function parseArgs(argv) {
  const args = { ref: null, aa: false, pairs: 3, rounds: 10, modes: ['on', 'off'], files: null, top: 5 };
  for (const arg of argv) {
    const [key, value] = arg.split('=');
    if (key === '--aa') {
      args.aa = true;
    } else if (key === '--pairs' || key === '--rounds' || key === '--top') {
      const n = parseInt(value, 10);
      if (Number.isNaN(n) || n < (key === '--top' ? 0 : 1)) {
        throw new Error(`Invalid value for \`${key}\`: “${value}”`);
      }
      args[key.slice(2)] = n;
    } else if (key === '--collapse') {
      if (!['on', 'off', 'both'].includes(value)) {
        throw new Error('`--collapse` takes `on`, `off`, or `both`');
      }
      args.modes = value === 'both' ? ['on', 'off'] : [value];
    } else if (key === '--files') {
      args.files = value.split(',');
    } else if (!arg.startsWith('--') && !args.ref) {
      args.ref = arg;
    } else {
      throw new Error(`Unrecognized argument “${arg}”`);
    }
  }
  if (!args.ref) {
    throw new Error('Name a Git ref to compare with, e.g., `npm run benchmark:ab -- main`');
  }
  return args;
}

// One timed run, in its own process: Prints per-file best times and output sizes as JSON
async function worker(dirA, dirB, modes, rounds, files) {
  const { minify: first } = await import(path.join(dirA, 'src/htmlminifier.js'));
  const { minify: second } = await import(path.join(dirB, 'src/htmlminifier.js'));
  const minifiers = { A: first, B: second };

  const options = JSON.parse(await fs.readFile(PATH_CONFIG, 'utf8'));
  for (const key of CORE_DISABLED_OPTIONS) {
    options[key] = false;
  }
  const inputs = await Promise.all(files.map(name => fs.readFile(path.join(DIR_INPUT, name + '.html'), 'utf8')));

  const result = {};
  for (const mode of modes) {
    const optionsMode = { ...options, collapseWhitespace: mode === 'on' };
    const best = { A: files.map(() => Infinity), B: files.map(() => Infinity) };
    const size = { A: [], B: [] };
    for (const input of inputs) {
      await minifiers.A(input, optionsMode);
      await minifiers.B(input, optionsMode);
    }
    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < inputs.length; i++) {
        // Alternate which copy goes first, so neither always runs on a warmer cache
        for (const key of (round + i) % 2 ? ['A', 'B'] : ['B', 'A']) {
          const start = performance.now();
          const output = await minifiers[key](inputs[i], optionsMode);
          best[key][i] = Math.min(best[key][i], performance.now() - start);
          size[key][i] = output.length;
        }
      }
    }
    result[mode] = { best, size };
  }
  process.stdout.write(JSON.stringify(result));
}

function runWorker(dirA, dirB, args, files) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', dirA, dirB, args.modes.join(','), String(args.rounds), files.join('\n')], { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (child.status !== 0) {
    throw new Error(`Worker failed:\n${child.stderr}`);
  }
  return JSON.parse(child.stdout);
}

function extractRef(ref, dirTarget) {
  mkdirSync(dirTarget, { recursive: true });
  const archive = execFileSync('git', ['archive', ref, 'src'], { cwd: DIR_REPO, maxBuffer: 1 << 28 });
  execFileSync('tar', ['-x', '-C', dirTarget], { input: archive });
}

function sum(list) {
  return list.reduce((acc, value) => acc + value, 0);
}

// Per mode, B−A as seen from A: in percent of A per run, and per file as the mean in
// milliseconds and in bytes; runs that loaded B first carry it as their `A`
function combineRuns(runs) {
  const summary = {};
  for (const { swapped, result } of runs) {
    for (const [mode, { best, size }] of Object.entries(result)) {
      const [timesA, timesB] = swapped ? [best.B, best.A] : [best.A, best.B];
      const [sizesA, sizesB] = swapped ? [size.B, size.A] : [size.A, size.B];
      summary[mode] ??= { pcts: [], deltas: timesA.map(() => 0), bytes: [] };
      summary[mode].pcts.push(100 * (sum(timesB) - sum(timesA)) / sum(timesA));
      timesA.forEach((timeA, i) => {
        summary[mode].deltas[i] += (timesB[i] - timeA) / runs.length;
      });
      summary[mode].bytes = sizesB.map((sizeB, i) => sizeB - sizesA[i]);
    }
  }
  return summary;
}

function formatPct(value) {
  return (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const urls = JSON.parse(await fs.readFile(path.join(__dirname, 'sites.json'), 'utf8'));
  let files = Object.keys(urls).filter(name => existsSync(path.join(DIR_INPUT, name + '.html')));
  if (args.files) {
    files = files.filter(name => args.files.some(part => name.includes(part)));
  }
  if (!files.length) {
    throw new Error('No corpus files found (run `npm run backtest` once to download the corpus)');
  }

  const commit = execFileSync('git', ['rev-parse', '--short', args.ref], { cwd: DIR_REPO, encoding: 'utf8' }).trim();
  const dirA = path.join(DIR_AB, commit);
  const dirB = args.aa ? path.join(DIR_AB, commit + '-copy') : DIR_REPO;
  const labelB = args.aa ? `${args.ref} (copy)` : 'working tree';

  console.log(`A: ${args.ref} @ ${commit}; B: ${labelB}`);
  console.log(`* ${files.length} file(s), ${args.pairs} pair(s) of runs in both orders, fastest of ${args.rounds} round(s) per file`);

  try {
    extractRef(args.ref, dirA);
    if (args.aa) {
      extractRef(args.ref, dirB);
    }

    const runs = [];
    for (let pair = 0; pair < args.pairs; pair++) {
      for (const swapped of [false, true]) {
        runs.push({ swapped, result: runWorker(swapped ? dirB : dirA, swapped ? dirA : dirB, args, files) });
        process.stdout.write('.');
      }
    }
    const summary = combineRuns(runs);
    console.log('\n');

    for (const [mode, { pcts, deltas, bytes }] of Object.entries(summary)) {
      const mean = sum(pcts) / pcts.length;
      console.log(`collapseWhitespace ${mode}: B−A ${formatPct(mean)} (runs from ${formatPct(Math.min(...pcts))} to ${formatPct(Math.max(...pcts))})`);
      const changed = bytes.filter(delta => delta !== 0).length;
      console.log(`* Output: ${changed ? `${changed} file(s) differ, ${sum(bytes).toLocaleString('en-US')} bytes in total` : 'identical'}`);
      const rows = files.map((name, i) => ({ name, delta: deltas[i], bytes: bytes[i] }))
        .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
        .slice(0, args.top);
      for (const row of rows) {
        console.log(`  ${row.name.padEnd(28)} ${(row.delta >= 0 ? '+' : '') + row.delta.toFixed(2)} ms${row.bytes ? `, ${row.bytes.toLocaleString('en-US')} bytes` : ''}`);
      }
    }
  } finally {
    rmSync(DIR_AB, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--worker') {
  const [dirA, dirB, modes, rounds, files] = process.argv.slice(3);
  await worker(dirA, dirB, modes.split(','), Number(rounds), files.split('\n'));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

export {
  combineRuns,
  parseArgs
};