import { describe, test } from 'node:test';
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { minify, getCacheStats } from '../src/htmlminifier.js';
import { hashContent } from '../src/lib/utils.js';

describe('Caches', () => {
  test('Hashes keys of large inputs without the collisions a 32-bit hash has', () => {
    // FNV-1a 32-bit collisions
    for (const [a, b] of [['costarring', 'liquid'], ['declinate', 'macallums'], ['altarage', 'zinke']]) {
      assert.notStrictEqual(hashContent(a), hashContent(b), `${a} and ${b}`);
    }
    assert.strictEqual(hashContent('a'), hashContent('a'));
  });

  test('Default sizes work', async () => {
    // Caches work without explicit configuration
    const input = `
      <style>body { color: red; margin: 0; }</style>
      <script>let x = 1; console.log(x);</script>
    `;

    const result = await minify(input, {
      minifyCSS: true,
      minifyJS: { compress: { drop_console: true } }
    });

    assert.ok(result.includes('body{color:red;margin:0}'), 'CSS should be minified');
    assert.ok(!result.includes('console.log'), 'Console should be dropped from JS');
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

  test('A custom CSS cache size works', async () => {
    const input = '<style>body { color: blue; padding: 0; }</style>';

    // Should work with custom CSS cache size
    const result = await minify(input, {
      minifyCSS: true,
      cacheCSS: 750 // Custom size
    });

    // Just verify that minification worked - the exact output may vary
    assert.ok(result.length < input.length, 'Output should be smaller than input');
    assert.ok(result.includes('body'), 'Should contain body selector');
    assert.ok(result.includes('color:'), 'Should contain color property');
  });

  test('A custom JS cache size works', async () => {
    const input = '<script>function test() { return 42; }</script>';

    // Should work with custom JS cache size
    const result = await minify(input, {
      minifyJS: true,
      cacheJS: 250 // Custom size
    });

    assert.ok(result.includes('function test(){return 42}') || result.includes('function test(){return 42;}'),
      'JS should be minified with custom cache');
  });

  test('Both cache sizes work together', async () => {
    const input = `
      <style>div { background: #fff; margin: 10px; }</style>
      <script>let data = { x: 1, y: 2 };</script>
    `;

    // Should work with both custom cache sizes
    const result = await minify(input, {
      minifyCSS: true,
      minifyJS: true,
      cacheCSS: 600,
      cacheJS: 400
    });

    assert.ok(result.includes('#fff'), 'CSS should be minified');
    assert.ok(result.includes('x:1') && result.includes('y:2'), 'JS should be minified with custom cache sizes');
  });

  test('Environment variables set the cache size', async () => {
    const input = '<style>.test { color: purple; }</style>';

    // Environment variable override
    process.env.HMN_CACHE_CSS = '900';
    try {
      const result = await minify(input, {
        minifyCSS: true
      });

      assert.ok(result.includes('.test{color:purple}'), 'CSS should minify with env var cache size');
    } finally {
      // Cleanup always runs, even if assertion fails
      delete process.env.HMN_CACHE_CSS;
    }
  });

  test('Option overrides environment variable', async () => {
    const input = '<style>.foo { border: none; }</style>';

    // Set env var first
    process.env.HMN_CACHE_CSS = '100';

    try {
      // Option should override env var
      const result = await minify(input, {
        minifyCSS: true,
        cacheCSS: 650
      });

      assert.ok(result.includes('.foo{border:none}'), 'Option should override env var');
    } finally {
      // Cleanup always runs, even if assertion fails
      delete process.env.HMN_CACHE_CSS;
    }
  });

  test('Very large cache sizes work', async () => {
    const input = '<script>function largeTest() { return "large"; }</script>';

    // Should handle large cache sizes without issues
    const result = await minify(input, {
      minifyJS: true,
      cacheJS: 10000 // Very large size
    });

    assert.ok(result.includes('function largeTest(){'), 'JS should minify with large cache');
  });

  test('Zero cache size still minifies', async () => {
    const input = '<style>.zero { margin: 0; }</style>';

    const result = await minify(input, {
      minifyCSS: true,
      cacheCSS: 0 // Switches the cache off
    });

    assert.ok(result.includes('.zero{margin:0}'), 'CSS should minify even with `cacheCSS: 0`');
  });

  // Sizes lock on the first `minify()` call for the life of the process, so any size but
  // the default has to be observed in a process that sets it before anything else runs
  const cssStatsForFirstCall = (/** @type {number} */ size) => {
    const urlMinifier = new URL('../src/htmlminifier.js', import.meta.url).href;
    const script = `
      import { minify, getCacheStats } from ${JSON.stringify(urlMinifier)};
      const input = '<style>.probe { color: red; }</style>';
      await minify(input, { minifyCSS: true, cacheCSS: ${size} });
      await minify(input, { minifyCSS: true, cacheCSS: ${size} });
      console.log(JSON.stringify(getCacheStats().css));
    `;
    const { stdout, stderr, status } = spawnSync('node', ['--input-type=module', '--eval', script], { encoding: 'utf8' });
    assert.strictEqual(status, 0, `Probe process failed: ${stderr}`);
    return JSON.parse(stdout);
  };

  test('`cacheCSS: 0` switches the cache off', () => {
    const stats = cssStatsForFirstCall(0);

    assert.strictEqual(stats.limit, 0, 'Cache limit should be reported as zero');
    assert.strictEqual(stats.gets, 2, 'Both calls should still perform a lookup');
    assert.strictEqual(stats.hits, 0, 'The repeated call should miss rather than hit');
    assert.strictEqual(stats.size, 0, 'Nothing should be stored');
  });

  test('A negative cache size falls back to the default', () => {
    const stats = cssStatsForFirstCall(-5);

    assert.strictEqual(stats.limit, 500, 'Default cache limit should be reported');
    assert.strictEqual(stats.hits, 1, 'The repeated call should hit, as it does by default');
  });

  test('Negative environment variable returns undefined (uses default)', async () => {
    const input = '<style>.test { color: red; }</style>';

    // Set negative env var—should be ignored
    process.env.HMN_CACHE_CSS = '-100';
    try {
      const result = await minify(input, {
        minifyCSS: true
      });

      // Should work with default cache size (check for selector and minified format)
      assert.ok(result.includes('.test{'), 'Should minify CSS with default cache size when env var is negative');
      assert.ok(result.includes('color:'), 'Should contain color property');
    } finally {
      delete process.env.HMN_CACHE_CSS;
    }
  });

  test('Infinity environment variable returns undefined (uses default)', async () => {
    const input = '<style>.test { color: blue; }</style>';

    // Set `Infinity` env var—should be ignored
    process.env.HMN_CACHE_CSS = 'Infinity';
    try {
      const result = await minify(input, {
        minifyCSS: true
      });

      // Should work with default cache size (Lightning CSS converts blue to hex)
      assert.ok(result.includes('.test{'), 'Should minify CSS with default cache size when env var is Infinity');
      assert.ok(result.includes('color:'), 'Should contain `color` property');
    } finally {
      delete process.env.HMN_CACHE_CSS;
    }
  });

  test('Invalid string environment variable returns undefined (uses default)', async () => {
    const input = '<style>.test { color: green; }</style>';

    // Set invalid string env var—should be ignored
    process.env.HMN_CACHE_CSS = 'not-a-number';
    try {
      const result = await minify(input, {
        minifyCSS: true
      });

      // Should work with default cache size (Lightning CSS converts green to hex)
      assert.ok(result.includes('.test{'), 'Should minify CSS with default cache size when env var is invalid string');
      assert.ok(result.includes('color:'), 'Should contain `color` property');
    } finally {
      delete process.env.HMN_CACHE_CSS;
    }
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