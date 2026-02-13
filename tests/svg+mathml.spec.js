import assert from 'node:assert';
import {describe, test} from 'node:test';
import { minify } from '../src/htmlminifier.js';

describe('SVG and MathML', () => {
  test('SVGO basic optimization', async () => {
    // Path data optimization (relative commands, space removal)
    const result = await minify('<svg><path d="M 10.500 20.300 L 30.400 40.500"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.startsWith('<svg>'), 'Should start with <svg>');
    assert.ok(result.endsWith('</svg>') || result.endsWith('/>'), 'Should end with closing tag');
    assert.ok(result.length < '<svg><path d="M 10.500 20.300 L 30.400 40.500"/></svg>'.length, 'Should be shorter than input');

    // Rect-to-path conversion (SVGO default)
    assert.strictEqual(
      await minify('<svg><rect width="100" height="100" fill="red"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path fill="red" d="M0 0h100v100H0z"/></svg>'
    );
  });

  test('Numeric precision reduction', async () => {
    // Coordinates are optimized
    const result = await minify('<svg><circle cx="283.500" cy="487.500" rx="259.000" ry="80.000"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('283.5'), 'Trailing zeros should be removed');
    assert.ok(!result.includes('283.500'), 'Original precision should not be preserved');
  });

  test('Color optimization', async () => {
    // RGB to hex
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10" fill="rgb(255,255,255)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path fill="#fff" d="M0 0h10v10H0z"/></svg>'
    );

    // Black fill is default—removed by SVGO
    const result = await minify('<svg><rect width="10" height="10" fill="#000000"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(!result.includes('#000000'), 'Long hex should be shortened or removed');
  });

  test('Default attribute removal', async () => {
    // SVGO removes default attributes
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10" fill-opacity="1"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M0 0h10v10H0z"/></svg>'
    );
  });

  test('Preserve case sensitivity', async () => {
    // SVG element and attribute names preserve case (camelCase)
    const result = await minify('<svg><text textLength="100" lengthAdjust="spacingAndGlyphs">Text</text></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('textLength="100"'), 'camelCase attribute textLength preserved');
    assert.ok(result.includes('lengthAdjust="spacingAndGlyphs"'), 'camelCase attribute lengthAdjust preserved');
  });

  test('Preserve self-closing slashes in SVG', async () => {
    // Self-closing tags should keep slashes within SVG
    const result = await minify('<svg><circle cx="5" cy="5" r="2"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('/>'), 'Self-closing slash should be preserved in SVG');

    // HTML elements outside SVG should not have slashes
    const mixed = await minify('<div><img src="test.jpg"/><svg><circle cx="5" cy="5" r="2"/></svg><br/></div>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(mixed.includes('<img src="test.jpg">'), 'HTML img should not have self-closing slash');
    assert.ok(mixed.includes('<br>'), 'HTML `br` should not have self-closing slash');
  });

  test('Preserve viewBox', async () => {
    // SVGO v4 preserves `viewBox` by default
    const result = await minify('<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('viewBox="0 0 100 100"'), '`viewBox` should be preserved');
  });

  test('Preserve title element', async () => {
    // SVGO v4 preserves `<title>` by default (accessibility)
    const result = await minify('<svg><title>My SVG</title><rect width="100" height="100"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('<title>My SVG</title>'), 'Title should be preserved');
  });

  test('Text content preserved', async () => {
    assert.strictEqual(
      await minify('<svg><text x="10" y="20">Hello World</text></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><text x="10" y="20">Hello World</text></svg>'
    );
  });

  test('Combined with other options', async () => {
    // SVG minification with whitespace collapse
    const result = await minify('<svg>\n  <circle cx="50" cy="50" r="40"/>\n</svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(!result.includes('\n'), 'Whitespace should be collapsed');
    assert.ok(result.includes('cx="50"'), '`circle` attributes should be preserved');

    // SVG with HTML comment removal
    const withComments = await minify('<svg><!-- comment --><circle cx="50" cy="50" r="40"/></svg>', { minifySVG: true, removeComments: true, collapseWhitespace: true });
    assert.ok(!withComments.includes('comment'), 'Comments should be removed');
  });

  test('Disabled', async () => {
    // When `minifySVG` is false, no SVG-specific optimizations
    assert.strictEqual(
      await minify('<svg><rect width="100" height="100" fill="red"/></svg>', { minifySVG: false, collapseWhitespace: true }),
      '<svg><rect width="100" height="100" fill="red"/></svg>'
    );

    // Standard HTML minification still applies
    assert.strictEqual(
      await minify('<svg>  <rect width="100" height="100"/>  </svg>', { minifySVG: false, collapseWhitespace: true }),
      '<svg><rect width="100" height="100"/></svg>'
    );
  });

  test('Complex real-world example', async () => {
    const input = `<html><body>
    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 65.326  612  502.174" class="logo">
      <ellipse class="ground" cx="283.500" cy="487.500" rx="259.000" ry="80.000" fill="#000000" fill-opacity="1" transform="scale(1)"/>
      <polygon points="100.000,10.000 40.000,198.000 190.000,78.000 10.000,78.000 160.000,198.000" stroke-width="1" fill="rgb(0,255,0)" marker-start="none"/>
      <filter id="pictureFilter">
        <feGaussianBlur stdDeviation="15.00000" color-interpolation-filters="linearRGB"/>
      </filter>
    </svg>
  </body></html>`;

    const result = await minify(input, { minifySVG: true, collapseWhitespace: true });

    // SVGO optimizes coordinates
    assert.ok(result.includes('283.5'), 'Should reduce coordinate precision');
    assert.ok(!result.includes('283.500'), 'Should remove trailing zeros');

    // SVGO preserves `viewBox` and `class`
    assert.ok(result.includes('viewBox="0 65.326 612 502.174"'), 'viewBox preserved');
    assert.ok(result.includes('class="logo"'), 'Class preserved');

    // Result should be significantly smaller
    assert.ok(result.length < input.length, 'Output should be smaller');
  });

  test('Custom SVGO options', async () => {
    // Disable shape-to-path conversion via plugin override
    assert.strictEqual(
      await minify('<svg><rect width="100" height="100" fill="red"/></svg>', {
        minifySVG: { plugins: [{ name: 'preset-default', params: { overrides: { convertShapeToPath: false } } }] },
        collapseWhitespace: true
      }),
      '<svg><rect width="100" height="100" fill="red"/></svg>'
    );

    // Disable color conversion—preserve original color format
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10" fill="rgb(255,0,0)"/></svg>', {
        minifySVG: { plugins: [{ name: 'preset-default', params: { overrides: { convertColors: false } } }] },
        collapseWhitespace: true
      }),
      '<svg><path fill="rgb(255,0,0)" d="M0 0h10v10H0z"/></svg>'
    );

    // Control numeric precision via `floatPrecision`
    assert.strictEqual(
      await minify('<svg><circle cx="10.123456" cy="20.654321" r="5.111111"/></svg>', {
        minifySVG: { floatPrecision: 1 },
        collapseWhitespace: true
      }),
      '<svg><circle cx="10.1" cy="20.7" r="5.1"/></svg>'
    );
  });

  test('Error recovery', async () => {
    // SVGO should recover gracefully with `continueOnMinifyError`
    const result = await minify('<svg><circle cx="5" cy="5" r="2"/></svg>', { minifySVG: true, collapseWhitespace: true, continueOnMinifyError: true });
    assert.ok(result.includes('<svg'), 'Should produce valid output');
  });

  test('Mixed HTML and SVG', async () => {
    // HTML elements before and after SVG
    const result = await minify('<p>Before</p><svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg><p>After</p>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.startsWith('<p>Before</p>'), 'HTML before SVG preserved');
    assert.ok(result.endsWith('<p>After</p>'), 'HTML after SVG preserved');
    assert.ok(result.includes('<svg'), 'SVG present in output');
  });

  test('Multiple SVG elements', async () => {
    const result = await minify('<div><svg><circle cx="1" cy="1" r="1"/></svg><svg><rect width="2" height="2"/></svg></div>', { minifySVG: true, collapseWhitespace: true });
    // Both SVGs should be present
    const svgCount = (result.match(/<svg/g) || []).length;
    assert.strictEqual(svgCount, 2, 'Both SVG elements should be present');
  });

  test('Nested SVG elements', async () => {
    const result = await minify('<div><svg><svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg></svg></div>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.startsWith('<div>'), 'Wrapper `div` preserved');
    assert.ok(result.includes('<svg'), 'SVG output present');
  });

  test('SVG with style element', async () => {
    const result = await minify('<svg><style>.cls{fill:red}</style><rect class="cls" width="100" height="100"/></svg>', { minifySVG: true, collapseWhitespace: true });
    // SVGO may inline styles or preserve them
    assert.ok(result.includes('red') || result.includes('fill'), 'Style information should be preserved in some form');
  });

  test('Empty SVG', async () => {
    assert.strictEqual(
      await minify('<svg></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg/>'
    );
  });

  test('SVG with namespace attributes', async () => {
    // `xlink:href` should be preserved
    const result = await minify('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#icon"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('xlink:href="#icon"'), 'xlink:href should be preserved');
    assert.ok(result.includes('xmlns:xlink'), 'xlink namespace declaration should be preserved');
  });

  test('SVG with `defs` and `use`', async () => {
    // SVGO optimizes IDs (e.g., "c" → "a") but preserves the defs/use pattern
    const result = await minify('<svg><defs><circle id="c" cx="5" cy="5" r="5"/></defs><use href="#c"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('<defs>'), 'defs should be preserved');
    assert.ok(result.includes('<use'), 'use should be preserved');
    assert.ok(result.includes('href="#'), 'href reference should be preserved');
  });

  test('SVG with `foreignObject`', async () => {
    // `foreignObject` with HTML content should be preserved
    const result = await minify('<svg><foreignObject width="100" height="100"><p>Hello</p></foreignObject></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('foreignObject'), 'foreignObject should be preserved');
    assert.ok(result.includes('Hello'), 'HTML content inside foreignObject should be preserved');

    // `foreignObject` with HTML entities
    const withEntities = await minify('<svg><foreignObject width="100" height="100"><p>A &amp; B</p></foreignObject></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(withEntities.includes('A &amp; B'), 'Entities inside `foreignObject` should be preserved');
  });

  test('HTML inside `foreignObject` is optimized with `minifySVG`', async () => {
    // Whitespace collapse inside `foreignObject`
    assert.strictEqual(
      await minify('<svg><foreignObject width="100" height="100">   <div>   Hello   World   </div>   </foreignObject></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><foreignObject width="100" height="100"><div>Hello World</div></foreignObject></svg>'
    );

    // Comment removal inside `foreignObject`
    assert.strictEqual(
      await minify('<svg><foreignObject width="100" height="100"><!-- comment --><p>Text</p></foreignObject></svg>', { minifySVG: true, removeComments: true, collapseWhitespace: true }),
      '<svg><foreignObject width="100" height="100"><p>Text</p></foreignObject></svg>'
    );

    // Empty attribute removal inside `foreignObject`
    assert.strictEqual(
      await minify('<svg><foreignObject width="100" height="100"><div class="">Text</div></foreignObject></svg>', { minifySVG: true, removeEmptyAttributes: true, collapseWhitespace: true }),
      '<svg><foreignObject width="100" height="100"><div>Text</div></foreignObject></svg>'
    );

    // Empty element removal inside `foreignObject`
    assert.strictEqual(
      await minify('<svg><foreignObject width="100" height="100"><div></div><p>Text</p></foreignObject></svg>', { minifySVG: true, removeEmptyElements: true, collapseWhitespace: true }),
      '<svg><foreignObject width="100" height="100"><p>Text</p></foreignObject></svg>'
    );

    // Redundant attribute removal inside `foreignObject`
    assert.strictEqual(
      await minify('<svg><foreignObject width="100" height="100"><form method="get"><input type="text"></form></foreignObject></svg>', { minifySVG: true, removeRedundantAttributes: true, collapseWhitespace: true }),
      '<svg><foreignObject width="100" height="100"><form><input></form></foreignObject></svg>'
    );
  });

  test('SVG with foreignObject and removeOptionalTags', async () => {
    // When `removeOptionalTags` strips `</p>`, the SVG becomes invalid XML
    // SVGO falls back gracefully with `continueOnMinifyError` (default: true),
    // returning the unoptimized SVG—still valid HTML
    const result = await minify('<svg><foreignObject width="100" height="100"><p>Text</p><p>More</p></foreignObject></svg>', {
      minifySVG: true,
      removeOptionalTags: true,
      collapseWhitespace: true
    });
    assert.ok(result.includes('foreignObject'), '`foreignObject` should be preserved');
    assert.ok(result.includes('Text'), 'Content should be preserved');
    assert.ok(result.includes('More'), 'All paragraphs should be preserved');
  });

  test('HTML-only options are disabled inside SVG for XML compatibility', async () => {
    // `decodeEntities` must not decode inside SVG (bare `&` is invalid XML)
    assert.strictEqual(
      await minify('<svg><text>A &amp; B</text></svg>', { minifySVG: true, decodeEntities: true, collapseWhitespace: true }),
      '<svg><text>A &amp; B</text></svg>'
    );

    // `removeAttributeQuotes` must not strip quotes inside SVG (XML requires quotes)
    const noQuotes = await minify('<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>', { minifySVG: true, removeAttributeQuotes: true, collapseWhitespace: true });
    assert.ok(noQuotes.includes('viewBox="0 0 100 100"'), 'SVG attribute quotes preserved');

    // `removeTagWhitespace` must not remove space between SVG attributes
    const tagWs = await minify('<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>', { minifySVG: true, removeTagWhitespace: true, collapseWhitespace: true });
    assert.ok(!tagWs.includes('width="100"height'), 'Whitespace between SVG attributes preserved');
  });

  test('HTML-only options stay disabled inside foreignObject for XML validity', async () => {
    // The entire SVG block must be valid XML for SVGO—including `foreignObject` content

    // `decodeEntities` stays disabled inside `foreignObject`
    const encoded = await minify('<svg><foreignObject width="100" height="100"><p>A &amp; B</p></foreignObject></svg>', { minifySVG: true, decodeEntities: true, collapseWhitespace: true });
    assert.ok(encoded.includes('&amp;'), 'Entities stay encoded inside `foreignObject`');

    // `removeAttributeQuotes` stays disabled inside `foreignObject`
    const quoted = await minify('<svg><foreignObject width="100" height="100"><div class="test">Text</div></foreignObject></svg>', { minifySVG: true, removeAttributeQuotes: true, collapseWhitespace: true });
    assert.ok(quoted.includes('class="test"'), 'Attribute quotes preserved inside `foreignObject`');

    // But HTML options outside SVG still work
    const mixed = await minify('<div id="test"><svg><rect width="10" height="10" fill="red"/></svg><p class="x">A &amp; B</p></div>', {
      minifySVG: true,
      removeAttributeQuotes: true,
      decodeEntities: true,
      collapseWhitespace: true
    });
    assert.ok(mixed.includes('id=test'), 'Quotes removed in HTML before SVG');
    assert.ok(mixed.includes('class=x'), 'Quotes removed in HTML after SVG');
    assert.ok(mixed.includes('A & B'), 'Entities decoded in HTML after SVG');
  });

  test('SVG inside template', async () => {
    const result = await minify('<template><svg><rect width="10" height="10" fill="red"/></svg></template>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('<template>'), 'template wrapper preserved');
    assert.ok(result.includes('<svg>'), 'SVG inside template is optimized');
    assert.ok(result.includes('fill="red"'), 'fill attribute preserved');
  });

  test('continueOnMinifyError: false throws on SVGO error', async () => {
    // When `continueOnMinifyError` is false and SVGO encounters invalid XML
    // (e.g., from `removeOptionalTags` stripping `</p>` in `foreignObject`), it should throw
    await assert.rejects(
      () => minify('<svg><foreignObject width="100" height="100"><p>A</p><p>B</p></foreignObject></svg>', {
        minifySVG: true,
        removeOptionalTags: true,
        collapseWhitespace: true,
        continueOnMinifyError: false
      }),
      /Unexpected close tag/
    );

    // Valid SVG should not throw even with `continueOnMinifyError: false`
    const result = await minify('<svg><rect width="10" height="10" fill="red"/></svg>', {
      minifySVG: true,
      collapseWhitespace: true,
      continueOnMinifyError: false
    });
    assert.strictEqual(result, '<svg><path fill="red" d="M0 0h10v10H0z"/></svg>');
  });

  test('Cache produces consistent results', async () => {
    const opts = { minifySVG: true, collapseWhitespace: true };
    const input = '<svg><circle cx="10" cy="10" r="5"/></svg>';
    const r1 = await minify(input, opts);
    const r2 = await minify(input, opts);
    assert.strictEqual(r1, r2, 'Cached result should match first result');
  });

  test('SVG and MathML elements should not be removed by `removeEmptyElements`', async () => {
    // SVG elements define their content via attributes (like `d`, `cx`, `r`)
    // They should not be removed as "empty" even without text content

    // Path with `d` attribute should be preserved
    assert.strictEqual(
      await minify('<svg><path d="M10 10 L90 90"></path></svg>', { removeEmptyElements: true }),
      '<svg><path d="M10 10 L90 90"></path></svg>'
    );

    // Circle with dimension attributes should be preserved
    assert.strictEqual(
      await minify('<svg><circle cx="50" cy="50" r="40"></circle></svg>', { removeEmptyElements: true }),
      '<svg><circle cx="50" cy="50" r="40"></circle></svg>'
    );

    // Empty SVG container elements should also be preserved
    assert.strictEqual(
      await minify('<svg><g></g></svg>', { removeEmptyElements: true }),
      '<svg><g></g></svg>'
    );

    // SVG with nested elements should all be preserved
    assert.strictEqual(
      await minify('<svg viewBox="0 0 100 100"><g><path d="M0 0h100v100H0z"></path></g></svg>', { removeEmptyElements: true }),
      '<svg viewBox="0 0 100 100"><g><path d="M0 0h100v100H0z"></path></g></svg>'
    );

    // MathML elements should also be preserved
    assert.strictEqual(
      await minify('<math><mi></mi></math>', { removeEmptyElements: true }),
      '<math><mi></mi></math>'
    );

    // Regular HTML empty elements should still be removed
    assert.strictEqual(
      await minify('<p>Hello <span></span>world</p>', { removeEmptyElements: true }),
      '<p>Hello world</p>'
    );

    // Empty `div` should still be removed
    assert.strictEqual(
      await minify('<div></div><p>Content</p>', { removeEmptyElements: true }),
      '<p>Content</p>'
    );

    // `foreignObject` contains HTML content—empty HTML elements inside should be removed
    assert.strictEqual(
      await minify('<svg><foreignObject><div></div></foreignObject></svg>', { removeEmptyElements: true }),
      '<svg><foreignObject></foreignObject></svg>'
    );

    // `foreignObject` with mixed content—empty span removed, text preserved
    assert.strictEqual(
      await minify('<svg><foreignObject><p>Text <span></span>here</p></foreignObject></svg>', { removeEmptyElements: true }),
      '<svg><foreignObject><p>Text here</p></foreignObject></svg>'
    );

    // `foreignObject` with whitespace collapsing
    assert.strictEqual(
      await minify('<svg><foreignObject>   <div>   Hello   World   </div>   </foreignObject></svg>', { removeEmptyElements: true, collapseWhitespace: true }),
      '<svg><foreignObject><div>Hello World</div></foreignObject></svg>'
    );

    // SVG elements after `foreignObject` should still be preserved (context restored)
    assert.strictEqual(
      await minify('<svg><foreignObject><div></div></foreignObject><path d="M0 0"></path></svg>', { removeEmptyElements: true }),
      '<svg><foreignObject></foreignObject><path d="M0 0"></path></svg>'
    );

    // Deeply nested: SVG in HTML in `foreignObject` with whitespace—inner SVG elements preserved
    assert.strictEqual(
      await minify(`<svg>
  <foreignObject>
    <div>
      <svg>
        <path d="M0 0"></path>
      </svg>
    </div>
  </foreignObject>
</svg>`, { removeEmptyElements: true, collapseWhitespace: true }),
      '<svg><foreignObject><div><svg><path d="M0 0"></path></svg></div></foreignObject></svg>'
    );

    // MathML inside `foreignObject` with whitespace—empty `div` removed, MathML preserved
    assert.strictEqual(
      await minify(`<svg>
  <foreignObject>
    <div>   </div>
    <math>
      <mi>x</mi>
    </math>
  </foreignObject>
</svg>`, { removeEmptyElements: true, collapseWhitespace: true }),
      '<svg><foreignObject><math><mi>x</mi></math></foreignObject></svg>'
    );

    // Triple nested with content and whitespace
    assert.strictEqual(
      await minify(`<svg>
  <foreignObject>
    <p>   Outer   text   </p>
    <svg>
      <foreignObject>
        <span>   Inner   text   </span>
        <div>   </div>
      </foreignObject>
    </svg>
  </foreignObject>
</svg>`, { removeEmptyElements: true, collapseWhitespace: true }),
      '<svg><foreignObject><p>Outer text</p><svg><foreignObject><span>Inner text</span></foreignObject></svg></foreignObject></svg>'
    );
  });

  test('MathML `annotation-xml` with HTML content', async () => {
    // `annotation-xml` with `encoding="text/html"` contains HTML—empty elements should be removed
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><div></div></annotation-xml></math>', { removeEmptyElements: true }),
      '<math><annotation-xml encoding="text/html"></annotation-xml></math>'
    );

    // `annotation-xml` with `encoding="application/xhtml+xml"` also contains HTML
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="application/xhtml+xml"><span></span></annotation-xml></math>', { removeEmptyElements: true }),
      '<math><annotation-xml encoding="application/xhtml+xml"></annotation-xml></math>'
    );

    // `annotation-xml` with other encoding (e.g., MathML)—content should be preserved as foreign
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="application/mathml+xml"><mi></mi></annotation-xml></math>', { removeEmptyElements: true }),
      '<math><annotation-xml encoding="application/mathml+xml"><mi></mi></annotation-xml></math>'
    );

    // `annotation-xml` without encoding attribute—content preserved as foreign
    assert.strictEqual(
      await minify('<math><annotation-xml><mi></mi></annotation-xml></math>', { removeEmptyElements: true }),
      '<math><annotation-xml><mi></mi></annotation-xml></math>'
    );

    // `annotation-xml` with HTML content and whitespace collapsing
    assert.strictEqual(
      await minify(`<math>
  <annotation-xml encoding="text/html">
    <p>   Hello   <span></span>   World   </p>
  </annotation-xml>
</math>`, { removeEmptyElements: true, collapseWhitespace: true }),
      '<math><annotation-xml encoding="text/html"><p>Hello World</p></annotation-xml></math>'
    );

    // SVG inside `annotation-xml` HTML content—inner SVG preserved
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><div><svg><path d="M0 0"></path></svg></div></annotation-xml></math>', { removeEmptyElements: true }),
      '<math><annotation-xml encoding="text/html"><div><svg><path d="M0 0"></path></svg></div></annotation-xml></math>'
    );

    // Mixed: Empty HTML removed, SVG preserved
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><div></div><svg><rect x="0" y="0"></rect></svg></annotation-xml></math>', { removeEmptyElements: true }),
      '<math><annotation-xml encoding="text/html"><svg><rect x="0" y="0"></rect></svg></annotation-xml></math>'
    );
  });
});