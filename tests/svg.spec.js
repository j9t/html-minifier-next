import assert from 'node:assert';
import {describe, test} from 'node:test';
import { minify } from '../src/htmlminifier.js';

describe('SVG', () => {
  test('Numeric precision reduction', async () => {
    // Path data with excessive precision
    const input = '<svg><path d="M 0.00000000 0.00000000 L 10.50000000 20.30000000"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><path d="M0 0L10.5 20.3"/></svg>');

    // Custom precision
    const input2 = '<svg><path d="M 10.556 20.667"/></svg>';
    const output2 = await minify(input2, { minifySVG: { precision: 2 }, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><path d="M10.56 20.67"/></svg>');

    // Path with various numeric formats
    const complexPath = '<svg><path d="M 1.234567 2.345678 C 3.456789 4.567890 5.678901 6.789012 7.890123 8.901234"/></svg>';
    const complexOutput = await minify(complexPath, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(complexOutput, '<svg><path d="M1.235 2.346C3.457 4.568 5.679 6.789 7.89 8.901"/></svg>');
  });

  test('whitespace in numeric attributes', async () => {
    // `transform` attribute with excess whitespace
    const input = '<svg><rect transform="translate( 10 , 20 ) scale( 2 )"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><rect transform="translate(10,20) scale(2)"/></svg>');

    // `points` attribute
    const input2 = '<svg><polygon points="100, 10  40,  198 190, 78"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><polygon points="100,10 40,198 190,78"/></svg>');

    // `viewBox` attribute
    const input3 = '<svg viewBox="0 0  800  600 "><rect/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output3, '<svg viewBox="0 0 800 600"><rect/></svg>');
  });

  test('Color minification', async () => {
    // Hex color shortening
    const input = '<svg><rect fill="#000000"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><rect fill="#000"/></svg>');

    // `rgb()` to hex conversion
    const input2 = '<svg><rect fill="rgb(255,255,255)"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><rect fill="#fff"/></svg>');

    // `rgb()` with spaces to hex
    const input3 = '<svg><rect fill="rgb( 0 , 0 , 0 )"/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output3, '<svg><rect fill="#000"/></svg>');

    // Stroke color
    const input4 = '<svg><line stroke="#aabbcc" x1="0" y1="0" x2="1" y2="1"/></svg>';
    const output4 = await minify(input4, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output4, '<svg><line stroke="#abc" x1="0" y1="0" x2="1" y2="1"/></svg>');
  });

  test('Default attribute removal', async () => {
    // `fill-opacity` default
    const input = '<svg><rect fill-opacity="1"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><rect/></svg>');

    // `stroke-linecap` default
    const input2 = '<svg><line stroke-linecap="butt" x1="0" y1="0" x2="1" y2="1"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><line x1="0" y1="0" x2="1" y2="1"/></svg>');

    // Multiple default attributes
    const input3 = '<svg><rect fill-opacity="1" stroke-width="1" opacity="1"/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output3, '<svg><rect/></svg>');

    // Don’t remove when `removeDefaults` is false
    const input4 = '<svg><rect fill-opacity="1"/></svg>';
    const output4 = await minify(input4, { minifySVG: { removeDefaults: false }, collapseWhitespace: true });
    assert.strictEqual(output4, '<svg><rect fill-opacity="1"/></svg>');
  });

  test('Preserve case sensitivity', async () => {
    // SVG elements and attributes should preserve case
    const input = '<svg viewBox="0 0 100 100"><linearGradient id="grad"><stop offset="0"/></linearGradient></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg viewBox="0 0 100 100"><linearGradient id="grad"><stop offset="0"/></linearGradient></svg>');

    // Preserve camelCase attributes
    const input2 = '<svg><text textLength="100" lengthAdjust="spacing">Text</text></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><text textLength="100" lengthAdjust="spacing">Text</text></svg>');
  });

  test('Preserve self-closing slashes', async () => {
    // Self-closing tags should keep slashes within SVG
    const input = '<svg><path d="M 0 0"/><circle cx="5" cy="5" r="2"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><path d="M0 0"/><circle cx="5" cy="5" r="2"/></svg>');

    // HTML elements outside SVG should not have slashes
    const input2 = '<div><img src="test.jpg"/><svg><path d="M 0 0"/></svg><br/></div>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<div><img src="test.jpg"><svg><path d="M0 0"/></svg><br></div>');
  });

  test('Nested SVG elements', async () => {
    // All nested elements should be minified
    const input = '<svg><g><path d="M 0.000 0.000"/><g><circle cx="5.000" cy="5.000" r="2.000"/></g></g></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><g><path d="M0 0"/><g><circle cx="5" cy="5" r="2"/></g></g></svg>');
  });

  test('Combined with other options', async () => {
    // SVG minification with whitespace collapse
    const input = '<svg>\n  <path d="M 0.000 0.000"/>\n  <circle cx="5.000" cy="5.000" r="2.000"/>\n</svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><path d="M0 0"/><circle cx="5" cy="5" r="2"/></svg>');

    // SVG with comments
    const input2 = '<svg><!-- comment --><path d="M 0.000 0.000"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, removeComments: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><path d="M0 0"/></svg>');
  });

  test('Disabled', async () => {
    // When minifySVG is false, no SVG-specific optimizations
    const input = '<svg><path d="M 0.00000000 0.00000000"/></svg>';
    const output = await minify(input, { minifySVG: false, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><path d="M 0.00000000 0.00000000"/></svg>');

    // Standard HTML minification still applies (but not path space optimization)
    const input2 = '<svg>  <path d="M 0 0"/>  </svg>';
    const output2 = await minify(input2, { minifySVG: false, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><path d="M 0 0"/></svg>');
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

    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    const expected = '<html><body><svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 65.326 612 502.174" class="logo"><ellipse class="ground" cx="283.5" cy="487.5" rx="259" ry="80" fill="#000"/><polygon points="100,10 40,198 190,78 10,78 160,198" fill="#0f0"/><filter id="pictureFilter"><feGaussianBlur stdDeviation="15"/></filter></svg></body></html>';
    assert.strictEqual(output, expected);
  });

  test('Edge cases', async () => {
    // Empty path
    const input = '<svg><path d=""/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><path d=""/></svg>');

    // Negative numbers
    const input2 = '<svg><path d="M -10.500 -20.300 L -30.400 -40.500"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><path d="M-10.5-20.3L-30.4-40.5"/></svg>');

    // Scientific notation
    const input3 = '<svg><path d="M 1e-5 2e-3"/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    // 1e-5 (0.00001) rounds to 0.000 → "0", 2e-3 (0.002) rounds to 0.002
    assert.strictEqual(output3, '<svg><path d="M0 0.002"/></svg>');
  });

  test('Color minification disabled', async () => {
    const input = '<svg><rect fill="#aabbcc"/></svg>';
    const output = await minify(input, { minifySVG: { minifyColors: false }, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><rect fill="#aabbcc"/></svg>');
  });

  test('Mixed HTML and SVG', async () => {
    // HTML elements before and after SVG
    const input = '<div><p>Text</p><svg><path d="M 0.000 0.000"/></svg><span>More</span></div>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<div><p>Text</p><svg><path d="M0 0"/></svg><span>More</span></div>');

    // Multiple SVG elements
    const input2 = '<div><svg><circle cx="1.000" cy="1.000" r="1.000"/></svg><svg><rect x="2.000" y="2.000"/></svg></div>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<div><svg><circle cx="1" cy="1" r="1"/></svg><svg><rect x="2" y="2"/></svg></div>');
  });

  test('Named color conversion', async () => {
    // Red (#f00 → red)
    const input = '<svg><rect fill="#ff0000"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><rect fill="red"/></svg>');

    // Silver (#c0c0c0 → silver)
    const input2 = '<svg><rect fill="#c0c0c0"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><rect fill="silver"/></svg>');

    // Gray (#808080 → gray)
    const input3 = '<svg><rect fill="#808080"/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output3, '<svg><rect fill="gray"/></svg>');

    // Navy (#000080 → navy)
    const input4 = '<svg><line stroke="#000080" x1="0" y1="0" x2="1" y2="1"/></svg>';
    const output4 = await minify(input4, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output4, '<svg><line stroke="navy" x1="0" y1="0" x2="1" y2="1"/></svg>');

    // Teal (#008080 → teal)
    const input5 = '<svg><rect fill="#008080"/></svg>';
    const output5 = await minify(input5, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output5, '<svg><rect fill="teal"/></svg>');

    // Orange (#ffa500 → orange)
    const input6 = '<svg><rect fill="#ffa500"/></svg>';
    const output6 = await minify(input6, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output6, '<svg><rect fill="orange"/></svg>');

    // Green (#008000 → green)
    const input7 = '<svg><rect fill="#008000"/></svg>';
    const output7 = await minify(input7, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output7, '<svg><rect fill="green"/></svg>');

    // Purple (#800080 → purple)
    const input8 = '<svg><rect fill="#800080"/></svg>';
    const output8 = await minify(input8, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output8, '<svg><rect fill="purple"/></svg>');

    // Maroon (#800000 → maroon)
    const input9 = '<svg><rect fill="#800000"/></svg>';
    const output9 = await minify(input9, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output9, '<svg><rect fill="maroon"/></svg>');

    // Olive (#808000 → olive)
    const input10 = '<svg><rect fill="#808000"/></svg>';
    const output10 = await minify(input10, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output10, '<svg><rect fill="olive"/></svg>');

    // Black stays as #000 (shorter than "black")
    const input11 = '<svg><rect fill="#000000"/></svg>';
    const output11 = await minify(input11, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output11, '<svg><rect fill="#000"/></svg>');

    // White stays as #fff (shorter than "white")
    const input12 = '<svg><rect fill="#ffffff"/></svg>';
    const output12 = await minify(input12, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output12, '<svg><rect fill="#fff"/></svg>');
  });

  test('Extended default attributes', async () => {
    // Clipping and masking defaults
    const input = '<svg><rect clip-rule="nonzero" clip-path="none" mask="none"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><rect/></svg>');

    // Marker defaults
    const input2 = '<svg><path d="M0 0" marker-start="none" marker-mid="none" marker-end="none"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><path d="M0 0"/></svg>');

    // Filter default
    const input3 = '<svg><rect filter="none"/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output3, '<svg><rect/></svg>');

    // Color interpolation defaults
    const input4 = '<svg><rect color-interpolation="sRGB"/></svg>';
    const output4 = await minify(input4, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output4, '<svg><rect/></svg>');

    const input5 = '<svg><filter><feGaussianBlur color-interpolation-filters="linearRGB"/></filter></svg>';
    const output5 = await minify(input5, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output5, '<svg><filter><feGaussianBlur/></filter></svg>');
  });

  test('Identity transform removal', async () => {
    // `translate(0)`
    const input = '<svg><rect transform="translate(0)"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><rect/></svg>');

    // `translate(0,0)`
    const input2 = '<svg><rect transform="translate(0,0)"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><rect/></svg>');

    // `scale(1)`
    const input3 = '<svg><rect transform="scale(1)"/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output3, '<svg><rect/></svg>');

    // `scale(1,1)`
    const input4 = '<svg><rect transform="scale(1,1)"/></svg>';
    const output4 = await minify(input4, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output4, '<svg><rect/></svg>');

    // `rotate(0)`
    const input5 = '<svg><rect transform="rotate(0)"/></svg>';
    const output5 = await minify(input5, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output5, '<svg><rect/></svg>');

    // `skewX(0)`
    const input6 = '<svg><rect transform="skewX(0)"/></svg>';
    const output6 = await minify(input6, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output6, '<svg><rect/></svg>');

    // `skewY(0)`
    const input7 = '<svg><rect transform="skewY(0)"/></svg>';
    const output7 = await minify(input7, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output7, '<svg><rect/></svg>');

    // `matrix(1,0,0,1,0,0)`—identity matrix
    const input8 = '<svg><rect transform="matrix(1,0,0,1,0,0)"/></svg>';
    const output8 = await minify(input8, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output8, '<svg><rect/></svg>');

    // Non-identity transforms should be kept
    const input9 = '<svg><rect transform="translate(10,20)"/></svg>';
    const output9 = await minify(input9, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output9, '<svg><rect transform="translate(10,20)"/></svg>');

    // With whitespace variations
    const input10 = '<svg><rect transform="translate( 0 , 0 )"/></svg>';
    const output10 = await minify(input10, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output10, '<svg><rect/></svg>');
  });

  test('Path data space optimization', async () => {
    // Space after M command
    const input = '<svg><path d="M 10 20 L 30 40"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><path d="M10 20L30 40"/></svg>');

    // Negative numbers
    const input2 = '<svg><path d="M -10 -20 L -30 -40"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><path d="M-10-20L-30-40"/></svg>');

    // Complex path with multiple commands
    const input3 = '<svg><path d="M 0 0 L 10 10 H 20 V 30 C 40 50 60 70 80 90 Z"/></svg>';
    const output3 = await minify(input3, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output3, '<svg><path d="M0 0L10 10H20V30C40 50 60 70 80 90Z"/></svg>');

    // Lowercase commands
    const input4 = '<svg><path d="m 5 5 l 10 10 h 15"/></svg>';
    const output4 = await minify(input4, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output4, '<svg><path d="m5 5l10 10h15"/></svg>');

    // Arc commands
    const input5 = '<svg><path d="M 10 10 A 5 5 0 0 1 20 20"/></svg>';
    const output5 = await minify(input5, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output5, '<svg><path d="M10 10A5 5 0 0 1 20 20"/></svg>');
  });

  test('Combined new optimizations', async () => {
    // Path with spaces, named color, identity transform, and default attributes
    const input = '<svg><path d="M 10.000 20.000 L 30.000 40.000" fill="#808080" transform="translate(0)" fill-opacity="1"/></svg>';
    const output = await minify(input, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output, '<svg><path d="M10 20L30 40" fill="gray"/></svg>');

    // Multiple optimizations on one element
    const input2 = '<svg><rect fill="#008000" stroke="#000080" marker-start="none" transform="scale(1)" clip-path="none"/></svg>';
    const output2 = await minify(input2, { minifySVG: true, collapseWhitespace: true });
    assert.strictEqual(output2, '<svg><rect fill="green" stroke="navy"/></svg>');
  });
});