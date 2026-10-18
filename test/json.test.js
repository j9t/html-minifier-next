import { describe, test } from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';

describe('JSON', () => {
  test('Minifies `application/ld+json`', async () => {
    const input = '<script type="application/ld+json">{"foo":  "bar"}\n\n</script>';
    const output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Keeps invalid `application/ld+json` as is', async () => {
    const input = '<script type="application/ld+json">{"foo:  "bar"}\n\n</script>';
    const output = '<script type="application/ld+json">{"foo:  "bar"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `importmap`', async () => {
    const input = '<script type="importmap">\n{\n  "imports": {\n    "lodash": "/js/lodash.js",\n    "vue": "https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js"\n  }\n}\n</script>';
    const output = '<script type="importmap">{"imports":{"lodash":"/js/lodash.js","vue":"https://cdn.jsdelivr.net/npm/vue@3/dist/vue.esm-browser.js"}}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `application/json`', async () => {
    const input = '<script type="application/json">{\n  "data": {\n    "name": "test",\n    "value": 123\n  }\n}</script>';
    const output = '<script type="application/json">{"data":{"name":"test","value":123}}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `speculationrules`', async () => {
    const input = '<script type="speculationrules">{\n  "prerender": [\n    {\n      "source": "list",\n      "urls": ["/page1", "/page2"]\n    }\n  ]\n}</script>';
    const output = '<script type="speculationrules">{"prerender":[{"source":"list","urls":["/page1","/page2"]}]}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `application/manifest+json`', async () => {
    const input = '<script type="application/manifest+json">{\n  "name": "App",\n  "version": "1.0"\n}</script>';
    const output = '<script type="application/manifest+json">{"name":"App","version":"1.0"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Keeps invalid `application/manifest+json` as is', async () => {
    const input = '<script type="application/manifest+json">{"name": invalid}\n</script>';
    const output = '<script type="application/manifest+json">{"name": invalid}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `application/vnd.geo+json`', async () => {
    const input = '<script type="application/vnd.geo+json">{\n  "type": "Point",\n  "coordinates": [100.0, 0.0]\n}</script>';
    const output = '<script type="application/vnd.geo+json">{"type":"Point","coordinates":[100.0,0.0]}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Keeps invalid `application/vnd.geo+json` as is', async () => {
    const input = '<script type="application/vnd.geo+json">{"type": Point}\n</script>';
    const output = '<script type="application/vnd.geo+json">{"type": Point}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `application/problem+json`', async () => {
    const input = '<script type="application/problem+json">{\n  "type": "about:blank",\n  "status": 404\n}</script>';
    const output = '<script type="application/problem+json">{"type":"about:blank","status":404}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `application/merge-patch+json`', async () => {
    const input = '<script type="application/merge-patch+json">{\n  "title": "New Title"\n}</script>';
    const output = '<script type="application/merge-patch+json">{"title":"New Title"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Minifies `application/json-patch+json`', async () => {
    const input = '<script type="application/json-patch+json">[\n  {\n    "op": "replace",\n    "path": "/title",\n    "value": "New"\n  }\n]</script>';
    const output = '<script type="application/json-patch+json">[{"op":"replace","path":"/title","value":"New"}]</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Keeps invalid `application/merge-patch+json` as is', async () => {
    const input = '<script type="application/merge-patch+json">{"title": invalid value}\n</script>';
    const output = '<script type="application/merge-patch+json">{"title": invalid value}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Reads the `type` attribute case-insensitively', async () => {
    const input = '<script type="Application/JSON">{\n  "test": "value"\n}</script>';
    const output = '<script type="Application/JSON">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Trims whitespace in the `type` attribute', async () => {
    const input = '<script type=" application/json ">{\n  "test": "value"\n}</script>';
    const output = '<script type="application/json">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Handles a `type` attribute with a `charset` parameter', async () => {
    const input = '<script type="application/json; charset=utf-8">{\n  "test": "value"\n}</script>';
    const output = '<script type="application/json;charset=utf-8">{"test":"value"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Leaves JSON unminified without `minifyJSON`', async () => {
    const input = '<script type="application/ld+json">{\n  "foo": "bar"\n}</script>';
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyJSON: false }), input);
    // Not handed to `processScripts` either, which is for HTML templates
    assert.strictEqual(await minify(input, { collapseWhitespace: true, processScripts: ['application/ld+json'] }), input);
  });

  test('Leaves JSON types on `style` elements alone', async () => {
    const input = '<style type="application/json">{ "a": 1 }</style>';
    assert.strictEqual(await minify(input, { minifyJSON: true }), input);
    assert.strictEqual(await minify(input, { minifyJSON: true, processScripts: ['text/x-template'] }), input);
    // `processScripts` still applies to `style` elements
    assert.strictEqual(
      await minify('<style type="text/x-template"><p> a </p></style>', { collapseWhitespace: true, minifyJSON: true, processScripts: ['text/x-template'] }),
      '<style type="text/x-template"><p>a</p></style>'
    );
  });

  test('Minifies JSON with `minifyJSON` alone', async () => {
    const input = '<script type="application/ld+json">{\n  "foo": "bar"\n}</script>';
    const output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    assert.strictEqual(await minify(input, { minifyJSON: true }), output);
  });

  test('Minifies JSON in `iframe srcdoc` with `minifyJSON` alone', async () => {
    const input = '<iframe srcdoc="<script type=&quot;application/json&quot;>{ &quot;a&quot;: 1 }</script>"></iframe>';
    const output = '<iframe srcdoc="<script type=&quot;application/json&quot;>{&quot;a&quot;:1}</script>"></iframe>';
    assert.strictEqual(await minify(input, { minifyJSON: true }), output);
  });

  test('Keeps JSON values intact', async () => {
    const values = [
      ['{"id": 12345678901234567890}', '{"id":12345678901234567890}'],
      ['{"a": 1e400, "b": -0, "c": 1.50}', '{"a":1e400,"b":-0,"c":1.50}'],
      ['{"k": 1, "k": 2}', '{"k":1,"k":2}'],
      ['{"s": "a  b\\n\\t c", "e": "\\u00e9\\/"}', '{"s":"a  b\\n\\t c","e":"é/"}'],
      ['{"q": "say \\"hi\\"  there", "r": "\\\\"  }', '{"q":"say \\"hi\\"  there","r":"\\\\"}'],
      ['{"u": "\\ud800", "v": "\\uD83D\\uDE00"}', '{"u":"\\ud800","v":"😀"}'],
      ['[ "", " ", "\\"", "a\\\\" , "\\\\\\"" ]', '[""," ","\\"","a\\\\","\\\\\\""]'],
      ['\n  42 \n', '42'],
      ['"  top level  "', '"  top level  "'],
      ['{ "a" : [ 1 , { "b" : null } ] , "c" : true }', '{"a":[1,{"b":null}],"c":true}']
    ];
    for (const [json, minified] of values) {
      const input = `<script type="application/json">${json}</script>`;
      assert.strictEqual(await minify(input, { minifyJSON: true }), `<script type="application/json">${minified}</script>`);
    }
  });

  test('Escapes `<` in minified JSON', async () => {
    const values = [
      // With and without other escapes in the same string
      ['{"html": "<\\/p>",  "lt": 1}', '{"html":"\\u003C/p>","lt":1}'],
      ['{"a": "x<y<z",  "b": "<"}', '{"a":"x\\u003Cy\\u003Cz","b":"\\u003C"}'],
      ['["\\"<", "<\\\\"]', '["\\"\\u003C","\\u003C\\\\"]']
    ];
    for (const [json, minified] of values) {
      const input = `<script type="application/json">${json}</script>`;
      assert.strictEqual(await minify(input, { minifyJSON: true }), `<script type="application/json">${minified}</script>`);
    }
  });

  test('JSON script content keeps `<` escaped', async () => {
    // A framework hydration payload: HTML held inside JSON, with `<` and `/`
    // escaped so the nested `</script>` cannot terminate the container
    const input = '<script type="application/json">{\n  "content": "\\u003Cscript\\u003Ealert(1)\\u003C\\u002Fscript\\u003E"\n}</script>';
    const result = await minify(input, { collapseWhitespace: true, minifyJSON: true });

    assert.ok(!/<\/script/i.test(result.slice(result.indexOf('>') + 1, result.lastIndexOf('</script>'))), 'JSON content must not contain a literal `</script`');
    assert.strictEqual(result, '<script type="application/json">{"content":"\\u003Cscript>alert(1)\\u003C/script>"}</script>');

    // The escaping must not change what the JSON parses to
    const value = JSON.parse(result.slice(result.indexOf('>') + 1, result.lastIndexOf('</script>')));
    assert.strictEqual(value.content, '<script>alert(1)</script>');
  });

  test('JSON script content without markup is unaffected', async () => {
    const input = '<script type="application/ld+json">{\n  "@type": "Person",\n  "name": "Test"\n}</script>';
    const output = '<script type="application/ld+json">{"@type":"Person","name":"Test"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true, minifyJSON: true }), output);
  });

  test('Handles JSON minification errors', async () => {
    // Malformed JSON should be preserved with default `continueOnMinifyError: true`
    let input = '<script type="application/ld+json">{"foo:  "bar"}</script>';
    let result = await minify(input, { collapseWhitespace: true, minifyJSON: true });
    assert.strictEqual(result, input);

    // Malformed JSON should throw with `continueOnMinifyError: false`
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, collapseWhitespace: true, minifyJSON: true }),
      SyntaxError
    );

    // Valid JSON should work fine with `continueOnMinifyError: false`
    input = '<script type="application/ld+json">{"foo": "bar"}</script>';
    const output = '<script type="application/ld+json">{"foo":"bar"}</script>';
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, collapseWhitespace: true, minifyJSON: true }));
    result = await minify(input, { continueOnMinifyError: false, collapseWhitespace: true, minifyJSON: true });
    assert.strictEqual(result, output);
  });
});