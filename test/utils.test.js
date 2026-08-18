import { describe, test } from 'node:test';
import assert from 'node:assert';
import { LRU, hasRiskyQuantifiers } from '../src/lib/utils.js';

describe('Utils', () => {
  describe('LRU', () => {
    test('New cache reports all-zero stats', () => {
      const cache = new LRU(3);
      assert.deepStrictEqual(cache.stats(), { gets: 0, hits: 0, size: 0, limit: 3 });
    });

    test('`get()` on a missing key counts a get but not a hit', () => {
      const cache = new LRU(3);
      assert.strictEqual(cache.get('missing'), undefined);
      assert.deepStrictEqual(cache.stats(), { gets: 1, hits: 0, size: 0, limit: 3 });
    });

    test('`get()` on a present key counts both a get and a hit', () => {
      const cache = new LRU(3);
      cache.set('key', 'value');
      assert.strictEqual(cache.get('key'), 'value');
      assert.deepStrictEqual(cache.stats(), { gets: 1, hits: 1, size: 1, limit: 3 });
    });

    test('Repeated lookups accumulate gets and hits independently', () => {
      const cache = new LRU(3);
      cache.set('a', 1);

      cache.get('a'); // hit
      cache.get('b'); // miss
      cache.get('a'); // hit
      cache.get('c'); // miss

      const stats = cache.stats();
      assert.strictEqual(stats.gets, 4);
      assert.strictEqual(stats.hits, 2);
    });

    test('`set()` does not affect gets/hits counters', () => {
      const cache = new LRU(3);
      cache.set('a', 1);
      cache.set('b', 2);
      assert.deepStrictEqual(cache.stats(), { gets: 0, hits: 0, size: 2, limit: 3 });
    });

    test('`stats()` size reflects eviction once the limit is exceeded', () => {
      const cache = new LRU(2);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3); // evicts `a`—limit is 2

      assert.strictEqual(cache.stats().size, 2);
      assert.strictEqual(cache.get('a'), undefined); // miss—evicted
      assert.strictEqual(cache.get('c'), 3); // hit—still present

      const stats = cache.stats();
      assert.strictEqual(stats.gets, 2);
      assert.strictEqual(stats.hits, 1);
    });

    test('`get()` promotes a key, changing which entry is evicted', () => {
      const cache = new LRU(2);
      cache.set('a', 1);
      cache.set('b', 2);

      cache.get('a'); // promotes `a`, leaving `b` least recently used
      cache.set('c', 3); // evicts `b`, not `a`

      assert.strictEqual(cache.get('a'), 1);
      assert.strictEqual(cache.get('b'), undefined);
    });
  });

  describe('`hasRiskyQuantifiers`', () => {
    test('A lazy scan up to a literal terminator is linear', () => {
      // The shipped `ignoreCustomFragments` defaults
      assert.strictEqual(hasRiskyQuantifiers(/<%[\s\S]*?%>/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/<\?[\s\S]*?\?>/.source), false);
    });

    test('Bounded quantifiers pass', () => {
      assert.strictEqual(hasRiskyQuantifiers(/\{\{[\s\S]{0,500}?\}\}/.source), false);
      assert.strictEqual(hasRiskyQuantifiers(/<!--[^-]{1,200}-->/.source), false);
    });

    test('Alternation without an unlimited quantifier over it passes', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(?:<%[\s\S]*?%>|<\?[\s\S]*?\?>)/.source), false);
    });

    test('Unlimited quantifiers nested in a group are risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(a+)+/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\{\{([^}]+)+\}\}/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/(?:\s*\w*)*/.source), true);
    });

    test('Unlimited quantifiers over an alternating group are risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(a|b)*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/<%(\s|\S)*?%>/.source), true);
    });

    test('Variable quantifiers nested in an unbounded group are risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(a?)+/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/\{\{(?:[^}]{1,3})+\}\}/.source), true);
    });

    test('An exact count nested in an unbounded group passes', () => {
      assert.strictEqual(hasRiskyQuantifiers(/(?:a{4})+/.source), false);
    });

    test('The same atom repeated unboundedly twice in a row is risky', () => {
      assert.strictEqual(hasRiskyQuantifiers(/.*.*/.source), true);
      assert.strictEqual(hasRiskyQuantifiers(/<!--[\s\S]*[\s\S]*-->/.source), true);
    });

    test('A repeated group repeating only within a bound passes', () => {
      // The shape HMN itself composes from the fragment patterns
      assert.strictEqual(hasRiskyQuantifiers(/(?:<%[\s\S]*?%>|<\?[\s\S]*?\?>){1,200}/.source), false);
    });

    test('Risk nested deeper in a group still surfaces', () => {
      assert.strictEqual(hasRiskyQuantifiers(/<%(?:x(a+)+y)?%>/.source), true);
    });
  });
});
