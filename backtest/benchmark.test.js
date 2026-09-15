// @@ Extend to `main()`—the per-file loop, totals, noise weighting, and baseline saving—e.g., against a small fixture corpus

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { getPreset, getPresetNames } from '../src/presets.js';
import { BROTLI_QUALITY, GZIP_LEVEL } from './compression.js';
import {
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
});