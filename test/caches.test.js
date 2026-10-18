import { describe, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { minify, getCacheStats } from '../src/htmlminifier.js';
import { hashContent } from '../src/lib/utils.js';

// Sizes fall back to these, so values set in the shell running the tests must not leak in
for (const key of ['HMN_CACHE_CSS', 'HMN_CACHE_JS', 'HMN_CACHE_SVG']) {
  delete process.env[key];
}

describe('Caches', () => {
  test('Hashes keys of large inputs without the collisions a 32-bit hash has', () => {
    // FNV-1a 32-bit collisions
    for (const [a, b] of [['costarring', 'liquid'], ['declinate', 'macallums'], ['altarage', 'zinke']]) {
      assert.notStrictEqual(hashContent(a), hashContent(b), `${a} and ${b}`);
    }
    assert.strictEqual(hashContent('a'), hashContent('a'));
  });

  test('Lightning CSS options differing only in a visitor function do not share a cache entry', async () => {
    const input = '<style>a{color:red}</style>';
    // Same source; only the closed-over channel value differs
    const recoloring = (/** @type {number} */ r) => ({ Color: () => ({ type: 'rgb', r, g: 0, b: 0, alpha: 1 }) });

    assert.strictEqual(await minify(input, { minifyCSS: { visitor: recoloring(1) } }), '<style>a{color:#010000}</style>');
    assert.strictEqual(await minify(input, { minifyCSS: { visitor: recoloring(2) } }), '<style>a{color:#020000}</style>');
  });

  test('Terser options differing only in a regular expression do not share a cache entry', async () => {
    const input = '<script>/*keep-a*/var a=1;/*keep-b*/var b=2;</script>';

    const resultA = await minify(input, { minifyJS: { format: { comments: /keep-a/ } } });
    const resultB = await minify(input, { minifyJS: { format: { comments: /keep-b/ } } });

    assert.ok(resultA.includes('/*keep-a*/') && !resultA.includes('/*keep-b*/'), resultA);
    assert.ok(resultB.includes('/*keep-b*/') && !resultB.includes('/*keep-a*/'), resultB);
  });

  // Sizes lock on the first `minify()` call for the life of the process, so any size but
  // the default has to be observed in a process that sets it before anything else runs
  const firstCall = (/** @type {object} */ options, /** @type {Record<string, string>} */ env = {}) => {
    const urlMinifier = new URL('../src/htmlminifier.js', import.meta.url).href;
    const script = `
      import { minify, getCacheStats } from ${JSON.stringify(urlMinifier)};
      const options = { minifyCSS: true, minifyJS: true, ...${JSON.stringify(options)} };
      const input = '<style>.probe { color: red; }</style><script>let probe = 1; console.log(probe);</script>';
      const output = await minify(input, options);
      await minify(input, options);
      console.log(JSON.stringify({ output, stats: getCacheStats() }));
    `;
    const { stdout, stderr, status, error } = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      timeout: 30000
    });
    assert.strictEqual(status, 0, `Probe process failed: ${error?.message ?? stderr}`);
    return JSON.parse(stdout);
  };

  test('Default sizes work', () => {
    const { output, stats } = firstCall({});

    assert.ok(output.includes('.probe{color:red}'), 'CSS should be minified');
    assert.ok(output.includes('let probe=1;console.log(probe)'), 'JS should be minified');
    for (const cache of ['css', 'js', 'svg']) {
      assert.strictEqual(stats[cache].limit, 500, `${cache} cache limit should be the default`);
    }
  });

  test('A custom CSS cache size works', () => {
    const { stats } = firstCall({ cacheCSS: 750 });

    assert.strictEqual(stats.css.limit, 750, 'CSS cache limit should be the configured size');
    assert.strictEqual(stats.js.limit, 500, 'JS cache limit should stay at the default');
  });

  test('A custom JS cache size works', () => {
    const { stats } = firstCall({ cacheJS: 250 });

    assert.strictEqual(stats.js.limit, 250, 'JS cache limit should be the configured size');
    assert.strictEqual(stats.css.limit, 500, 'CSS cache limit should stay at the default');
  });

  test('Both cache sizes work together', () => {
    const { stats } = firstCall({ cacheCSS: 600, cacheJS: 400 });

    assert.strictEqual(stats.css.limit, 600, 'CSS cache limit should be the configured size');
    assert.strictEqual(stats.js.limit, 400, 'JS cache limit should be the configured size');
  });

  test('Environment variables set the cache size', () => {
    const { stats } = firstCall({}, { HMN_CACHE_CSS: '900', HMN_CACHE_JS: '300' });

    assert.strictEqual(stats.css.limit, 900, '`HMN_CACHE_CSS` should set the CSS cache limit');
    assert.strictEqual(stats.js.limit, 300, '`HMN_CACHE_JS` should set the JS cache limit');
  });

  test('Option overrides environment variable', () => {
    const { stats } = firstCall({ cacheCSS: 650 }, { HMN_CACHE_CSS: '100' });

    assert.strictEqual(stats.css.limit, 650, 'Option should override env var');
  });

  test('Very large cache sizes work', () => {
    const { output, stats } = firstCall({ cacheJS: 10000 });

    assert.strictEqual(stats.js.limit, 10000, 'JS cache limit should be the configured size');
    assert.ok(output.includes('let probe=1;console.log(probe)'), 'JS should minify with large cache');
  });

  test('`cacheCSS: 0` switches the cache off and still minifies', () => {
    const { output, stats } = firstCall({ cacheCSS: 0 });

    assert.ok(output.includes('.probe{color:red}'), 'CSS should minify even with `cacheCSS: 0`');
    assert.strictEqual(stats.css.limit, 0, 'Cache limit should be reported as zero');
    assert.strictEqual(stats.css.gets, 2, 'Both calls should still perform a lookup');
    assert.strictEqual(stats.css.hits, 0, 'The repeated call should miss rather than hit');
    assert.strictEqual(stats.css.size, 0, 'Nothing should be stored');
  });

  test('A negative cache size falls back to the default', () => {
    const { stats } = firstCall({ cacheCSS: -5 });

    assert.strictEqual(stats.css.limit, 500, 'Default cache limit should be reported');
    assert.strictEqual(stats.css.hits, 1, 'The repeated call should hit, as it does by default');
  });

  test('Negative environment variable returns undefined (uses default)', () => {
    const { stats } = firstCall({}, { HMN_CACHE_CSS: '-100' });

    assert.strictEqual(stats.css.limit, 500, 'Default cache limit should be used when env var is negative');
  });

  test('Infinity environment variable returns undefined (uses default)', () => {
    const { stats } = firstCall({}, { HMN_CACHE_CSS: 'Infinity' });

    assert.strictEqual(stats.css.limit, 500, 'Default cache limit should be used when env var is Infinity');
  });

  test('Invalid string environment variable returns undefined (uses default)', () => {
    const { stats } = firstCall({}, { HMN_CACHE_CSS: 'not-a-number' });

    assert.strictEqual(stats.css.limit, 500, 'Default cache limit should be used when env var is invalid string');
  });

  test('Large CSS inputs with identical first/last 50 chars are not confused in cache', async () => {
    // Craft two CSS inputs that share the same length, first 50 chars, and last 50 chars but differ
    // in the middle, which a fingerprint key would confuse
    const first50 = 'div,p,span,section,article,main,header,footer,nav{'; // exactly 50 chars
    const last50 = '}/*' + 'x'.repeat(45) + '*/'; // exactly 50 chars
    const filler = '/* ' + 'f'.repeat(1970) + ' */'; // stripped by minifier
    assert.strictEqual(first50.length, 50, '`first50` must be exactly 50 chars');
    assert.strictEqual(last50.length, 50, '`last50` must be exactly 50 chars');

    // `color:red; ` and `color:blue;` are both 11 chars—inputs are the same total length
    const css1 = first50 + 'color:red; ' + filler + last50;
    const css2 = first50 + 'color:blue;' + filler + last50;

    assert.ok(css1.length > 2048, 'Input must exceed the 2048-char threshold');
    assert.strictEqual(css1.length, css2.length, 'Inputs must be the same length to guarantee fingerprint collision');
    assert.strictEqual(css1.slice(0, 50), css2.slice(0, 50), 'First 50 chars must be identical');
    assert.strictEqual(css1.slice(-50), css2.slice(-50), 'Last 50 chars must be identical');

    const result1 = await minify(`<style>${css1}</style>`, { minifyCSS: true });
    const result2 = await minify(`<style>${css2}</style>`, { minifyCSS: true });

    assert.notStrictEqual(result1, result2, 'Different large CSS inputs must not share a cache entry');
    assert.ok(result1.includes('red'), 'First result should contain the correct color');
    assert.ok(result2.includes('blue') || result2.includes('#00f'), 'Second result should contain the correct color');
  });

  test('Large JS inputs with identical first/last 50 chars are not confused in cache', async () => {
    const first50 = '/*' + 'a'.repeat(46) + '*/'; // exactly 50 chars
    const last50 = '/*' + 'b'.repeat(46) + '*/'; // exactly 50 chars
    const filler = '/*' + 'x'.repeat(1970) + '*/'; // stripped by minifier
    assert.strictEqual(first50.length, 50, '`first50` must be exactly 50 chars');
    assert.strictEqual(last50.length, 50, '`last50` must be exactly 50 chars');

    // Both middles are 7 chars—inputs are the same total length
    const js1 = first50 + 'a=1111;' + filler + last50;
    const js2 = first50 + 'a=2222;' + filler + last50;

    assert.ok(js1.length > 2048, 'Input must exceed the 2048-char threshold');
    assert.strictEqual(js1.length, js2.length, 'Inputs must be the same length to guarantee fingerprint collision');
    assert.strictEqual(js1.slice(0, 50), js2.slice(0, 50), 'First 50 chars must be identical');
    assert.strictEqual(js1.slice(-50), js2.slice(-50), 'Last 50 chars must be identical');

    const result1 = await minify(`<script>${js1}</script>`, { minifyJS: true });
    const result2 = await minify(`<script>${js2}</script>`, { minifyJS: true });

    assert.notStrictEqual(result1, result2, 'Different large JS inputs must not share a cache entry');
    assert.ok(result1.includes('1111'), 'First result should contain the correct value');
    assert.ok(result2.includes('2222'), 'Second result should contain the correct value');
  });

  test('`getCacheStats()` reflects hits and misses', async () => {
    // Unique selector so this test’s lookups are unaffected by entries other tests left behind
    const input = '<style>.cache-stats-probe { color: rebeccapurple; }</style>';

    const before = getCacheStats().css;
    await minify(input, { minifyCSS: true }); // First call: a miss (populates the cache)
    await minify(input, { minifyCSS: true }); // Second call: a hit (same key, already cached)
    const after = getCacheStats().css;

    assert.strictEqual(after.gets - before.gets, 2, 'Both calls should perform a cache lookup');
    assert.strictEqual(after.hits - before.hits, 1, 'Only the second, identical call should hit the cache');
    assert.ok(after.size >= 1, 'Cache should hold at least the entry just inserted');
    assert.strictEqual(after.limit, 500, 'Default cache limit should be reported');
  });

  test('`getCacheStats()` leaves untouched caches unchanged', async () => {
    // Only CSS caching is exercised—JS and SVG lookups must not be incremented by this call
    const jsBefore = getCacheStats().js;
    const svgBefore = getCacheStats().svg;

    await minify('<style>.cache-stats-probe-2 { color: teal; }</style>', { minifyCSS: true });

    const jsAfter = getCacheStats().js;
    const svgAfter = getCacheStats().svg;

    assert.strictEqual(jsAfter.gets, jsBefore.gets, 'JS cache should not be touched when `minifyJS` is off');
    assert.strictEqual(svgAfter.gets, svgBefore.gets, 'SVG cache should not be touched when `minifySVG` is off');
  });

  test('Oversized CSS input (>1 MB) is minified normally but never cached', async () => {
    const bigComment = '/*' + 'x'.repeat(1024 * 1024) + '*/';
    const input = `<style>.oversize-probe{color:tomato}${bigComment}</style>`;

    const before = getCacheStats().css;
    const result1 = await minify(input, { minifyCSS: true });
    const result2 = await minify(input, { minifyCSS: true });
    const after = getCacheStats().css;

    assert.strictEqual(result1, result2, 'Result should be identical whether or not it was cached');
    assert.ok(result1.includes('.oversize-probe{color:tomato}'), 'CSS should still be minified');
    assert.strictEqual(after.gets, before.gets, 'Oversized input should never reach `cache.get()`');
    assert.strictEqual(after.size, before.size, 'Oversized input should never be stored in the cache');
  });

  test('Oversized JS input (>1 MB) is minified normally but never cached', async () => {
    const bigComment = '/*' + 'x'.repeat(1024 * 1024) + '*/';
    const input = `<script>function oversizeProbe(){return 42}${bigComment}</script>`;

    const before = getCacheStats().js;
    const result1 = await minify(input, { minifyJS: true });
    const result2 = await minify(input, { minifyJS: true });
    const after = getCacheStats().js;

    assert.strictEqual(result1, result2, 'Result should be identical whether or not it was cached');
    assert.ok(result1.includes('return 42'), 'JS should still be minified');
    assert.strictEqual(after.gets, before.gets, 'Oversized input should never reach `cache.get()`');
    assert.strictEqual(after.size, before.size, 'Oversized input should never be stored in the cache');
  });
});