import { describe, test } from 'node:test';
import assert from 'node:assert';
import { combineRuns, outputSize, parseArgs } from './benchmark-ab.js';

describe('A/B benchmark', () => {
  describe('`parseArgs`', () => {
    test('Takes the ref and defaults to both modes', () => {
      assert.deepStrictEqual(parseArgs(['main']), {
        ref: 'main', aa: false, pairs: 3, rounds: 10, modes: ['on', 'off'], files: null, top: 5
      });
    });

    test('Reads the flags', () => {
      const args = parseArgs(['--aa', 'main', '--pairs=2', '--rounds=4', '--collapse=off', '--files=ECMAScript,BBC', '--top=0']);
      assert.deepStrictEqual(args, {
        ref: 'main', aa: true, pairs: 2, rounds: 4, modes: ['off'], files: ['ECMAScript', 'BBC'], top: 0
      });
    });

    test('Rejects a missing ref, invalid values, and unknown arguments', () => {
      assert.throws(() => parseArgs([]), /Git ref/);
      assert.throws(() => parseArgs(['main', '--pairs=0']), /--pairs/);
      assert.throws(() => parseArgs(['main', '--rounds=x']), /--rounds/);
      assert.throws(() => parseArgs(['main', '--pairs=3abc']), /--pairs/);
      assert.throws(() => parseArgs(['main', '--rounds=1e3']), /--rounds/);
      assert.throws(() => parseArgs(['main', '--top=-1']), /--top/);
      assert.throws(() => parseArgs(['main', '--rounds=99999999999999999999']), /--rounds/);
      assert.throws(() => parseArgs(['main', '--collapse=maybe']), /--collapse/);
      assert.throws(() => parseArgs(['main', 'other']), /other/);
      assert.throws(() => parseArgs(['main', '--cold']), /--cold/);
      assert.throws(() => parseArgs(['main', '--aa=false']), /--aa=false/);
    });
  });

  describe('`outputSize`', () => {
    test('Counts UTF-8 bytes, as the regular benchmark does', () => {
      assert.strictEqual(outputSize('<p>a</p>'), 8);
      assert.strictEqual(outputSize('<p>ä\u00a0€😀</p>'), 18);
    });
  });

  describe('`combineRuns`', () => {
    // B is 10% slower and 5 bytes shorter on the first file; a run that loaded B first reports it as `A`
    const straight = { on: { best: { A: [100, 50], B: [110, 50] }, size: { A: [20, 10], B: [15, 10] } } };
    const swapped = { on: { best: { A: [110, 50], B: [100, 50] }, size: { A: [15, 10], B: [20, 10] } } };

    test('Reports B against A whichever copy was loaded first', () => {
      const summary = combineRuns([{ swapped: false, result: straight }, { swapped: true, result: swapped }]);
      assert.deepStrictEqual(summary.on.pcts.map(pct => pct.toFixed(3)), ['6.667', '6.667']);
      assert.deepStrictEqual(summary.on.deltas, [10, 0]);
      assert.deepStrictEqual(summary.on.bytes, [-5, 0]);
    });

    test('Averages per-file deltas over all runs', () => {
      const faster = { on: { best: { A: [100, 50], B: [90, 50] }, size: straight.on.size } };
      const summary = combineRuns([{ swapped: false, result: straight }, { swapped: false, result: faster }]);
      assert.deepStrictEqual(summary.on.deltas, [0, 0]);
    });
  });
});