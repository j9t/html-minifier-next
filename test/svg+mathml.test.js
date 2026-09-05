import assert from 'node:assert';
import {describe, test} from 'node:test';
import { minify, getCacheStats } from '../src/htmlminifier.js';

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
    assert.ok(result.includes('textLength="100"'), 'camelCase attribute `textLength` preserved');
    assert.ok(result.includes('lengthAdjust="spacingAndGlyphs"'), 'camelCase attribute `lengthAdjust` preserved');
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

  test('A slash on a start tag closes the element in foreign content', async () => {
    assert.strictEqual(await minify('<svg><rect/><circle/></svg>'), '<svg><rect/><circle/></svg>');
    assert.strictEqual(await minify('<math><mspace/>a</math>'), '<math><mspace/>a</math>');

    // `svg` and `math` lead out of HTML themselves, so their own slash counts
    assert.strictEqual(await minify('<svg/>a'), '<svg/>a');
    assert.strictEqual(await minify('<math/>a'), '<math/>a');

    // `title` is SVG here, and holds markup rather than text
    assert.strictEqual(await minify('<svg><title/>a</title>b</svg>'), '<svg><title/>ab</svg>');

    // Integration points lead back into HTML, where the slash is ignored again
    assert.strictEqual(
      await minify('<svg><foreignObject><div/>a</div>b</foreignObject></svg>'),
      '<svg><foreignObject><div>a</div>b</foreignObject></svg>'
    );
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><div/>a</div>b</annotation-xml></math>'),
      '<math><annotation-xml encoding="text/html"><div>a</div>b</annotation-xml></math>'
    );
  });

  test('A unary foreign element leaves the context it opened', async () => {
    // `<svg/>` has no end tag to fall back to HTML on, so the start tag has to do it
    assert.strictEqual(await minify('<svg/><br/>x'), '<svg/><br>x');
    assert.strictEqual(await minify('<math/><br/>x'), '<math/><br>x');
    assert.strictEqual(await minify('<svg/><IMG SRC="a.PNG">'), '<svg/><img src="a.PNG">');
    assert.strictEqual(await minify('<div><svg/></div><br/>x'), '<div><svg/></div><br>x');

    // What follows is read as HTML raw text again, whitespace and all
    assert.strictEqual(
      await minify('<svg/><textarea> a </textarea>', { collapseWhitespace: true }),
      '<svg/><textarea> a </textarea>'
    );

    // A self-closed `<svg>` holds nothing for SVGO, and ends no block for it either
    assert.strictEqual(await minify('<svg/><br/>x', { minifySVG: true }), '<svg/><br>x');
    assert.strictEqual(await minify('<svg><svg/></svg><br/>x', { minifySVG: true }), '<svg><svg/></svg><br>x');
  });

  test('A self-closed integration point keeps the slash of the namespace it sits in', async () => {
    // `foreignObject` is an SVG element, however HTML what it holds is
    assert.strictEqual(
      await minify('<svg><foreignObject/><rect width="10" height="10"/></svg>'),
      '<svg><foreignObject/><rect width="10" height="10"/></svg>'
    );
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"/></math><br/>x'),
      '<math><annotation-xml encoding="text/html"/></math><br>x'
    );
    assert.strictEqual(await minify('<svg><foreignObject/></svg><br/>x'), '<svg><foreignObject/></svg><br>x');
  });

  test('`keepClosingSlash` reaches the HTML an integration point holds', async () => {
    // The parser reads the slash as closing the element wherever the option is on, so the
    // output has to keep it there too—otherwise `a` and `b` end up inside the `div`
    assert.strictEqual(
      await minify('<svg><foreignObject><div/>a</div>b</foreignObject></svg>', { keepClosingSlash: true }),
      '<svg><foreignObject><div/>ab</foreignObject></svg>'
    );
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><div/>a</div>b</annotation-xml></math>', { keepClosingSlash: true }),
      '<math><annotation-xml encoding="text/html"><div/>ab</annotation-xml></math>'
    );
    assert.strictEqual(
      await minify('<svg><foreignObject><br/>x</foreignObject></svg>', { keepClosingSlash: true }),
      '<svg><foreignObject><br/>x</foreignObject></svg>'
    );

    // With the option off, the HTML in there is written as HTML
    assert.strictEqual(
      await minify('<svg><foreignObject><div/>a</div>b<br/></foreignObject></svg>'),
      '<svg><foreignObject><div>a</div>b<br></foreignObject></svg>'
    );
  });

  test('HTML inside `foreignObject` is written as XML wherever SVGO reads it', async () => {
    /** @type {string[]} */
    const messages = [];
    const log = (/** @type {unknown} */ message) => messages.push(String(/** @type {Error} */ (message)?.message ?? message));
    const parseErrors = () => messages.filter((message) => message.includes('Unexpected close tag'));

    // A void element that closes nothing leaves the block invalid XML, which SVGO rejects—
    // and one rejected block costs the whole graphic its optimization
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><br>x</foreignObject></svg>', { minifySVG: true, log }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><br/>x</foreignObject></svg>'
    );
    assert.deepStrictEqual(parseErrors(), [], 'SVGO should never see markup it cannot parse');

    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><img src="a"></foreignObject></svg>', { minifySVG: true, log }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><img src="a"/></foreignObject></svg>'
    );
    assert.deepStrictEqual(parseErrors(), []);

    // What the block is holds through nested MathML, whose own HTML SVGO reads all the same
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><math><annotation-xml encoding="text/html"><br>x</annotation-xml></math></foreignObject></svg>', { minifySVG: true, log }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><math><annotation-xml encoding="text/html"><br/>x</annotation-xml></math></foreignObject></svg>'
    );
    assert.deepStrictEqual(parseErrors(), []);

    // The slash is there for SVGO, so it is written where SVGO reads and nowhere else
    assert.strictEqual(
      await minify('<svg><foreignObject><br>x</foreignObject></svg>'),
      '<svg><foreignObject><br>x</foreignObject></svg>'
    );
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><br>x</annotation-xml></math>', { minifySVG: true }),
      '<math><annotation-xml encoding="text/html"><br>x</annotation-xml></math>'
    );
    assert.strictEqual(
      await minify('<div><br></div><svg><foreignObject><br></foreignObject></svg><br>', { minifySVG: true }),
      '<div><br></div><svg><foreignObject><br/></foreignObject></svg><br>'
    );
  });

  test('Options that write markup no XML parser accepts stop at an SVG SVGO reads', async () => {
    // A valueless attribute is invalid XML, and costs the graphic its optimization
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><input type="checkbox" checked="checked"></foreignObject></svg>',
        { minifySVG: true, collapseBooleanAttributes: true }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><input checked="checked" type="checkbox"/></foreignObject></svg>'
    );

    // Without `minifySVG` nothing reads the block as XML, and the option applies as always
    assert.strictEqual(
      await minify('<svg><foreignObject><input type="checkbox" checked="checked"></foreignObject></svg>',
        { collapseBooleanAttributes: true }),
      '<svg><foreignObject><input type="checkbox" checked></foreignObject></svg>'
    );

    // MathML never reaches SVGO, so nothing is held back there
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><input type="checkbox" checked="checked"><p>a</p><p>b</p></annotation-xml></math>',
        { minifySVG: true, collapseBooleanAttributes: true, removeOptionalTags: true }),
      '<math><annotation-xml encoding="text/html"><input type="checkbox" checked><p>a<p>b</p></annotation-xml></math>'
    );

    // An end tag HTML lets the source leave out is written back wherever SVGO reads it
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><p>a<p>b</foreignObject></svg>', { minifySVG: true }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><p>a</p><p>b</p></foreignObject></svg>'
    );
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><ul><li>a<li>b</ul></foreignObject></svg>', { minifySVG: true }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><ul><li>a</li><li>b</li></ul></foreignObject></svg>'
    );

    // Outside the block the option stands as it is, and writes no tag the source left out
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/></svg><div><p>a<p>b</div>', { minifySVG: true }),
      '<svg><path d="M0 0h10v10H0z"/></svg><div><p>a<p>b</div>'
    );

    // A unary element written without a slash anywhere in the block, not only in `foreignObject`
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><math><mspace/></math></foreignObject></svg>', { minifySVG: true }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><math><mspace/></math></foreignObject></svg>'
    );
  });

  test('Attribute values keep their quotes wherever SVGO reads them', async () => {
    // An unquoted value is valid HTML the source may well be written in, and invalid XML
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><p class=a>x</p></foreignObject></svg>', { minifySVG: true }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><p class="a">x</p></foreignObject></svg>'
    );

    // Nested MathML does not lead out of the block SVGO reads
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject><math><annotation-xml encoding="text/html"><p class=a>x</p></annotation-xml></math></foreignObject></svg>', { minifySVG: true }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject><math><annotation-xml encoding="text/html"><p class="a">x</p></annotation-xml></math></foreignObject></svg>'
    );

    // Outside an SVG, and inside one no SVGO reads, the source’s own style stands
    assert.strictEqual(await minify('<p class=a>x</p>', { minifySVG: true }), '<p class=a>x</p>');
    assert.strictEqual(
      await minify('<svg><foreignObject><p class=a>x</p></foreignObject></svg>'),
      '<svg><foreignObject><p class=a>x</p></foreignObject></svg>'
    );
  });

  test('Preserve `viewBox`', async () => {
    // SVGO v4 preserves `viewBox` by default
    const result = await minify('<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('viewBox="0 0 100 100"'), '`viewBox` should be preserved');
  });

  test('Preserve `title` element', async () => {
    // SVGO v4 preserves `<title>` by default (accessibility)
    const result = await minify('<svg><title>My SVG</title><rect width="100" height="100"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('<title>My SVG</title>'), '`title` should be preserved');
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
    assert.ok(result.includes('viewBox="0 65.326 612 502.174"'), '`viewBox` preserved');
    assert.ok(result.includes('class="logo"'), '`class` preserved');

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
    // SVGO fails on the bare `&` the text carries; `continueOnMinifyError` keeps the unoptimized SVG
    assert.strictEqual(
      await minify('<svg><text>a & b</text><rect width="10" height="10"/></svg>', {
        minifySVG: true,
        collapseWhitespace: true,
        continueOnMinifyError: true
      }),
      '<svg><text>a & b</text><rect width="10" height="10"/></svg>'
    );
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

  test('SVG with `style` element', async () => {
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

  test('SVG with `namespace` attributes', async () => {
    // `xlink:href` should be preserved
    const result = await minify('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#icon"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('xlink:href="#icon"'), '`xlink:href` should be preserved');
    assert.ok(result.includes('xmlns:xlink'), '`xlink` namespace declaration should be preserved');
  });

  test('SVG with `defs` and `use`', async () => {
    // SVGO optimizes IDs (e.g., "c" → "a") but preserves the defs/use pattern
    const result = await minify('<svg><defs><circle id="c" cx="5" cy="5" r="5"/></defs><use href="#c"/></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('<defs>'), '`defs` should be preserved');
    assert.ok(result.includes('<use'), '`use` should be preserved');
    assert.ok(result.includes('href="#'), '`href` reference should be preserved');
  });

  test('SVG with `foreignObject`', async () => {
    // `foreignObject` with HTML content should be preserved
    const result = await minify('<svg><foreignObject width="100" height="100"><p>Hello</p></foreignObject></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(result.includes('foreignObject'), '`foreignObject` should be preserved');
    assert.ok(result.includes('Hello'), 'HTML content inside `foreignObject` should be preserved');

    // `foreignObject` with HTML entities
    const withEntities = await minify('<svg><foreignObject width="100" height="100"><p>A &amp; B</p></foreignObject></svg>', { minifySVG: true, collapseWhitespace: true });
    assert.ok(withEntities.includes('A &amp; B'), 'Entities inside `foreignObject` should be preserved');
  });

  test('`caseSensitive` is respected for HTML inside `foreignObject` and `annotation-xml`', async () => {
    // With `caseSensitive`, the HTML context’s name function is preserved across
    // the namespace transition, so mixed-case names inside `foreignObject` keep their case
    assert.strictEqual(
      await minify('<svg><foreignObject><myElement mixedCaseAttribute="value">Text</myElement></foreignObject></svg>', { caseSensitive: true }),
      '<svg><foreignObject><myElement mixedCaseAttribute="value">Text</myElement></foreignObject></svg>'
    );

    // Same for HTML inside MathML `annotation-xml`
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><myElement>Text</myElement></annotation-xml></math>', { caseSensitive: true }),
      '<math><annotation-xml encoding="text/html"><myElement>Text</myElement></annotation-xml></math>'
    );

    // Nested namespace transitions inherit the preserved name function
    assert.strictEqual(
      await minify('<svg><foreignObject><div><svg viewBox="0 0 1 1"><foreignObject><myElement>Text</myElement></foreignObject></svg></div></foreignObject></svg>', { caseSensitive: true }),
      '<svg><foreignObject><div><svg viewBox="0 0 1 1"><foreignObject><myElement>Text</myElement></foreignObject></svg></div></foreignObject></svg>'
    );

    // Without `caseSensitive`, HTML inside `foreignObject` is lower-cased
    assert.strictEqual(
      await minify('<svg><foreignObject><myElement mixedCaseAttribute="value">Text</myElement></foreignObject></svg>', {}),
      '<svg><foreignObject><myelement mixedcaseattribute="value">Text</myelement></foreignObject></svg>'
    );
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

    // Redundant attribute removal inside `foreignObject` (the `input` closes itself for SVGO)
    assert.strictEqual(
      await minify('<svg><foreignObject width="100" height="100"><form method="get"><input type="text"></form></foreignObject></svg>', { minifySVG: true, removeRedundantAttributes: true, collapseWhitespace: true }),
      '<svg><foreignObject width="100" height="100"><form><input/></form></foreignObject></svg>'
    );
  });

  test('SVG with `foreignObject` and `removeOptionalTags`', async () => {
    // An omitted `</p>` would leave the block invalid XML, which costs the whole graphic its
    // optimization, so the end tags stay wherever SVGO reads them
    assert.strictEqual(
      await minify('<svg><rect width="10" height="10"/><foreignObject width="100" height="100"><p>Text</p><p>More</p></foreignObject></svg>', {
        minifySVG: true,
        removeOptionalTags: true,
        collapseWhitespace: true
      }),
      '<svg><path d="M0 0h10v10H0z"/><foreignObject width="100" height="100"><p>Text</p><p>More</p></foreignObject></svg>'
    );

    // Outside the SVG the option applies as it always does
    assert.strictEqual(
      await minify('<ul><li>a</li></ul><svg><rect width="10" height="10"/></svg><p>b</p>', { minifySVG: true, removeOptionalTags: true }),
      '<ul><li>a</ul><svg><path d="M0 0h10v10H0z"/></svg><p>b'
    );

    // Without `minifySVG` nothing reads the block as XML, and the option applies throughout
    assert.strictEqual(
      await minify('<svg><foreignObject width="100" height="100"><p>Text</p><p>More</p></foreignObject></svg>', {
        removeOptionalTags: true,
        collapseWhitespace: true
      }),
      '<svg><foreignObject width="100" height="100"><p>Text<p>More</foreignObject></svg>'
    );
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
    const tagWhitespace = await minify('<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>', { minifySVG: true, removeTagWhitespace: true, collapseWhitespace: true });
    assert.ok(!tagWhitespace.includes('width="100"height'), 'Whitespace between SVG attributes preserved');
  });

  test('`removeAttributeQuotes` applies inside SVG when `minifySVG` is disabled', async () => {
    // When `minifySVG` is false, SVG is parsed by the HTML parser—not an XML parser—
    // so unquoted attributes are valid and `removeAttributeQuotes` should work normally
    const result = await minify('<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="red"/></svg>', { minifySVG: false, removeAttributeQuotes: true, collapseWhitespace: true });
    assert.ok(result.includes('width=100'), 'Simple numeric SVG attribute quotes removed when `minifySVG` is off');
    assert.ok(result.includes('fill=red'), 'Simple string SVG attribute quotes removed when `minifySVG` is off');
  });

  test('`removeAttributeQuotes` applies inside MathML', async () => {
    // MathML is never processed by SVGO, so `removeAttributeQuotes` is never restricted
    // inside MathML regardless of the `minifySVG` setting
    const result = await minify('<math display="block"><mi mathvariant="normal" id="x">x</mi></math>', { removeAttributeQuotes: true, collapseWhitespace: true });
    assert.ok(result.includes('display=block'), 'Simple string MathML attribute quotes removed');
    assert.ok(result.includes('mathvariant=normal'), 'MathML `mathvariant` attribute quotes removed');
    assert.ok(result.includes('id=x'), 'MathML `id` attribute quotes removed');
  });

  test('`decodeEntities` applies inside SVG when `minifySVG` is disabled', async () => {
    // When `minifySVG` is false, SVGO is not invoked, so bare `&` is not a problem
    const result = await minify('<svg><text>A &amp; B</text></svg>', { minifySVG: false, decodeEntities: true, collapseWhitespace: true });
    assert.ok(result.includes('A & B'), 'Entities decoded inside SVG when `minifySVG` is off');
  });

  test('`decodeEntities` applies inside MathML', async () => {
    // MathML is never processed by SVGO, so `decodeEntities` is never restricted inside MathML
    const result = await minify('<math><mi>A &amp; B</mi></math>', { decodeEntities: true, collapseWhitespace: true });
    assert.ok(result.includes('A & B'), 'Entities decoded inside MathML');
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
    assert.ok(result.includes('<template>'), '`template` wrapper preserved');
    assert.ok(result.includes('<svg>'), 'SVG inside `template` is optimized');
    assert.ok(result.includes('fill="red"'), '`fill` attribute preserved');
  });

  test('`continueOnMinifyError: false` throws on SVGO error', async () => {
    // When `continueOnMinifyError` is false and SVGO encounters invalid XML
    // (here a bare `&`), it should throw
    await assert.rejects(
      () => minify('<svg><text>a & b</text><rect width="10" height="10"/></svg>', {
        minifySVG: true,
        collapseWhitespace: true,
        continueOnMinifyError: false
      }),
      /Invalid character in entity name/
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

  test('Custom SVG cache size', async () => {
    const input = '<svg><circle cx="10" cy="10" r="5" fill="red"/></svg>';
    const result = await minify(input, { minifySVG: true, cacheSVG: 100 });
    assert.strictEqual(result, await minify(input, { minifySVG: true }), 'SVG should minify the same with a custom cache size');
  });

  test('Large SVG inputs with identical first/last 50 chars are not confused in cache', async () => {
    const first50 = '<svg xmlns="http://www.w3.org/2000/svg" width="10"'; // exactly 50 chars
    const last50 = '<!-- ' + 'z'.repeat(35) + ' --></svg>'; // exactly 50 chars
    const filler = '<!-- ' + 'f'.repeat(1970) + ' -->'; // stripped by SVGO
    assert.strictEqual(first50.length, 50, '`first50` must be exactly 50 chars');
    assert.strictEqual(last50.length, 50, '`last50` must be exactly 50 chars');

    // Both middles are 34 chars—inputs are the same total length
    const svg1 = first50 + ' height="10"><rect fill="#f00"/>' + filler + last50;
    const svg2 = first50 + ' height="10"><rect fill="#0f0"/>' + filler + last50;

    assert.ok(svg1.length > 2048, 'Input must exceed the 2048-char threshold');
    assert.strictEqual(svg1.length, svg2.length, 'Inputs must be the same length to guarantee fingerprint collision');
    assert.strictEqual(svg1.slice(0, 50), svg2.slice(0, 50), 'First 50 chars must be identical');
    assert.strictEqual(svg1.slice(-50), svg2.slice(-50), 'Last 50 chars must be identical');

    const result1 = await minify(svg1, { minifySVG: true });
    const result2 = await minify(svg2, { minifySVG: true });

    assert.notStrictEqual(result1, result2, 'Different large SVG inputs must not share a cache entry');
    assert.ok(result1.includes('#f00') || result1.includes('red'), 'First result should contain the correct fill');
    assert.ok(result2.includes('#0f0') || result2.includes('lime'), 'Second result should contain the correct fill');
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

    // A repeated attribute is dropped after the first, so the first `encoding` decides
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/plain" encoding="text/html"><DIV>x</DIV></annotation-xml></math>', {}),
      '<math><annotation-xml encoding="text/plain"><DIV>x</DIV></annotation-xml></math>'
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

  test('Escapable raw text in SVG and MathML', async () => {
    // `textarea` and `title` hold text rather than markup, but that is an HTML rule: In SVG
    // and MathML they are ordinary elements, until an integration point leads back into HTML
    // https://html.spec.whatwg.org/multipage/parsing.html#html-integration-point
    const options = { removeOptionalTags: true };
    let input;

    // Ordinary elements here, so an optional end tag inside them is one
    assert.strictEqual(await minify('<svg><title><p>a</p></title></svg>', options), '<svg><title><p>a</title></svg>');
    assert.strictEqual(await minify('<svg><desc><p>a</p></desc></svg>', options), '<svg><desc><p>a</desc></svg>');
    assert.strictEqual(await minify('<math><title><p>a</p></title></math>', options), '<math><title><p>a</title></math>');

    // An element that is no integration point keeps its content foreign
    assert.strictEqual(await minify('<svg><g><textarea><p>a</p></textarea></g></svg>', options), '<svg><g><textarea><p>a</textarea></g></svg>');

    // What an integration point holds is HTML again, so raw text inside one is raw text—note
    // that the element itself does not decide this: `<svg><title>` is SVG, its content is not
    for (const [open, close] of [
      ['<svg><foreignObject>', '</foreignObject></svg>'],
      ['<svg><desc>', '</desc></svg>'],
      ['<svg><title>', '</title></svg>'],
      ['<math><mtext>', '</mtext></math>'],
      ['<math><mi>', '</mi></math>']
    ]) {
      input = `${open}<textarea><p>a</p></textarea>${close}`;
      assert.strictEqual(await minify(input, options), input, open);
    }

    // `annotation-xml` is one only where its `encoding` says it holds HTML
    for (const encoding of ['text/html', 'application/xhtml+xml', 'TEXT/HTML']) {
      input = `<math><annotation-xml encoding="${encoding}"><title><p>a</p></title></annotation-xml></math>`;
      assert.strictEqual(await minify(input, options), input, encoding);
    }

    // A name counts only in the namespace it belongs to, so neither set reaches into the other
    for (const [open, close] of [
      ['<math><title>', '</title></math>'],
      ['<math><desc>', '</desc></math>'],
      ['<math><foreignObject>', '</foreignObject></math>'],
      ['<svg><mtext>', '</mtext></svg>'],
      ['<svg><mi>', '</mi></svg>'],
      ['<svg><annotation-xml encoding="text/html">', '</annotation-xml></svg>']
    ]) {
      assert.strictEqual(
        await minify(`${open}<textarea><p>a</p></textarea>${close}`, options),
        `${open}<textarea><p>a</textarea>${close}`,
        open
      );
    }

    // Leaving an integration point enters the namespace around it again
    input = '<svg><foreignObject><math><title><textarea><p>a</p></textarea></title></math></foreignObject></svg>';
    assert.strictEqual(await minify(input, options), '<svg><foreignObject><math><title><textarea><p>a</textarea></title></math></foreignObject></svg>');
    input = '<svg><foreignObject><svg><title><p>a</p></title></svg></foreignObject></svg>';
    assert.strictEqual(await minify(input, options), '<svg><foreignObject><svg><title><p>a</title></svg></foreignObject></svg>');

    // With any other encoding, and with none, its content stays MathML, where `title` holds markup
    assert.strictEqual(
      await minify('<math><annotation-xml><title><p>a</p></title></annotation-xml></math>', options),
      '<math><annotation-xml><title><p>a</title></annotation-xml></math>'
    );
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/plain"><title><p>a</p></title></annotation-xml></math>', options),
      '<math><annotation-xml encoding="text/plain"><title><p>a</title></annotation-xml></math>'
    );
  });

  test('Raw text in SVG and MathML', async () => {
    // `iframe` and `xmp` hold text as HTML elements, and are ordinary elements anywhere else
    const options = { removeOptionalTags: true };
    let input;

    for (const tag of ['iframe', 'xmp']) {
      // Foreign content here, so an optional end tag inside them is one
      assert.strictEqual(await minify(`<svg><${tag}><p>a</p></${tag}></svg>`, options), `<svg><${tag}><p>a</${tag}></svg>`, tag);
      assert.strictEqual(await minify(`<math><${tag}><p>a</p></${tag}></math>`, options), `<math><${tag}><p>a</${tag}></math>`, tag);

      // What an integration point holds is HTML again, so the same element holds text there
      input = `<svg><foreignObject><${tag}><p>a</p></${tag}></foreignObject></svg>`;
      assert.strictEqual(await minify(input, options), input, tag);
    }

    // `script` and `style` are the exception: They hold text wherever they sit
    for (const held of ['<svg><script><p>a</p></script></svg>', '<svg><style><p>a</p></style></svg>', '<math><script><p>a</p></script></math>']) {
      assert.strictEqual(await minify(held, options), held, held);
    }
  });

  test('`decodeEntities` reads raw text by namespace, not by name', async () => {
    // As an HTML element, `title` and `textarea` hold text that ends at their own end tag,
    // so only that one `<` needs escaping. In foreign content the same element holds markup,
    // and leaving the rest unescaped would turn text into elements
    const options = { decodeEntities: true };
    for (const tag of ['title', 'textarea']) {
      assert.strictEqual(await minify(`<svg><${tag}>&lt;b&gt;</${tag}></svg>`, options), `<svg><${tag}>&lt;b></${tag}></svg>`, tag);
      assert.strictEqual(await minify(`<math><${tag}>&lt;b&gt;</${tag}></math>`, options), `<math><${tag}>&lt;b></${tag}></math>`, tag);

      // What an integration point holds is HTML again, where the element holds text once more
      assert.strictEqual(
        await minify(`<svg><foreignObject><${tag}>&lt;b&gt;</${tag}></foreignObject></svg>`, options),
        `<svg><foreignObject><${tag}><b></${tag}></foreignObject></svg>`,
        tag
      );
    }

    // Raw text keeps its character references, and `iframe` holds raw text as an HTML element
    // alone—in foreign content it is an element like any other, whose text resolves them
    assert.strictEqual(await minify('<iframe>a&amp;b</iframe>', options), '<iframe>a&amp;b</iframe>');
    assert.strictEqual(await minify('<svg><iframe>a&amp;b</iframe></svg>', options), '<svg><iframe>a&b</iframe></svg>');


    // `annotation-xml` holds HTML only where its `encoding` says so, and a repeated attribute
    // is dropped after the first—so the first one decides it, whatever stands behind it
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/html"><title>&lt;b&gt;</title></annotation-xml></math>', options),
      '<math><annotation-xml encoding="text/html"><title><b></title></annotation-xml></math>'
    );
    assert.strictEqual(
      await minify('<math><annotation-xml encoding="text/plain" encoding="text/html"><title>&lt;b&gt;</title></annotation-xml></math>', options),
      '<math><annotation-xml encoding="text/plain"><title>&lt;b></title></annotation-xml></math>'
    );

    // `script` and `style` hold text wherever they sit, so theirs are kept in either place
    assert.strictEqual(await minify('<script>a&amp;b</script>', options), '<script>a&amp;b</script>');
    assert.strictEqual(await minify('<svg><script>a&amp;b</script></svg>', options), '<svg><script>a&amp;b</script></svg>');
    assert.strictEqual(await minify('<svg><style>a&amp;b</style></svg>', options), '<svg><style>a&amp;b</style></svg>');
  });

  test('The namespace an element sits in stays cheap to read', async () => {
    // Reading it off the stack costs as much as the stack is deep, for every element whose
    // content is text—which a deep document turns quadratic, minutes at this size
    const benign = '<div>a</div>'.repeat(46000);
    const input = '<div>'.repeat(80000) + '<textarea>a</textarea>'.repeat(8000);

    const startBaseline = Date.now();
    await minify(benign);
    const baseline = Date.now() - startBaseline;

    const start = Date.now();
    await minify(input);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < Math.max(baseline * 20, 2000), `Expected the namespace to be kept, not walked, took ${elapsed}ms (${baseline}ms baseline)`);
  });

  test('Preset normalization: `minifySVG` override', async () => {
    // Regression: `minifySVG: true` from a preset was not normalized to a function
    // Verify that the option is actually applied (SVGO converts `rect` to `path`) and
    // that passing `minifySVG: false` overrides the preset, leaving the SVG unchanged
    const input = '<svg><rect width="100" height="100" fill="red"/></svg>';
    const withSVGMin = await minify(input, { preset: 'comprehensive' });
    const withSVGOff = await minify(input, { preset: 'comprehensive', minifySVG: false });
    assert.ok(withSVGMin.includes('<path'), 'SVGO should convert `rect` to `path` when `minifySVG` is enabled');
    assert.ok(!withSVGOff.includes('<path'), '`rect` should be preserved when `minifySVG` is overridden to false');
  });

  test('Oversized SVG input (>1 MB) is minified normally but never cached', async () => {
    const bigComment = '<!-- ' + 'x'.repeat(1024 * 1024) + ' -->';
    const input = `<svg><circle cx="10" cy="10" r="5"/>${bigComment}</svg>`;

    const before = getCacheStats().svg;
    const result1 = await minify(input, { minifySVG: true });
    const result2 = await minify(input, { minifySVG: true });
    const after = getCacheStats().svg;

    assert.strictEqual(result1, result2, 'Result should be identical whether or not it was cached');
    assert.ok(result1.includes('<circle'), 'SVG should still be minified');
    assert.strictEqual(after.gets, before.gets, 'Oversized input should never reach `cache.get()`');
    assert.strictEqual(after.size, before.size, 'Oversized input should never be stored in the cache');
  });

  test('SVG: Invalid engine throws error', async () => {
    const input = '<svg><rect width="10" height="10"/></svg>';

    await assert.rejects(
      async () => await minify(input, { minifySVG: { engine: 'invalid' } }),
      /Unsupported SVG minifier engine/,
      'Should throw error for invalid engine'
    );
  });

  test('SVG: Explicit `svgo` engine matches the default', async () => {
    const input = '<svg><rect width="10" height="10"/></svg>';

    assert.strictEqual(
      await minify(input, { minifySVG: { engine: 'svgo' } }),
      await minify(input, { minifySVG: true }),
      'Naming the default engine should change nothing'
    );
  });

  test('SVG: OXVG engine minifies', async () => {
    const input = '<svg><rect width="10" height="10"/></svg>';
    const result = await minify(input, { minifySVG: { engine: 'oxvg' } });

    assert.ok(result.includes('<path'), 'OXVG should convert `rect` to `path`');
  });

  test('SVG: Engine field is case-insensitive', async () => {
    const input = '<svg><rect width="10" height="10"/></svg>';

    const result1 = await minify(input, { minifySVG: { engine: 'oxvg' } });
    const result2 = await minify(input, { minifySVG: { engine: 'OXVG' } });

    assert.strictEqual(result1, result2, 'Case variations should produce same result');
  });

  test('SVG: Engine takes part in the cache key', async () => {
    // Same input under both engines—one must not serve the other’s cached result
    const input = '<svg><rect width="10" height="10"/></svg>';

    const withSvgo = await minify(input, { minifySVG: { engine: 'svgo' } });
    const withOxvg = await minify(input, { minifySVG: { engine: 'oxvg' } });

    assert.notStrictEqual(withSvgo, withOxvg, 'Engines differ on path close (`z` vs `Z`)');
    assert.strictEqual(
      await minify(input, { minifySVG: { engine: 'svgo' } }),
      withSvgo,
      'SVGO result should survive an intervening OXVG run'
    );
  });

  test('SVG: OXVG engine refuses SVGO options', async () => {
    const input = '<svg><rect width="10" height="10"/></svg>';

    for (const svgoOption of [{ plugins: ['removeComments'] }, { floatPrecision: 1 }, { multipass: true }]) {
      await assert.rejects(
        async () => await minify(input, { minifySVG: { engine: 'oxvg', ...svgoOption } }),
        /does not accept SVGO options/,
        `Should reject ${Object.keys(svgoOption)[0]}`
      );
    }
  });

  test('SVG: OXVG engine accepts its own jobs, and SVGO keeps its options', async () => {
    const input = '<svg><!--c--><rect width="10" height="10"/></svg>';

    const jobs = await minify(input, { minifySVG: { engine: 'oxvg', removeComments: {} } });
    assert.ok(!jobs.includes('<!--c-->'), 'OXVG should run the job it was given');

    // The guard is scoped to OXVG—SVGO’s own configuration must pass through
    const svgo = await minify(input, { minifySVG: { engine: 'svgo', plugins: [{ name: 'preset-default' }] } });
    assert.ok(svgo.includes('<path'), 'SVGO should still accept a plugin pipeline');
  });
});