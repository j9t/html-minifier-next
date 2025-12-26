import assert from 'node:assert';
import {describe, test} from 'node:test';
import { minify } from '../src/htmlminifier.js';

describe('SVG', () => {
  test('Numeric precision reduction', async () => {
    // Path data with excessive precision
    assert.strictEqual(
      await minify('<svg><path d="M 0.00000000 0.00000000 L 10.50000000 20.30000000"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M0 0L10.5 20.3"/></svg>'
    );

    // Custom precision
    assert.strictEqual(
      await minify('<svg><path d="M 10.556 20.667"/></svg>', { minifySVG: { precision: 2 }, collapseWhitespace: true }),
      '<svg><path d="M10.56 20.67"/></svg>'
    );

    // Path with various numeric formats
    assert.strictEqual(
      await minify('<svg><path d="M 1.234567 2.345678 C 3.456789 4.567890 5.678901 6.789012 7.890123 8.901234"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M1.235 2.346C3.457 4.568 5.679 6.789 7.89 8.901"/></svg>'
    );
  });

  test('whitespace in numeric attributes', async () => {
    // `transform` attribute with excess whitespace
    assert.strictEqual(
      await minify('<svg><rect transform="translate( 10 , 20 ) scale( 2 )"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect transform="translate(10,20) scale(2)"/></svg>'
    );

    // `points` attribute
    assert.strictEqual(
      await minify('<svg><polygon points="100, 10  40,  198 190, 78"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><polygon points="100,10 40,198 190,78"/></svg>'
    );

    // `viewBox` attribute
    assert.strictEqual(
      await minify('<svg viewBox="0 0  800  600 "><rect/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg viewBox="0 0 800 600"><rect/></svg>'
    );
  });

  test('Color minification', async () => {
    // Hex color shortening
    assert.strictEqual(
      await minify('<svg><rect fill="#000000"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="#000"/></svg>'
    );

    // `rgb()` to hex conversion
    assert.strictEqual(
      await minify('<svg><rect fill="rgb(255,255,255)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="#fff"/></svg>'
    );

    // `rgb()` with spaces to hex
    assert.strictEqual(
      await minify('<svg><rect fill="rgb( 0 , 0 , 0 )"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="#000"/></svg>'
    );

    // Stroke color
    assert.strictEqual(
      await minify('<svg><line stroke="#aabbcc" x1="0" y1="0" x2="1" y2="1"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><line stroke="#abc" x1="0" y1="0" x2="1" y2="1"/></svg>'
    );
  });

  test('Default attribute removal', async () => {
    // `fill-opacity` default
    assert.strictEqual(
      await minify('<svg><rect fill-opacity="1"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>'
    );

    // `stroke-linecap` default
    assert.strictEqual(
      await minify('<svg><line stroke-linecap="butt" x1="0" y1="0" x2="1" y2="1"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><line x1="0" y1="0" x2="1" y2="1"/></svg>'
    );

    // Multiple default attributes
    assert.strictEqual(
      await minify('<svg><rect fill-opacity="1" stroke-width="1" opacity="1"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>'
    );

    // Don’t remove when `removeDefaults` is false
    assert.strictEqual(
      await minify('<svg><rect fill-opacity="1"/></svg>', { minifySVG: { removeDefaults: false }, collapseWhitespace: true }),
      '<svg><rect fill-opacity="1"/></svg>'
    );
  });

  test('Preserve case sensitivity', async () => {
    // SVG elements and attributes should preserve case
    assert.strictEqual(
      await minify('<svg viewBox="0 0 100 100"><linearGradient id="grad"><stop offset="0"/></linearGradient></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg viewBox="0 0 100 100"><linearGradient id="grad"><stop offset="0"/></linearGradient></svg>'
    );

    // Preserve camelCase attributes
    assert.strictEqual(
      await minify('<svg><text textLength="100" lengthAdjust="spacing">Text</text></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><text textLength="100" lengthAdjust="spacing">Text</text></svg>'
    );
  });

  test('Preserve self-closing slashes', async () => {
    // Self-closing tags should keep slashes within SVG
    assert.strictEqual(
      await minify('<svg><path d="M 0 0"/><circle cx="5" cy="5" r="2"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M0 0"/><circle cx="5" cy="5" r="2"/></svg>'
    );

    // HTML elements outside SVG should not have slashes
    assert.strictEqual(
      await minify('<div><img src="test.jpg"/><svg><path d="M 0 0"/></svg><br/></div>', { minifySVG: true, collapseWhitespace: true }),
      '<div><img src="test.jpg"><svg><path d="M0 0"/></svg><br></div>'
    );
  });

  test('Nested SVG elements', async () => {
    assert.strictEqual(
      await minify('<svg><g><path d="M 0.000 0.000"/><g><circle cx="5.000" cy="5.000" r="2.000"/></g></g></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><g><path d="M0 0"/><g><circle cx="5" cy="5" r="2"/></g></g></svg>'
    );
  });

  test('Combined with other options', async () => {
    // SVG minification with whitespace collapse
    assert.strictEqual(
      await minify('<svg>\n  <path d="M 0.000 0.000"/>\n  <circle cx="5.000" cy="5.000" r="2.000"/>\n</svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M0 0"/><circle cx="5" cy="5" r="2"/></svg>'
    );

    // SVG with comments
    assert.strictEqual(
      await minify('<svg><!-- comment --><path d="M 0.000 0.000"/></svg>', { minifySVG: true, removeComments: true, collapseWhitespace: true }),
      '<svg><path d="M0 0"/></svg>'
    );
  });

  test('Disabled', async () => {
    // When minifySVG is false, no SVG-specific optimizations
    assert.strictEqual(
      await minify('<svg><path d="M 0.00000000 0.00000000"/></svg>', { minifySVG: false, collapseWhitespace: true }),
      '<svg><path d="M 0.00000000 0.00000000"/></svg>'
    );

    // Standard HTML minification still applies (but not path space optimization)
    assert.strictEqual(
      await minify('<svg>  <path d="M 0 0"/>  </svg>', { minifySVG: false, collapseWhitespace: true }),
      '<svg><path d="M 0 0"/></svg>'
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

    const expected = '<html><body><svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 65.326 612 502.174" class="logo"><ellipse class="ground" cx="283.5" cy="487.5" rx="259" ry="80" fill="#000"/><polygon points="100,10 40,198 190,78 10,78 160,198" fill="#0f0"/><filter id="pictureFilter"><feGaussianBlur stdDeviation="15"/></filter></svg></body></html>';

    assert.strictEqual(
      await minify(input, { minifySVG: true, collapseWhitespace: true }),
      expected
    );
  });

  test('Edge cases', async () => {
    // Empty path
    assert.strictEqual(
      await minify('<svg><path d=""/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d=""/></svg>'
    );

    // Negative numbers
    assert.strictEqual(
      await minify('<svg><path d="M -10.500 -20.300 L -30.400 -40.500"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M-10.5-20.3L-30.4-40.5"/></svg>'
    );

    // Scientific notation (1e-5 rounds to 0, 2e-3 = 0.002)
    assert.strictEqual(
      await minify('<svg><path d="M 1e-5 2e-3"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M0 0.002"/></svg>'
    );
  });

  test('Color minification disabled', async () => {
    assert.strictEqual(
      await minify('<svg><rect fill="#aabbcc"/></svg>', { minifySVG: { minifyColors: false }, collapseWhitespace: true }),
      '<svg><rect fill="#aabbcc"/></svg>'
    );
  });

  test('Color references preserve case', async () => {
    // url() references should preserve case (SVG IDs are case-sensitive)
    assert.strictEqual(
      await minify('<svg><rect fill="url(#MyGradient)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="url(#MyGradient)"/></svg>'
    );

    // Multiple `url()` references
    assert.strictEqual(
      await minify('<svg><rect fill="url(#Pattern1)" stroke="url(#Pattern2)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="url(#Pattern1)" stroke="url(#Pattern2)"/></svg>'
    );

    // `var()` CSS custom properties
    assert.strictEqual(
      await minify('<svg><rect fill="var(--MyColor)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="var(--MyColor)"/></svg>'
    );

    // `inherit` and `currentColor` keywords
    assert.strictEqual(
      await minify('<svg><rect fill="inherit" stroke="currentColor"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="inherit" stroke="currentColor"/></svg>'
    );

    // Mixed: `url()` reference alongside regular color
    assert.strictEqual(
      await minify('<svg><rect fill="url(#MyGradient)" stroke="#ff0000"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="url(#MyGradient)" stroke="red"/></svg>'
    );
  });

  test('Mixed HTML and SVG', async () => {
    // HTML elements before and after SVG
    assert.strictEqual(
      await minify('<div><p>Text</p><svg><path d="M 0.000 0.000"/></svg><span>More</span></div>', { minifySVG: true, collapseWhitespace: true }),
      '<div><p>Text</p><svg><path d="M0 0"/></svg><span>More</span></div>'
    );

    // Multiple SVG elements
    assert.strictEqual(
      await minify('<div><svg><circle cx="1.000" cy="1.000" r="1.000"/></svg><svg><rect x="2.000" y="2.000"/></svg></div>', { minifySVG: true, collapseWhitespace: true }),
      '<div><svg><circle cx="1" cy="1" r="1"/></svg><svg><rect x="2" y="2"/></svg></div>'
    );
  });

  test('Named color conversion', async () => {
    const colorTests = [
      { hex: '#ff0000', name: 'red', attr: 'fill' },
      { hex: '#c0c0c0', name: 'silver', attr: 'fill' },
      { hex: '#808080', name: 'gray', attr: 'fill' },
      { hex: '#000080', name: 'navy', attr: 'stroke' },
      { hex: '#008080', name: 'teal', attr: 'fill' },
      { hex: '#ffa500', name: 'orange', attr: 'fill' },
      { hex: '#008000', name: 'green', attr: 'fill' },
      { hex: '#800080', name: 'purple', attr: 'fill' },
      { hex: '#800000', name: 'maroon', attr: 'fill' },
      { hex: '#808000', name: 'olive', attr: 'fill' }
    ];

    for (const { hex, name, attr } of colorTests) {
      const element = attr === 'stroke' ? `<line ${attr}="${hex}" x1="0" y1="0" x2="1" y2="1"/>` : `<rect ${attr}="${hex}"/>`;
      const expectedElement = attr === 'stroke' ? `<line ${attr}="${name}" x1="0" y1="0" x2="1" y2="1"/>` : `<rect ${attr}="${name}"/>`;

      assert.strictEqual(
        await minify(`<svg>${element}</svg>`, { minifySVG: true, collapseWhitespace: true }),
        `<svg>${expectedElement}</svg>`
      );
    }

    // Black stays as `#000` (shorter than `black`)
    assert.strictEqual(
      await minify('<svg><rect fill="#000000"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="#000"/></svg>'
    );

    // White stays as `#fff` (shorter than `white`)
    assert.strictEqual(
      await minify('<svg><rect fill="#ffffff"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="#fff"/></svg>'
    );
  });

  test('Extended default attributes', async () => {
    // Clipping and masking defaults
    assert.strictEqual(
      await minify('<svg><rect clip-rule="nonzero" clip-path="none" mask="none"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>'
    );

    // Marker defaults
    assert.strictEqual(
      await minify('<svg><path d="M0 0" marker-start="none" marker-mid="none" marker-end="none"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M0 0"/></svg>'
    );

    // Filter default
    assert.strictEqual(
      await minify('<svg><rect filter="none"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>'
    );

    // Color interpolation defaults
    assert.strictEqual(
      await minify('<svg><rect color-interpolation="sRGB"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>'
    );

    assert.strictEqual(
      await minify('<svg><filter><feGaussianBlur color-interpolation-filters="linearRGB"/></filter></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><filter><feGaussianBlur/></filter></svg>'
    );
  });

  test('Overflow attribute safety', async () => {
    // `overflow="visible"` should not be removed from root `<svg>` element
    assert.strictEqual(
      await minify('<svg overflow="visible"><rect/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg overflow="visible"><rect/></svg>'
    );

    // `overflow="visible"` should be removed from nested SVG elements
    assert.strictEqual(
      await minify('<svg><rect overflow="visible"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>'
    );

    assert.strictEqual(
      await minify('<svg><g overflow="visible"><circle cx="5" cy="5" r="5"/></g></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><g><circle cx="5" cy="5" r="5"/></g></svg>'
    );

    assert.strictEqual(
      await minify('<svg><path d="M0 0" overflow="visible"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M0 0"/></svg>'
    );
  });

  test('Identity transform removal', async () => {
    const identityTransforms = [
      'translate(0)',
      'translate(0,0)',
      'translate(0 0)', // space-separated
      'scale(1)',
      'scale(1,1)',
      'scale(1 1)', // space-separated
      'rotate(0)',
      'skewX(0)',
      'skewY(0)',
      'matrix(1,0,0,1,0,0)',
      'matrix(1 0 0 1 0 0)', // space-separated
      'translate( 0 , 0 )', // with whitespace
      'translate(0.0, 0.00)', // decimal variants
      'translate(0.0 0.00)', // decimal with spaces
      'scale(1.00)',
      'scale(1.0 1.0)', // decimal with spaces
      'rotate(0.000)',
      'matrix(1.0,0.0,0.0,1.0,0.0,0.0)',
      'matrix(1.0 0.0 0.0 1.0 0.0 0.0)' // decimal with spaces
    ];

    for (const transform of identityTransforms) {
      assert.strictEqual(
        await minify(`<svg><rect transform="${transform}"/></svg>`, { minifySVG: true, collapseWhitespace: true }),
        '<svg><rect/></svg>',
        `Failed to remove identity transform: ${transform}`
      );
    }

    // Non-identity transforms should be kept
    assert.strictEqual(
      await minify('<svg><rect transform="translate(10,20)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect transform="translate(10,20)"/></svg>'
    );

    // Identity rotate with valid center coordinates should be removed
    assert.strictEqual(
      await minify('<svg><rect transform="rotate(0, 10, 20)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>',
      'Failed to remove identity rotate(0, cx, cy)'
    );

    assert.strictEqual(
      await minify('<svg><rect transform="rotate(0 10 20)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>',
      'Failed to remove identity rotate(0 cx cy) with spaces'
    );

    assert.strictEqual(
      await minify('<svg><rect transform="rotate(0.0, 5.5, -10.25)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect/></svg>',
      'Failed to remove identity rotate with decimal center coordinates'
    );

    // Invalid rotate transforms should be preserved (not removed)
    assert.strictEqual(
      await minify('<svg><rect transform="rotate(0, invalid)"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect transform="rotate(0,invalid)"/></svg>',
      'Invalid rotate transform should be preserved (with whitespace collapsed)'
    );
  });

  test('Path data space optimization', async () => {
    const pathTests = [
      { input: 'M 10 20 L 30 40', expected: 'M10 20L30 40', desc: 'basic commands' },
      { input: 'M -10 -20 L -30 -40', expected: 'M-10-20L-30-40', desc: 'negative numbers' },
      { input: 'M 0 0 L 10 10 H 20 V 30 C 40 50 60 70 80 90 Z', expected: 'M0 0L10 10H20V30C40 50 60 70 80 90Z', desc: 'multiple commands' },
      { input: 'm 5 5 l 10 10 h 15', expected: 'm5 5l10 10h15', desc: 'lowercase commands' },
      { input: 'M 10 10 A 5 5 0 0 1 20 20', expected: 'M10 10A5 5 0 0 1 20 20', desc: 'arc commands' }
    ];

    for (const { input, expected, desc } of pathTests) {
      assert.strictEqual(
        await minify(`<svg><path d="${input}"/></svg>`, { minifySVG: true, collapseWhitespace: true }),
        `<svg><path d="${expected}"/></svg>`,
        `Path space optimization failed for ${desc}: input="${input}"`
      );
    }
  });

  test('Combined new optimizations', async () => {
    // Path with spaces, named color, identity transform, and default attributes
    assert.strictEqual(
      await minify('<svg><path d="M 10.000 20.000 L 30.000 40.000" fill="#808080" transform="translate(0)" fill-opacity="1"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><path d="M10 20L30 40" fill="gray"/></svg>'
    );

    // Multiple optimizations on one element
    assert.strictEqual(
      await minify('<svg><rect fill="#008000" stroke="#000080" marker-start="none" transform="scale(1)" clip-path="none"/></svg>', { minifySVG: true, collapseWhitespace: true }),
      '<svg><rect fill="green" stroke="navy"/></svg>'
    );
  });
});