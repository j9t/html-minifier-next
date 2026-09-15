// @@ Extend to the Git walk (checkout, restore, and clean-up) and the forked minification, e.g., against a fixture repository

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { BROTLI_QUALITY, GZIP_LEVEL } from './compression.js';
import { formatChange, formatResults, ordinal, parseRange } from './backtest.js';

describe('Backtest', () => {
  describe('`parseRange`', () => {
    test('A count alone samples every commit', () => {
      assert.deepStrictEqual(parseRange('100'), { count: 100, step: 1 });
    });

    test('A count and a step are read', () => {
      assert.deepStrictEqual(parseRange('500/10'), { count: 500, step: 10 });
    });

    test('Counts and steps that are not positive integers are rejected', () => {
      for (const arg of ['0', '-5', 'all', '/2']) {
        assert.throws(() => parseRange(arg), /Invalid commit count/, arg);
      }
      for (const arg of ['5/0', '5/-1', '5/x', '5/']) {
        assert.throws(() => parseRange(arg), /Invalid step/, arg);
      }
    });

    test('More than one slash is rejected', () => {
      assert.throws(() => parseRange('1/2/3'), /Invalid format/);
    });
  });

  describe('`ordinal`', () => {
    test('Suffixes follow English usage, including the teens', () => {
      const cases = [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [23, '23rd'], [101, '101st'], [111, '111th']];
      for (const [n, expected] of cases) {
        assert.strictEqual(ordinal(n), expected);
      }
    });
  });

  describe('`formatChange`', () => {
    test('Nothing is shown without an older value, or for a change that rounds to zero', () => {
      assert.strictEqual(formatChange(100, undefined), '');
      assert.strictEqual(formatChange(100, 0), '');
      assert.strictEqual(formatChange(100, 100), '');
      assert.strictEqual(formatChange(100001, 100000), '');
      assert.strictEqual(formatChange(99999, 100000), '');
    });

    test('A change is shown with its sign and two decimals', () => {
      assert.strictEqual(formatChange(101, 100), ' (+1.00%)');
      assert.strictEqual(formatChange(90, 100), ' (-10.00%)');
    });
  });

  describe('`formatResults`', () => {
    // Deliberately not in date order, and with “Site B” missing from the middle commit
    const table = {
      aaa1111: {
        date: '2026-09-01 10:00:00 +0200',
        'Site A': { size: 1000, gzip: 400, brotli: 300, time: 10 },
        'Site B': { size: 2000, gzip: 800, brotli: 700, time: 20 }
      },
      ccc3333: {
        date: '2026-09-03 10:00:00 +0200',
        'Site A': { size: 990, gzip: 400, brotli: 303, time: 10 },
        'Site B': { size: 1900, gzip: 800, brotli: 700, time: 20 }
      },
      bbb2222: {
        date: '2026-09-02 10:00:00 +0200',
        'Site A': { size: 1000, gzip: 404, brotli: 300, time: 12 }
      }
    };
    const results = formatResults(table, ['Site A', 'Site B'], 2, new Date('2026-09-14T12:00:00Z'));

    test('The summary names the run and the compression levels', () => {
      assert.deepStrictEqual(results.summary, {
        commits: 3,
        step: 2,
        sites: 2,
        compression: { gzip: GZIP_LEVEL, brotli: BROTLI_QUALITY },
        generated: '2026-09-14'
      });
    });

    test('Commits are listed newest first, each compared to the next older one', () => {
      assert.deepStrictEqual(results.sites['Site A'], {
        '2026-09-03 10:00 ccc3333': '990 (-1.00%) · Gzip 400 (-0.99%) · Brotli 303 (+1.00%) @ 10 ms (-16.67%)',
        '2026-09-02 10:00 bbb2222': '1,000 · Gzip 404 (+1.00%) · Brotli 300 @ 12 ms (+20.00%)',
        '2026-09-01 10:00 aaa1111': '1,000 · Gzip 400 · Brotli 300 @ 10 ms'
      });
      assert.deepStrictEqual(Object.keys(results.sites['Site A']), [
        '2026-09-03 10:00 ccc3333',
        '2026-09-02 10:00 bbb2222',
        '2026-09-01 10:00 aaa1111'
      ]);
    });

    test('A commit without a site’s result is skipped in the comparison', () => {
      assert.deepStrictEqual(results.sites['Site B'], {
        '2026-09-03 10:00 ccc3333': '1,900 (-5.00%) · Gzip 800 · Brotli 700 @ 20 ms',
        '2026-09-01 10:00 aaa1111': '2,000 · Gzip 800 · Brotli 700 @ 20 ms'
      });
    });
  });
});