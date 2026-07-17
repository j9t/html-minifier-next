import { describe, test } from 'node:test';
import assert from 'node:assert';
import { LRU } from '../src/lib/utils.js';

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
});
