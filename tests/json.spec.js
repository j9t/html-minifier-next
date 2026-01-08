import {describe, test} from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';

describe('JSON', () => {
  test('Error handling', async () => {
    // Malformed JSON should be preserved with default `continueOnMinifyError: true`
    let input = '<script type="application/ld+json">{"foo:  "bar"}</script>';
    let result = await minify(input, { collapseWhitespace: true });
    assert.strictEqual(result, input);

    // Malformed JSON should throw with `continueOnMinifyError: false`
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, collapseWhitespace: true }),
      SyntaxError
    );

    // Valid JSON should work fine with `continueOnMinifyError: false`
    input = '<script type="application/ld+json">{"foo": "bar"}</script>';
    const output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, collapseWhitespace: true }));
    result = await minify(input, { continueOnMinifyError: false, collapseWhitespace: true });
    assert.strictEqual(result, output);
  });

  test('Presets', async () => {
    const { getPreset } = await import('../src/presets.js');

    // Test with conservative preset
    let input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html>\n  <head>\n    <!-- Comment -->\n    <script type="application/ld+json">\n{\n  "name": "Test",\n  "url": "https://example.com/page"\n}\n    </script>\n  </head>\n</html>';
    let conservativeResult = await minify(input, getPreset('conservative'));
    // Conservative preset should: remove comments, collapse whitespace, minify JSON, use short doctype
    assert.ok(!conservativeResult.includes('<!-- Comment -->'), 'Conservative: should remove comments');
    assert.ok(conservativeResult.includes('<!doctype html>'), 'Conservative: should use short doctype');
    assert.ok(conservativeResult.includes('{"name":"Test","url":"https://example.com/page"}'), 'Conservative: should minify JSON');
    assert.ok(!conservativeResult.includes('\n{\n'), 'Conservative: should collapse whitespace in script content');

    // Test with comprehensive preset
    input = '<script type="importmap">\n{\n  "imports": {\n    "vue": "https://cdn.example.com/vue.js"\n  }\n}\n</script>';
    let comprehensiveResult = await minify(input, getPreset('comprehensive'));
    // Comprehensive preset should: minify JSON, collapse whitespace, remove quotes from attributes where possible
    assert.ok(comprehensiveResult.includes('{"imports":{"vue":"https://cdn.example.com/vue.js"}}'), 'Comprehensive: should minify JSON');
    assert.ok(comprehensiveResult.includes('type=importmap'), 'Comprehensive: should remove attribute quotes');

    // Verify JSON minification works even with no options (automatic behavior)
    input = '<script type="application/json">{\n  "test": "value"\n}</script>';
    const noOptionsResult = await minify(input, {});
    assert.strictEqual(noOptionsResult, '<script type="application/json">{"test":"value"}</script>', 'No options: should still minify JSON automatically');
  });

  test('`application/ld+json`', async () => {
    const input = '<script type="application/ld+json">{"foo":  "bar"}\n\n</script>';
    const output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/ld+json` (invalid/malformed)', async () => {
    const input = '<script type="application/ld+json">{"foo:  "bar"}\n\n</script>';
    const output = '<script type="application/ld+json">{"foo:  "bar"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`importmap`', async () => {
    const input = '<script type="importmap">\n{\n  "imports": {\n    "lodash": "/js/lodash.js",\n    "vue": "https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js"\n  }\n}\n</script>';
    const output = '<script type="importmap">{"imports":{"lodash":"/js/lodash.js","vue":"https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js"}}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/json`', async () => {
    const input = '<script type="application/json">{\n  "data": {\n    "name": "test",\n    "value": 123\n  }\n}</script>';
    const output = '<script type="application/json">{"data":{"name":"test","value":123}}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`speculationrules`', async () => {
    const input = '<script type="speculationrules">{\n  "prerender": [\n    {\n      "source": "list",\n      "urls": ["/page1", "/page2"]\n    }\n  ]\n}</script>';
    const output = '<script type="speculationrules">{"prerender":[{"source":"list","urls":["/page1","/page2"]}]}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/manifest+json`', async () => {
    const input = '<script type="application/manifest+json">{\n  "name": "App",\n  "version": "1.0"\n}</script>';
    const output = '<script type="application/manifest+json">{"name":"App","version":"1.0"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/manifest+json` (invalid/malformed)', async () => {
    const input = '<script type="application/manifest+json">{"name": invalid}\n</script>';
    const output = '<script type="application/manifest+json">{"name": invalid}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/vnd.geo+json`', async () => {
    const input = '<script type="application/vnd.geo+json">{\n  "type": "Point",\n  "coordinates": [100.0, 0.0]\n}</script>';
    const output = '<script type="application/vnd.geo+json">{"type":"Point","coordinates":[100,0]}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/vnd.geo+json` (invalid/malformed)', async () => {
    const input = '<script type="application/vnd.geo+json">{"type": Point}\n</script>';
    const output = '<script type="application/vnd.geo+json">{"type": Point}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/problem+json`', async () => {
    const input = '<script type="application/problem+json">{\n  "type": "about:blank",\n  "status": 404\n}</script>';
    const output = '<script type="application/problem+json">{"type":"about:blank","status":404}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/merge-patch+json`', async () => {
    const input = '<script type="application/merge-patch+json">{\n  "title": "New Title"\n}</script>';
    const output = '<script type="application/merge-patch+json">{"title":"New Title"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/json-patch+json`', async () => {
    const input = '<script type="application/json-patch+json">[\n  {\n    "op": "replace",\n    "path": "/title",\n    "value": "New"\n  }\n]</script>';
    const output = '<script type="application/json-patch+json">[{"op":"replace","path":"/title","value":"New"}]</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`application/merge-patch+json` (invalid/malformed)', async () => {
    const input = '<script type="application/merge-patch+json">{"title": invalid value}\n</script>';
    const output = '<script type="application/merge-patch+json">{"title": invalid value}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('Case-insensitive `type` attribute', async () => {
    const input = '<script type="Application/JSON">{\n  "test": "value"\n}</script>';
    const output = '<script type="Application/JSON">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`type` attribute with whitespace', async () => {
    const input = '<script type=" application/json ">{\n  "test": "value"\n}</script>';
    const output = '<script type="application/json">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('`type` attribute with `charset` parameter', async () => {
    const input = '<script type="application/json; charset=utf-8">{\n  "test": "value"\n}</script>';
    const output = '<script type="application/json;charset=utf-8">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });
});