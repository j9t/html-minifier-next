import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { minify } from '../src/htmlminifier.js';
import { getPreset, getPresetNames } from '../src/presets.js';
import { BROTLI_QUALITY, GZIP_LEVEL, compressedSizes } from './compression.js';
import {
  DEFAULT_CONFIG,
  DEFAULT_ITERATIONS,
  baselineMetric,
  baselineMismatches,
  compressionComparable,
  fastest,
  formatDelta,
  formatTimeDelta,
  main,
  median,
  optionsForSite,
  padDisplay,
  parseArgs,
  reproducibility,
  resolvePreset,
  spread
} from './benchmark.js';

describe('Benchmark', () => {
  describe('`parseArgs`', () => {
    test('Defaults to the options file and no preset', () => {
      assert.deepStrictEqual(parseArgs([]), {
        save: false, core: false, cold: false, iterations: DEFAULT_ITERATIONS, config: DEFAULT_CONFIG, preset: null
      });
    });

    test('Reads flags and values', () => {
      assert.deepStrictEqual(parseArgs(['--save', '--core', '--cold', '--iterations=10', '--config=other.json']), {
        save: true, core: true, cold: true, iterations: 10, config: 'other.json', preset: null
      });
    });

    test('`--iterations` falls back to the default when not a number, and to 1 when lower', () => {
      assert.strictEqual(parseArgs(['--iterations=many']).iterations, DEFAULT_ITERATIONS);
      assert.strictEqual(parseArgs(['--iterations=0']).iterations, 1);
    });

    test('`--preset` takes the place of the options file', () => {
      const args = parseArgs(['--preset=comprehensive']);
      assert.strictEqual(args.preset, 'comprehensive');
      assert.strictEqual(args.config, null);
    });

    test('`--preset` and `--config` together are rejected', () => {
      assert.throws(() => parseArgs(['--preset=comprehensive', '--config=other.json']), /either `--config` or `--preset`/);
    });
  });

  describe('`resolvePreset`', () => {
    test('Options without a preset stay as they are', () => {
      const options = { collapseWhitespace: true };
      assert.strictEqual(resolvePreset(options), options);
    });

    test('The preset goes under the other options, and its name is dropped', () => {
      assert.deepStrictEqual(
        resolvePreset({ preset: 'comprehensive', minifyJS: false }),
        { ...getPreset('comprehensive'), minifyJS: false }
      );
    });

    test('An unknown preset is rejected, naming the available ones', () => {
      assert.throws(
        () => resolvePreset({ preset: 'unknown' }),
        { message: `Unknown preset “unknown”; available presets: ${getPresetNames().join(', ')}` }
      );
    });
  });

  describe('`optionsForSite`', () => {
    const site = 'https://example.com/';

    test('An enabled `minifyURLs` gets the site', () => {
      assert.deepStrictEqual(optionsForSite({ minifyURLs: true }, site).minifyURLs, { site });
    });

    test('A `minifyURLs` object keeps its settings and gets the site', () => {
      assert.deepStrictEqual(optionsForSite({ minifyURLs: { output: 'rootRelative' } }, site).minifyURLs, { output: 'rootRelative', site });
    });

    test('A disabled `minifyURLs` stays disabled', () => {
      assert.strictEqual(optionsForSite({ minifyURLs: false }, site).minifyURLs, false);
      assert.ok(!('minifyURLs' in optionsForSite({}, site)));
    });

    test('A `minifyURLs` from a preset gets the site', () => {
      assert.deepStrictEqual(optionsForSite(resolvePreset({ preset: 'comprehensive' }), site).minifyURLs, { site });
    });

    test('The shared options are not changed', () => {
      const options = { minifyURLs: true };
      optionsForSite(options, site);
      assert.deepStrictEqual(options, { minifyURLs: true });
    });
  });

  describe('`compressionComparable`', () => {
    test('Compares only against a baseline compressed at the same levels', () => {
      assert.strictEqual(compressionComparable(null), false);
      assert.strictEqual(compressionComparable({ files: {} }), false);
      assert.strictEqual(compressionComparable({ compression: { gzip: GZIP_LEVEL, brotli: BROTLI_QUALITY + 1 } }), false);
      assert.strictEqual(compressionComparable({ compression: { gzip: GZIP_LEVEL, brotli: BROTLI_QUALITY } }), true);
    });
  });

  describe('`baselineMismatches`', () => {
    test('A baseline saved with the same settings matches', () => {
      const args = parseArgs([]);
      assert.deepStrictEqual(baselineMismatches({ core: false, cold: false, iterations: DEFAULT_ITERATIONS, config: DEFAULT_CONFIG, preset: null }, args), []);
    });

    test('A baseline predating `cold` and `preset` matches default settings', () => {
      assert.deepStrictEqual(baselineMismatches({ core: false, iterations: DEFAULT_ITERATIONS, config: DEFAULT_CONFIG }, parseArgs([])), []);
    });

    test('Switching from the options file to a preset is reported', () => {
      const baseline = { core: false, cold: false, iterations: DEFAULT_ITERATIONS, config: DEFAULT_CONFIG };
      assert.deepStrictEqual(baselineMismatches(baseline, parseArgs(['--preset=comprehensive'])), [
        `config ${DEFAULT_CONFIG} → none`,
        'preset none → comprehensive'
      ]);
    });

    test('Differing modes and iterations are reported', () => {
      const baseline = { core: true, cold: false, iterations: 15, config: DEFAULT_CONFIG };
      assert.deepStrictEqual(baselineMismatches(baseline, parseArgs(['--cold'])), [
        'core true → false',
        'cold false → true',
        `iterations 15 → ${DEFAULT_ITERATIONS}`
      ]);
    });
  });

  describe('`baselineMetric`', () => {
    test('A baseline naming its metric is taken at its word', () => {
      assert.strictEqual(baselineMetric({ metric: 'median' }), 'median');
    });

    test('A baseline predating the marker counts as fastest only if every file has a spread', () => {
      assert.strictEqual(baselineMetric({ files: { a: { spread: 1 }, b: { spread: null } } }), 'fastest');
      assert.strictEqual(baselineMetric({ files: { a: { spread: 1 }, b: {} } }), 'median');
      assert.strictEqual(baselineMetric({ files: {} }), 'median');
    });
  });

  describe('Formatting', () => {
    test('`formatDelta` shows two decimals, and nothing without a baseline value', () => {
      assert.strictEqual(formatDelta(100, null), '');
      assert.strictEqual(formatDelta(100, 0), '');
      assert.strictEqual(formatDelta(100, 100), ' (±0%)');
      assert.strictEqual(formatDelta(101, 100), ' (+1.00%)');
      assert.strictEqual(formatDelta(9995, 10000), ' (-0.05%)');
    });

    test('`formatTimeDelta` marks a delta within the noise band as such', () => {
      assert.strictEqual(formatTimeDelta(105, 100, 10), ' (~+5.0%, within noise)');
      assert.strictEqual(formatTimeDelta(95, 100, 10), ' (~-5.0%, within noise)');
      assert.strictEqual(formatTimeDelta(80, 100, 10), ' (-20.0%)');
      assert.strictEqual(formatTimeDelta(120, 100, 10), ' (+20.0%)');
      assert.strictEqual(formatTimeDelta(120, null, 10), '');
    });
  });

  describe('Statistics', () => {
    test('`fastest` and `median` pick the right iteration without reordering the input', () => {
      const values = [4, 1, 3, 2];
      assert.strictEqual(fastest(values), 1);
      assert.strictEqual(median(values), 2.5);
      assert.strictEqual(median([3, 1, 2]), 2);
      assert.deepStrictEqual(values, [4, 1, 3, 2]);
    });

    test('`reproducibility` compares the fastest iteration of each half', () => {
      assert.strictEqual(reproducibility([10, 20, 12, 30]), 20);
      assert.strictEqual(reproducibility([0, 5, 0, 5]), 0);
    });

    test('`reproducibility` reports nothing for a single iteration', () => {
      assert.strictEqual(reproducibility([10]), null);
    });

    test('One slow outlier inflates `spread` but not `reproducibility`', () => {
      const values = [10, 10, 100, 10];
      assert.strictEqual(reproducibility(values), 0);
      assert.strictEqual(spread(values), 900);
    });
  });

  describe('`main`', () => {
    const options = { collapseWhitespace: true, removeComments: true };
    const sites = { alpha: 'https://alpha.example/', beta: 'https://beta.example/' };
    const inputs = {
      alpha: '<!DOCTYPE html>\n<html>\n  <head>\n    <title>Alpha</title>\n  </head>\n  <body>\n    <!-- Comment -->\n    <p>Alpha   text</p>\n  </body>\n</html>\n',
      beta: '<div>\n  <p>Beta</p>\n  <p>Text</p>\n</div>\n'
    };
    let dirWork;
    let logs;
    let errors;

    // Runs `main` against the fixture corpus, collecting what it prints
    async function run(t, argv) {
      logs = [];
      errors = [];
      // Stacked mocks would leave the console mocked after the test
      t.mock.restoreAll();
      t.mock.method(console, 'log', (...args) => logs.push(args.join(' ')));
      t.mock.method(console, 'error', (...args) => errors.push(args.join(' ')));
      return await main({ argv, dirWork });
    }

    // The printed line starting with `prefix`, ignoring the blank lines some lines open with
    function findLine(lines, prefix) {
      return lines.find(line => line.trimStart().startsWith(prefix));
    }

    async function readBaseline() {
      return JSON.parse(await fs.readFile(path.join(dirWork, 'benchmark-baseline.json'), 'utf8'));
    }

    before(async () => {
      dirWork = await fs.mkdtemp(path.join(os.tmpdir(), 'hmn-benchmark-'));
    });

    beforeEach(async () => {
      await fs.rm(dirWork, { recursive: true, force: true });
      await fs.mkdir(path.join(dirWork, 'input'), { recursive: true });
      await fs.writeFile(path.join(dirWork, 'sites.json'), JSON.stringify(sites));
      await fs.writeFile(path.join(dirWork, DEFAULT_CONFIG), JSON.stringify(options));
      for (const [name, html] of Object.entries(inputs)) {
        await fs.writeFile(path.join(dirWork, 'input', name + '.html'), html);
      }
    });

    after(async () => {
      await fs.rm(dirWork, { recursive: true, force: true });
    });

    test('Reports each file’s minified and compressed size, and totals them', async (t) => {
      const { files, totals } = await run(t, ['--iterations=1']);
      for (const [name, html] of Object.entries(inputs)) {
        const minified = await minify(html, optionsForSite(options, sites[name]));
        const { gzip, brotli } = compressedSizes(minified);
        assert.strictEqual(files[name].size, Buffer.byteLength(minified), name);
        assert.strictEqual(files[name].gzip, gzip, name);
        assert.strictEqual(files[name].brotli, brotli, name);
      }
      for (const key of ['size', 'gzip', 'brotli']) {
        assert.strictEqual(totals[key], files.alpha[key] + files.beta[key], key);
      }
      assert.ok(findLine(logs, 'Total'));
    });

    test('Leaves noise unmeasured for a single iteration', async (t) => {
      const { files, noise } = await run(t, ['--iterations=1']);
      assert.strictEqual(files.alpha.spread, null);
      assert.deepStrictEqual(noise, { total: null, typical: null });
      assert.ok(findLine(logs, 'Noise: Unmeasured'));
    });

    test('Weights the total’s noise by each file’s time', async (t) => {
      const { files, noise } = await run(t, ['--iterations=4']);
      const spreads = [files.alpha.spread, files.beta.spread];
      // A time-weighted mean lies between the per-file values (rounded to a tenth, hence the margin)
      assert.ok(noise.total >= Math.min(...spreads) - 0.05 && noise.total <= Math.max(...spreads) + 0.05, `${noise.total} outside ${spreads}`);
      assert.ok(Math.abs(noise.typical - (spreads[0] + spreads[1]) / 2) <= 0.05);
      assert.ok(findLine(logs, `Noise: ${noise.total.toFixed(1)}% on the total`));
    });

    test('`--save` writes a baseline with the run’s settings and per-file results', async (t) => {
      const { files } = await run(t, ['--save', '--iterations=2']);
      const baseline = await readBaseline();
      assert.strictEqual(baseline.metric, 'fastest');
      assert.deepStrictEqual(baseline.compression, { gzip: GZIP_LEVEL, brotli: BROTLI_QUALITY });
      assert.strictEqual(baseline.iterations, 2);
      assert.strictEqual(baseline.config, DEFAULT_CONFIG);
      assert.strictEqual(baseline.preset, null);
      assert.deepStrictEqual(baseline.files, files);
      assert.ok(findLine(logs, 'Baseline saved to'));
    });

    test('Shows deltas against a saved baseline, per file and in total', async (t) => {
      await run(t, ['--save', '--iterations=1']);
      await run(t, ['--iterations=1']);
      assert.ok(findLine(logs, 'Comparing against baseline'));
      for (const label of ['alpha', 'beta', 'Total']) {
        const line = findLine(logs, label);
        assert.match(line, /B \(±0%\)/, label);
        assert.match(line, /Gzip [\d,]+ \(±0%\)/, label);
        assert.match(line, /Brotli [\d,]+ \(±0%\)/, label);
      }
    });

    test('Omits total deltas when not every file has a baseline entry', async (t) => {
      await run(t, ['--save', '--iterations=1']);
      const baseline = await readBaseline();
      delete baseline.files.beta;
      await fs.writeFile(path.join(dirWork, 'benchmark-baseline.json'), JSON.stringify(baseline));
      await run(t, ['--iterations=1']);
      assert.match(findLine(logs, 'alpha'), /\(±0%\)/);
      assert.doesNotMatch(findLine(logs, 'Total'), /\(/);
      assert.ok(findLine(logs, 'Note: Total deltas omitted—only 1 of 2'));
    });

    test('Ignores a baseline saved with another timing metric', async (t) => {
      await run(t, ['--save', '--iterations=1']);
      const baseline = await readBaseline();
      await fs.writeFile(path.join(dirWork, 'benchmark-baseline.json'), JSON.stringify({ ...baseline, metric: 'median' }));
      await run(t, ['--iterations=1']);
      assert.ok(findLine(logs, 'Warning: Ignoring baseline saved with an older timing metric'));
      assert.ok(!findLine(logs, 'Comparing against baseline'));
    });

    test('Skips a file whose input is missing', async (t) => {
      await fs.rm(path.join(dirWork, 'input', 'beta.html'));
      const { files } = await run(t, ['--iterations=1']);
      assert.deepStrictEqual(Object.keys(files), ['alpha']);
      assert.ok(findLine(errors, 'Skipping beta: input not found'));
    });

    test('Fails without any input', async (t) => {
      await fs.rm(path.join(dirWork, 'input'), { recursive: true });
      await assert.rejects(run(t, ['--iterations=1']), { message: /^\s*No input files found/ });
    });

    test('Fails on an unreadable options file', async (t) => {
      await assert.rejects(run(t, ['--config=missing.json']), { message: /^Failed to read missing\.json/ });
    });

    test('Fails on invalid arguments', async (t) => {
      await assert.rejects(run(t, ['--preset=unknown']), { message: /^Error: Unknown preset “unknown”/ });
    });
  });

  describe('`padDisplay`', () => {
    test('Pads by display width, counting wide characters as two columns', () => {
      assert.strictEqual(padDisplay('BBC', 6), 'BBC   ');
      assert.strictEqual(padDisplay('博客园', 8), '博客园  ');
      assert.strictEqual(padDisplay('Médecins', 10), 'Médecins  ');
    });

    test('Leaves strings at or beyond the width unchanged', () => {
      assert.strictEqual(padDisplay('稀土掘金', 6), '稀土掘金');
    });
  });
});