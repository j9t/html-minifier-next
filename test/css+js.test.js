import {describe, test} from 'node:test';
import assert from 'node:assert';
import { minify, getCacheStats } from '../src/htmlminifier.js';
import { collectUsedSymbols } from '../src/lib/unused-css.js';

describe('CSS and JS', () => {
  test('CSS minification', async () => {
    let input, output;

    input = '<style></style>div#foo { background-color: red; color: white }';
    assert.strictEqual(await minify(input, { minifyCSS: true }), input);

    input = '<style>div#foo { background-color: red; color: white }</style>';
    output = '<style>div#foo{color:#fff;background-color:red}</style>'; // Lightning CSS may reorder properties
    assert.strictEqual(await minify(input), input);
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<style>div > p.foo + span { border: 10px solid black }</style>';
    output = '<style>div>p.foo+span{border:10px solid #000}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<div style="background: url(images/<% image %>);"></div>';
    assert.strictEqual(await minify(input), input);
    output = '<div style="background:url(images/<% image %>)"></div>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    assert.strictEqual(await minify(input, {
      collapseWhitespace: true,
      minifyCSS: true
    }), output);

    input = '<div style="background: url(\'images/<% image %>\')"></div>';
    assert.strictEqual(await minify(input), input);
    output = '<div style="background:url(images/<% image %>)"></div>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    assert.strictEqual(await minify(input, {
      collapseWhitespace: true,
      minifyCSS: true
    }), output);

    input = '<style>\np {\n  background: url(images/<% image %>);\n}\n</style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p{background:url(images/<% image %>)}</style>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    assert.strictEqual(await minify(input, {
      collapseWhitespace: true,
      minifyCSS: true
    }), output);

    input = '<style>p { background: url("images/<% image %>") }</style>';
    assert.strictEqual(await minify(input), input);
    output = '<style>p{background:url(images/<% image %>)}</style>'; // Lightning CSS removes unnecessary quotes
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    assert.strictEqual(await minify(input, {
      collapseWhitespace: true,
      minifyCSS: true
    }), output);

    input = '<link rel="stylesheet" href="css/style-mobile.css" media="(max-width: 737px)">';
    assert.strictEqual(await minify(input), input);
    output = '<link rel="stylesheet" href="css/style-mobile.css" media="(width<=737px)">'; // Lightning CSS uses modern range syntax
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    output = '<link rel=stylesheet href=css/style-mobile.css media="(width<=737px)">'; // Quotes required: contains `<` and `=`
    assert.strictEqual(await minify(input, {
      minifyCSS: true,
      removeAttributeQuotes: true
    }), output);

    input = '<style media="(max-width: 737px)"></style>';
    assert.strictEqual(await minify(input), input);
    output = '<style media="(width<=737px)"></style>'; // Lightning CSS uses modern range syntax
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
    output = '<style media="(width<=737px)"></style>'; // Quotes required: contains `<` and `=`
    assert.strictEqual(await minify(input, {
      minifyCSS: true,
      removeAttributeQuotes: true
    }), output);
  });

  test('Style attribute minification', async () => {
    const input = '<div style="color: red; background-color: yellow; font-family: Verdana, Arial, sans-serif;"></div>';
    const output = '<div style="color:red;background-color:#ff0;font-family:Verdana,Arial,sans-serif"></div>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  // Tests for minifyCSS configuration options
  test('CSS: Basic boolean true', async () => {
    const input = '<style>body { color: red; font-size: 12px; }</style>';
    const output = '<style>body{color:red;font-size:12px}</style>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('CSS: Custom options', async () => {
    const input = '<style>.class1 { color: red; } .class2 { color: red; }</style>';
    const result = await minify(input, {
      minifyCSS: {}
    });

    // Lightning CSS performs optimizations by default when minify is enabled
    assert.ok(result.includes('color:red'), 'Should minify CSS');
    assert.ok(result.length < input.length, 'Output should be shorter');
  });

  test('CSS: Inline `style` attribute', async () => {
    const input = '<div style="  color: red;  margin: 10px;  "></div>';
    const output = '<div style="color:red;margin:10px"></div>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('CSS: Preserve important comments', async () => {
    const input = '<style>/*! Important license */ body { color: red; }</style>';
    const result = await minify(input, { minifyCSS: true });

    // Lightning CSS preserves `/*!` comments by default
    assert.ok(result.includes('Important license'), 'Important comment should be preserved');
  });

  test('CSS: Combined with `collapseWhitespace`', async () => {
    const input = `
      <style>
        body {
          color: red;
          font-size: 14px;
        }
      </style>
    `;
    const result = await minify(input, {
      minifyCSS: true,
      collapseWhitespace: true
    });

    assert.ok(result.includes('<style>body{color:red;font-size:14px}</style>'));
    assert.ok(!result.includes('\n'), 'Whitespace should be collapsed');
  });

  test('CSS: Media query minification', async () => {
    const input = '<link rel="stylesheet" media="  screen  and  ( min-width: 768px )  " href="style.css">';
    const result = await minify(input, { minifyCSS: true });

    // Media query should be minified
    assert.ok(!result.includes('  screen  '), 'Extra spaces should be removed from media query');
    assert.ok(result.includes('screen'), 'Media type should be preserved');
  });

  test('Invalid/empty CSS in `style` attributes', async () => {
    // Regression test for issue where invalid CSS like `color: ` was minified to `color:` instead of being removed
    let input, output;

    // Properties with no value should be detected as empty
    input = '<div style="color: ">Test</div>';
    output = '<div style="">Test</div>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    input = '<div style="margin:">Test</div>';
    output = '<div style="">Test</div>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    // With `removeEmptyAttributes`, empty styles should be removed entirely
    input = '<div style="color: ">Test</div>';
    output = '<div>Test</div>';
    assert.strictEqual(await minify(input, { minifyCSS: true, removeEmptyAttributes: true }), output);

    // Multiple invalid properties
    input = '<div style="color:;margin:;padding:">Test</div>';
    output = '<div>Test</div>';
    assert.strictEqual(await minify(input, { minifyCSS: true, removeEmptyAttributes: true }), output);

    // Mix of valid and invalid—Lightning CSS preserves as-is (conservative behavior)
    input = '<div style="color: ; background: red">Test</div>';
    output = '<div style="color: ;background:red">Test</div>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);

    // Lightning CSS adds default for background shorthand—should be kept
    input = '<div style="background: ">Test</div>';
    output = '<div style="background:0 0">Test</div>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('CSS minification error handling', async () => {
    // Test invalid CSS syntax—should attempt to minify or preserve original
    let input = '<style>body { color: #invalid!!! }</style>';
    let result = await minify(input, { minifyCSS: true });
    // Should not crash and should contain style element
    assert.ok(result.includes('<style>'));
    assert.ok(result.includes('</style>'));
    // Should crash with continueOnMinifyError: false
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected token/ }
    );

    // Test completely malformed CSS
    input = '<style>this is not valid css at all { { { </style>';
    result = await minify(input, { minifyCSS: true });
    assert.ok(result.includes('<style>'));
    assert.ok(result.includes('</style>'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    // Test CSS with unclosed braces
    input = '<style>body { color: red;</style>';
    result = await minify(input, { minifyCSS: true });
    assert.ok(result.includes('style'));
    // Note: Lightning CSS can handle unclosed braces without error, even with `errorRecovery: false`
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    // Test empty `style` element
    input = '<style></style>';
    result = await minify(input, { minifyCSS: true, removeEmptyElements: false });
    assert.strictEqual(result, '<style></style>');
    await assert.doesNotReject(minify(input, {
      continueOnMinifyError: false,
      minifyCSS: true,
      removeEmptyElements: false
    }));

    // Test `style` attribute with invalid CSS
    input = '<div style="color: #invalid!!!">Test</div>';
    result = await minify(input, { minifyCSS: true });
    assert.ok(result.includes('div'));
    assert.ok(result.includes('Test'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected token/ }
    );

    // Test valid CSS still works
    input = '<style>  body { color: red; }  </style>';
    result = await minify(input, { minifyCSS: true });
    assert.strictEqual(result, '<style>body{color:red}</style>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));
  });

  test('Large CSS inputs with identical first/last 50 chars are not confused in cache', async () => {
    // Craft two CSS inputs that share the same length, first 50 chars, and last 50 chars
    // but differ in the middle—previously the fingerprint key caused a cache collision
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

  // Tests for `minifyJS` configuration options
  test('JS: Basic boolean true', async () => {
    const input = '<script>function myFunction() { let x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('JS: Mangle disabled (`mangle: false`)', async () => {
    // Note: Even with `mangle: false`, Terser still applies compress optimizations by default
    // To truly preserve variable names, need to disable both mangle and compress
    const input = '<script>function myFunction(myParam) { let myVariable = myParam + 1; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    // Function and variable names should not be mangled (shortened)
    assert.ok(result.includes('myFunction'), 'Function name should be preserved');
    assert.ok(result.includes('myParam'), 'Parameter name should be preserved');
    // Note: `myVariable` may still be optimized away if compress is enabled
  });

  test('JS: Top-level mangling (`mangle: { toplevel: true }`)', async () => {
    const input = '<script>function myFunction() { let myVariable = 123; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: { toplevel: true } } });

    // With top-level mangling, function name should be mangled (shortened)
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    assert.ok(!result.includes('myFunction'), 'Function name should be mangled');
    assert.ok(result.length < input.length, 'Output should be shorter than input');
  });

  test('JS: Reserved names (`mangle: { reserved: ["myFunction"] }`)', async () => {
    const input = '<script>function myFunction() { let myVariable = 123; return myVariable; }</script>';
    const result = await minify(input, {
      minifyJS: {
        mangle: {
          toplevel: true,
          reserved: ['myFunction']
        }
      }
    });

    // Function name should be preserved, but variable should be mangled
    assert.ok(result.includes('myFunction'), 'Reserved function name should be preserved');
    assert.ok(!result.includes('myVariable'), 'Variable name should be mangled');
  });

  test('JS: Drop console statements (`compress: { drop_console: true }`)', async () => {
    const input = '<script>console.log("debug"); alert("keep this");</script>';
    const output = '<script>alert("keep this")</script>';

    assert.strictEqual(await minify(input, {
      minifyJS: {
        compress: { drop_console: true }
      }
    }), output);
  });

  test('JS: Combined mangle and compress options', async () => {
    const input = '<script>function calculate() { console.log("calculating"); let result = 10 + 20; return result; }</script>';
    const result = await minify(input, {
      minifyJS: {
        mangle: { toplevel: true },
        compress: { drop_console: true }
      }
    });

    // Should remove `console.log` and mangle names
    assert.ok(!result.includes('console.log'), 'Console statement should be removed');
    assert.ok(!result.includes('calculate'), 'Function name should be mangled');
    assert.ok(result.includes('30'), 'Should optimize 10 + 20 to 30');
  });

  test('JS: Event attribute with mangle disabled', async () => {
    const input = '<button onclick="let myVar = 42; alert(myVar);">Click</button>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    assert.ok(result.includes('myVar'), 'Variable names should not be mangled');
    assert.ok(result.includes('alert'), 'Function call should be preserved');
  });

  test('JS: Entity references in event handler attributes decoded before minification', async () => {
    let input, result;

    // `&quot;` → `"` enables bracket-to-dot notation optimization
    input = '<body onclick="window[&quot;alert&quot;]()">';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('window.alert()'), 'Bracket notation with `&quot;` should be optimized to dot notation');

    // `&amp;` as logical AND operator
    input = '<div onclick="a &amp;&amp; b()">';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('onclick='), '`onclick` attribute should be preserved');
    assert.ok(result.includes('&&'), 'Decoded `&&` operator should be preserved');
    assert.ok(result.includes('b()'), 'Function call after `&amp;&amp;` should be preserved');
  });

  test('JS: MIME types that trigger minification', async () => {
    let input, output;

    input = '<script type="">function f(){  return 1  }</script>';
    output = '<script type="">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="text/javascript">function f(){  return 1  }</script>';
    output = '<script type="text/javascript">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script foo="bar">function f(){  return 1  }</script>';
    output = '<script foo="bar">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="text/ecmascript">function f(){  return 1  }</script>';
    output = '<script type="text/ecmascript">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="application/javascript">function f(){  return 1  }</script>';
    output = '<script type="application/javascript">function f(){return 1}</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    input = '<script type="boo">function f(){  return 1  }</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);

    input = '<script type="text/html"><!-- ko if: true -->\n\n\n<div></div>\n\n\n<!-- /ko --></script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), input);
  });

  test('JS: `type=module` enables module-specific optimizations', async () => {
    let input, output;

    // Module-specific optimization: unused variable elimination (only safe in module scope)
    input = '<script type=module>let foo=1;console.log(foo)</script>';
    output = '<script type=module>console.log(1)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Full-form attribute value
    input = '<script type="module">let bar=2;console.log(bar)</script>';
    output = '<script type="module">console.log(2)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // Classic script: unused variable must be preserved (no `module:true`)
    input = '<script>let baz=3;console.log(baz)</script>';
    output = '<script>let baz=3;console.log(baz)</script>';
    assert.strictEqual(await minify(input, { minifyJS: true }), output);

    // User-supplied module:true in config is not overridden (still works)
    input = '<script type=module>let qux=4;console.log(qux)</script>';
    output = '<script type=module>console.log(4)</script>';
    assert.strictEqual(await minify(input, { minifyJS: { module: true } }), output);

    // SWC engine also applies `module:true` for `type=module` scripts
    input = '<script type=module>let foo=1;console.log(foo)</script>';
    output = '<script type=module>console.log(1)</script>';
    assert.strictEqual(await minify(input, { minifyJS: { engine: 'swc' } }), output);

    // SWC: Classic script does not apply `module:true`
    input = '<script>let baz=3;console.log(baz)</script>';
    output = '<script>let baz=3;console.log(baz)</script>';
    assert.strictEqual(await minify(input, { minifyJS: { engine: 'swc' } }), output);
  });

  // Engine field tests
  test('JS: Default engine (Terser)', async () => {
    const input = '<script>function myFunction() { let x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Should use Terser by default
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('JS: Explicit Terser engine', async () => {
    const input = '<script>function myFunction() { let x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Explicitly specify terser engine
    assert.strictEqual(await minify(input, { minifyJS: { engine: 'terser' } }), output);
  });

  test('JS: SWC engine for script blocks', async () => {
    const input = '<script>function myFunction() { let x = 1; return x; }</script>';

    // SWC should minify the code (exact output may differ from Terser)
    const result = await minify(input, { minifyJS: { engine: 'swc' } });
    assert.ok(result.startsWith('<script>'), 'Should start with script tag');
    assert.ok(result.endsWith('</script>'), 'Should end with script tag');
    assert.ok(result.length < input.length, 'Should be minified (shorter)');
    assert.ok(!result.includes('let x'), 'Variable should be optimized away');
  });

  test('JS: Hybrid behavior with Terser processing inline handlers', async () => {
    const input = '<button onclick="return false;">Click</button>';

    // Even with SWC engine, inline handlers should use Terser
    // This is because SWC doesn’t support bare return statements
    const result = await minify(input, { minifyJS: { engine: 'swc' } });
    assert.ok(result.includes('onclick'), '`onclick` attribute should be preserved');
    assert.ok(result.includes('return'), 'Return statement should work (via Terser)');
  });

  test('JS: Hybrid behavior—complex example', async () => {
    const input = `
      <script>function calculate() { let x = 10; let y = 20; return x + y; }</script>
      <button onclick="let result = calculate(); alert(result); return false;">Test</button>
    `;

    // Script block uses SWC, inline handler uses Terser
    const result = await minify(input, {
      minifyJS: { engine: 'swc' },
      collapseWhitespace: true
    });

    assert.ok(result.includes('<script>'), '`script` element should be present');
    assert.ok(result.includes('onclick='), '`onclick` attribute should be present');
    assert.ok(result.includes('return'), 'Inline return statement should work');
    assert.ok(result.length < input.length, 'Should be minified overall');
  });

  test('JS: Invalid engine throws error', async () => {
    const input = '<script>function test() { return 1; }</script>';

    await assert.rejects(
      async () => await minify(input, { minifyJS: { engine: 'invalid' } }),
      /Unsupported JS minifier engine/,
      'Should throw error for invalid engine'
    );
  });

  test('JS: Engine-specific options for Terser', async () => {
    const input = '<script>function myFunction() { console.log("test"); let x = 1; return x; }</script>';

    const result = await minify(input, {
      minifyJS: {
        engine: 'terser',
        compress: {
          drop_console: true
        }
      }
    });

    assert.ok(!result.includes('console'), 'Console should be dropped');
    assert.ok(result.includes('function myFunction()'), 'Function should remain');
    assert.ok(result.includes('return'), '`return` statement should be present');
  });

  test('JS: Engine-specific options for SWC', async () => {
    const input = '<script>function myFunction() { let unused = "test"; let x = 1; return x; }</script>';

    const result = await minify(input, {
      minifyJS: {
        engine: 'swc',
        compress: true,
        mangle: true
      }
    });

    assert.ok(result.startsWith('<script>'), 'Should start with script tag');
    assert.ok(result.length < input.length, 'Should be minified');
    // SWC may or may not remove the unused variable depending on optimization level
    // Just check that it’s shorter (minified)
  });

  test('JS: SWC case-insensitivity', async () => {
    const input = '<script>function test() { return 42; }</script>';

    // Engine field should be case-insensitive
    const result1 = await minify(input, { minifyJS: { engine: 'swc' } });
    const result2 = await minify(input, { minifyJS: { engine: 'SWC' } });
    const result3 = await minify(input, { minifyJS: { engine: 'Swc' } });

    assert.strictEqual(result1, result2, 'Case variations should produce same result');
    assert.strictEqual(result2, result3, 'Case variations should produce same result');
  });

  test('JavaScript minification error handling', async () => {
    // Test invalid JavaScript syntax
    let input = '<script>function foo( { syntax error</script>';
    let result = await minify(input, { minifyJS: true });
    // Should not crash and should contain `script` element
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    // Invalid JS should be preserved or partially processed
    assert.ok(result.includes('foo'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test completely malformed JavaScript
    input = '<script>{{ this is not valid javascript }} [[</script>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test JS with unclosed brackets
    input = '<script>function test() { console.log("hi");</script>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('script'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test empty `script` element
    input = '<script></script>';
    result = await minify(input, { minifyJS: true, removeEmptyElements: false });
    assert.strictEqual(result, '<script></script>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    // Test event attribute with invalid JS
    input = '<button onclick="function( { syntax">Click</button>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('button'));
    assert.ok(result.includes('Click'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Test valid JS still works
    input = '<script>  console.log( "test" );  </script>';
    result = await minify(input, { minifyJS: true });
    assert.strictEqual(result, '<script>console.log("test")</script>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    // Test event attribute with valid JS (quote style may change during minification)
    input = '<button onclick="  alert( \'test\' )  ">Click</button>';
    result = await minify(input, { minifyJS: true });
    // Minifier may normalize quote styles
    assert.ok(result.includes('onclick='));
    assert.ok(result.includes('alert'));
    assert.ok(result.includes('test'));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));
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

  test('Presets', async () => {
    const { getPreset } = await import('../src/presets.js');

    // Test with conservative preset
    let input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html>\n  <head>\n    <!-- Comment -->\n    <script type="application/ld+json">\n{\n  "name": "Test",\n  "url": "https://example.com/page"\n}\n    </script>\n  </head>\n</html>';
    const conservativeResult = await minify(input, getPreset('conservative'));
    // Conservative preset should: remove comments, collapse whitespace, minify JSON, use short doctype
    assert.ok(!conservativeResult.includes('<!-- Comment -->'), 'Conservative: Should remove comments');
    assert.ok(conservativeResult.includes('<!doctype html>'), 'Conservative: Should use short doctype');
    assert.ok(conservativeResult.includes('{"name":"Test","url":"https://example.com/page"}'), 'Conservative: Should minify JSON');
    assert.ok(!conservativeResult.includes('\n{\n'), 'Conservative: Should collapse whitespace in script content');

    // Test with comprehensive preset
    input = '<script type="importmap">\n{\n  "imports": {\n    "vue": "https://cdn.example.com/vue.js"\n  }\n}\n</script>';
    const comprehensiveResult = await minify(input, getPreset('comprehensive'));
    // Comprehensive preset should: minify JSON, collapse whitespace, remove quotes from attributes where possible
    assert.ok(comprehensiveResult.includes('{"imports":{"vue":"https://cdn.example.com/vue.js"}}'), 'Comprehensive: Should minify JSON');
    assert.ok(comprehensiveResult.includes('type=importmap'), 'Comprehensive: Should remove attribute quotes');

    // Verify JSON minification works even with no options (automatic behavior)
    input = '<script type="application/json">{\n  "test": "value"\n}</script>';
    const noOptionsResult = await minify(input, {});
    assert.strictEqual(noOptionsResult, '<script type="application/json">{"test":"value"}</script>', 'No options: should still minify JSON automatically');

    // Test preset as option key (should work the same as spreading `getPreset`)
    input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html>\n  <head>\n    <!-- Comment -->\n  </head>\n</html>';
    const presetOptionResult = await minify(input, { preset: 'conservative' });
    const spreadPresetResult = await minify(input, getPreset('conservative'));
    assert.strictEqual(presetOptionResult, spreadPresetResult, 'Using preset option should produce same result as spreading getPreset()');
    assert.ok(!presetOptionResult.includes('<!-- Comment -->'), 'Preset option: Should apply preset settings');

    // Test preset with overrides (user options should override preset)
    input = '<!DOCTYPE html>\n<html>\n  <head>\n    <!-- Comment -->\n  </head>\n</html>';
    const presetWithOverride = await minify(input, { preset: 'conservative', removeComments: false });
    assert.ok(presetWithOverride.includes('<!-- Comment -->'), 'User option should override preset setting');

    // Test unknown preset emits warning (once per preset name per process)
    const originalWarn = console.warn;
    let warnMessage = '';
    let warnCount = 0;
    console.warn = (msg) => { warnMessage = msg; warnCount++; };
    try {
      input = '<p>Test</p>';
      await minify(input, { preset: 'nonexistent' });
      assert.ok(warnMessage.includes('Unknown preset “nonexistent”'), 'Should warn about unknown preset');
      assert.ok(warnMessage.includes('conservative, comprehensive'), 'Should list available presets');

      await minify(input, { preset: 'nonexistent' });
      assert.strictEqual(warnCount, 1, 'Should not repeat the warning for the same preset');
    } finally {
      console.warn = originalWarn;
    }
  });

  test('JSON script content keeps `<` escaped', async () => {
    // A framework hydration payload: HTML held inside JSON, with `<` and `/`
    // escaped so the nested `</script>` cannot terminate the container
    const input = '<script type="application/json">{\n  "content": "\\u003Cscript\\u003Ealert(1)\\u003C\\u002Fscript\\u003E"\n}</script>';
    const result = await minify(input, { collapseWhitespace: true });

    assert.ok(!/<\/script/i.test(result.slice(result.indexOf('>') + 1, result.lastIndexOf('</script>'))), 'JSON content must not contain a literal `</script`');
    assert.strictEqual(result, '<script type="application/json">{"content":"\\u003Cscript>alert(1)\\u003C/script>"}</script>');

    // The escaping must not change what the JSON parses to
    const value = JSON.parse(result.slice(result.indexOf('>') + 1, result.lastIndexOf('</script>')));
    assert.strictEqual(value.content, '<script>alert(1)</script>');
  });

  test('JSON script content without markup is unaffected', async () => {
    const input = '<script type="application/ld+json">{\n  "@type": "Person",\n  "name": "Test"\n}</script>';
    const output = '<script type="application/ld+json">{"@type":"Person","name":"Test"}</script>';
    assert.strictEqual(await minify(input, { collapseWhitespace: true }), output);
  });

  test('JSON minification error handling', async () => {
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

  // Combined tests
  test('`minifyJS` and `minifyCSS` together', async () => {
    const input = `
      <style>body { color: red; }</style>
      <script>function test() { console.log("test"); }</script>
    `;
    const result = await minify(input, {
      minifyJS: { compress: { drop_console: true } },
      minifyCSS: true,
      collapseWhitespace: true
    });

    assert.ok(result.includes('body{color:red}'), 'CSS should be minified');
    assert.ok(!result.includes('console.log'), 'Console should be dropped');
    assert.ok(result.includes('function test(){}'), 'Empty function after console removal');
  });

  test('Reports invalid CSS Lightning CSS flags under error recovery', async () => {
    const input = '<style>@property --p{syntax:"<percentage>";inherits:false;initial-value:0}.a{color:red}</style>';
    const logs = [];
    const output = await minify(input, { minifyCSS: true, log: message => logs.push(String(message)) });

    assert.ok(output.includes('.a{color:red}'), 'Valid rules should still be minified');
    assert.ok(!output.includes('@property'), 'Invalid rule should be skipped, as browsers skip it');
    assert.ok(
      logs.some(message => message.startsWith('Warning: Lightning CSS reported invalid CSS')),
      'The rule should be reported through `log`'
    );
  });

  test('Reports invalid CSS Lightning CSS keeps, without claiming it was dropped', async () => {
    // Lightning CSS passes an unknown at-rule through and still warns, so the
    // wording may not promise the rule is gone
    const input = '<style>@unknown-thing{foo:bar}.a{color:red}</style>';
    const logs = [];
    const output = await minify(input, { minifyCSS: true, log: message => logs.push(String(message)) });

    assert.ok(output.includes('@unknown-thing'), 'The rule is kept, so the report must not say it was skipped');
    assert.ok(
      logs.some(message => message.startsWith('Warning: Lightning CSS reported invalid CSS')),
      'The rule should still be reported through `log`'
    );
    assert.ok(!logs.some(message => message.includes('skipped')), 'Nothing was skipped here');
  });

  test('Reports invalid CSS once per document, and for every document', async () => {
    const invalid = '@unknown-thing{foo:bar}';
    const collect = sink => message => {
      if (String(message).includes('reported invalid CSS')) {
        sink.push(String(message));
      }
    };

    // One defect across two style sheets: the document should hear about it once
    const perDocument = [];
    await minify(
      `<style>${invalid}.a{color:red}</style><style>${invalid}.b{color:blue}</style><p class="a b"></p>`,
      { minifyCSS: true, log: collect(perDocument) }
    );
    assert.strictEqual(perDocument.length, 1, 'One defect, one warning');

    // The same document four times over, so every pass but the first is a cache
    // hit: A hit must not swallow the warning for the document that hit it, or a
    // batch would report the first file and pass the rest off as clean
    const perBatch = [];
    const options = { minifyCSS: true, log: collect(perBatch) };
    for (let pass = 0; pass < 4; pass++) {
      await minify(`<style>${invalid}.c{color:red}</style><p class="c"></p>`, options);
    }
    assert.strictEqual(perBatch.length, 4, 'Every document should hear about its own invalid rule');
  });

  describe('Object-valued options handed a string', () => {
    // `'false'` used to switch minification on: Any non-empty string is truthy, and
    // these options read a non-object as `{}`
    const cases = [
      ['minifyCSS', '<style>.a { color : red }</style>'],
      ['minifyJS', '<script>var x  =  1</script>'],
      ['minifySVG', '<svg><circle cx="1.00"/></svg>']
    ];

    for (const [key, input] of cases) {
      test(`\`${key}\` refuses a string rather than reading it as “on”`, async () => {
        const logs = [];
        const output = await minify(input, { [key]: 'false', log: message => logs.push(String(message)) });

        assert.strictEqual(output, input, `\`${key}: "false"\` must not enable minification`);
        assert.ok(
          logs.some(message => message.includes(key) && message.includes('string')),
          `The rejected value should be reported (got ${JSON.stringify(logs)})`
        );
      });
    }

    test('`minifyURLs` still takes a string, which names the site', async () => {
      // The one object-valued option where a string carries meaning, so it is
      // deliberately left out of the check above
      const input = '<a href="https://example.com/x/y.html">y</a>';

      assert.strictEqual(
        await minify(input, { minifyURLs: 'https://example.com/x/' }),
        '<a href="y.html">y</a>'
      );
    });
  });

  // Unused-CSS removal tests
  describe('Unused CSS removal', () => {
    const style = css => `<!doctype html><html><head><style>${css}</style></head><body>`;
    const styleOf = html => (html.match(/<style>([\s\S]*?)<\/style>/) ?? ['', ''])[1];

    test('Removes rules the document never references', async () => {
      const input = style('.used{color:red}.unused{color:red}#gone{color:red}#kept{color:red}') +
        '<p id="kept" class="used"></p>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('.used'), 'Referenced class should be kept');
      assert.ok(styleOf(output).includes('#kept'), 'Referenced ID should be kept');
      assert.ok(!styleOf(output).includes('.unused'), 'Unreferenced class should be removed');
      assert.ok(!styleOf(output).includes('#gone'), 'Unreferenced ID should be removed');
    });

    test('Requires `minifyCSS`, and says so', async () => {
      const input = style('.unused{color:red}') + '<p></p>';
      const logs = [];
      const output = await minify(input, { removeUnusedCSS: true, log: message => logs.push(String(message)) });

      assert.ok(styleOf(output).includes('.unused'), 'Without `minifyCSS` nothing should be removed');
      assert.ok(
        logs.some(message => message.includes('removeUnusedCSS') && message.includes('requires')),
        'Silently doing nothing would be the surprise, so it should warn'
      );
      assert.ok(
        logs.some(message => message.includes('--minify-css')),
        'The warning should name the flag a CLI user would reach for'
      );
    });

    test('Refuses a string value instead of reading it as “on”', async () => {
      // A configuration file holding `"false"` would otherwise delete rules
      const input = style('.unused{color:red}') + '<p></p>';
      const logs = [];
      const output = await minify(input, {
        minifyCSS: true,
        removeUnusedCSS: 'false',
        log: message => logs.push(String(message))
      });

      assert.ok(styleOf(output).includes('.unused'), 'A string must not enable the option');
      assert.ok(
        logs.some(message => message.includes('removeUnusedCSS') && message.includes('string')),
        'The rejected value should be reported'
      );
    });

    test('Reports that a `minifyCSS` function takes over', async () => {
      // The removal rides along with Lightning CSS, which a custom function replaces
      const input = style('.unused{color:red}') + '<p></p>';
      const logs = [];
      const output = await minify(input, {
        minifyCSS: text => text,
        removeUnusedCSS: true,
        log: message => logs.push(String(message))
      });

      assert.ok(styleOf(output).includes('.unused'), 'A `minifyCSS` function minifies CSS itself');
      assert.ok(
        logs.some(message => message.includes('removeUnusedCSS') && message.includes('function')),
        'The combination should warn rather than pass silently'
      );
    });

    test('Keeps symbols referenced from ID references and `data-*` attributes', async () => {
      const input = style('.late{color:red}#target{color:red}') +
        '<button aria-controls="target" data-toggle-class="late"></button>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('#target'), '`aria-controls` should count as a reference');
      assert.ok(styleOf(output).includes('.late'), '`data-*` values should count as references');
    });

    test('Keeps symbols named in inline scripts unless `scripts` is disabled', async () => {
      const input = style('.js-only{color:red}') +
        '<p></p><script>document.body.classList.add("js-only")</script>';

      const guarded = await minify(input, { minifyCSS: true, removeUnusedCSS: true });
      assert.ok(styleOf(guarded).includes('.js-only'), 'Inline script references should be kept by default');

      const unguarded = await minify(input, { minifyCSS: true, removeUnusedCSS: { scripts: false } });
      assert.ok(!styleOf(unguarded).includes('.js-only'), '`scripts: false` should drop the guard');
    });

    test('Keeps hyphen-leading class names found in scripts and `data-*` values', async () => {
      // `.-mt-4` and the like are ordinary CSS identifiers a script hands to `classList`
      const cases = [
        ['.-foo{color:red}', '<script>document.body.classList.add("-foo")</script>', '.-foo'],
        ['.-mt-4{margin-top:-1rem}', '<script>el.classList.add("-mt-4")</script>', '.-mt-4'],
        ['.--foo{color:red}', '<script>el.classList.add("--foo")</script>', '.--foo'],
        ['.-foo{color:red}', '<p data-toggle="-foo"></p>', '.-foo'],
        // Two hyphens start an identifier whatever follows them
        ['.--1foo{color:red}', '<script>el.classList.add("--1foo")</script>', '.--1foo'],
        ['.---foo{color:red}', '<script>el.classList.add("---foo")</script>', '.---foo'],
        ['.--1foo{color:red}', '<p data-toggle="--1foo"></p>', '.--1foo']
      ];

      for (const [css, markup, expected] of cases) {
        const output = await minify(style(css) + '<p></p>' + markup, { minifyCSS: true, removeUnusedCSS: true });
        assert.ok(styleOf(output).includes(expected), `${markup} should keep ${expected}`);
      }

      // Hyphen-leading names nothing references should still go
      for (const name of ['-gone', '--gone', '---gone']) {
        const unused = await minify(style(`.${name}{color:red}`) + '<p></p>', {
          minifyCSS: true,
          removeUnusedCSS: true
        });
        assert.ok(!styleOf(unused).includes(`.${name}`), `Unreferenced .${name} should still be removed`);
      }
    });

    test('Honors the safelist, as strings and as regular expressions', async () => {
      const input = style('.keep-me{color:red}.keep-prefix-a{color:red}.drop{color:red}') + '<p></p>';
      const output = await minify(input, {
        minifyCSS: true,
        removeUnusedCSS: { safelist: ['keep-me', /^keep-prefix-/] }
      });

      assert.ok(styleOf(output).includes('.keep-me'), 'Safelisted string should be kept');
      assert.ok(styleOf(output).includes('.keep-prefix-a'), 'Safelisted pattern should be kept');
      assert.ok(!styleOf(output).includes('.drop'), 'Unsafelisted symbol should still be removed');
    });

    test('Never removes `@keyframes` or `@counter-style` a class name collides with', async () => {
      const input = style('@keyframes spin{from{opacity:0}}.spin{animation:spin 1s}' +
        '@counter-style tick{system:cyclic}.tick{list-style:tick}') + '<p></p>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('@keyframes spin'), '`@keyframes` must survive a colliding class name');
      assert.ok(styleOf(output).includes('@counter-style tick'), '`@counter-style` must survive a colliding class name');
    });

    test('Leaves `style` and `media` attributes alone', async () => {
      const input = '<p style="color:red" class="used"></p><link media="(min-width:0)" rel="stylesheet" href="a.css">';
      const baseline = await minify(input, { minifyCSS: true });
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      // Attributes carry declarations and media queries, never selectors
      assert.strictEqual(output, baseline);
    });

    test('Does not leak one document’s result into another through the CSS cache', async () => {
      const sheet = '.alpha{color:red}.beta{color:red}';
      const options = { minifyCSS: true, removeUnusedCSS: true };

      const first = await minify(style(sheet) + '<p class="alpha"></p>', options);
      const second = await minify(style(sheet) + '<p class="beta"></p>', options);

      assert.ok(styleOf(first).includes('.alpha') && !styleOf(first).includes('.beta'));
      assert.ok(styleOf(second).includes('.beta'), 'Second document must not inherit the first document’s output');
      assert.ok(!styleOf(second).includes('.alpha'));
    });

    test('Resolves escaped identifiers when matching markup', async () => {
      const input = style('.md\\:flex{display:flex}.lg\\:grid{display:grid}') + '<p class="md:flex"></p>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('flex'), 'Escaped class present in markup should be kept');
      assert.ok(!styleOf(output).includes('grid'), 'Escaped class absent from markup should be removed');
    });

    test('Survives out-of-range escapes instead of throwing', async () => {
      // `\FFFFFF` exceeds the maximum code point; per CSS Syntax it resolves to U+FFFD
      const input = style(String.raw`.\FFFFFF{color:red}.b{color:red}`) + '<p class="b"></p>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('.b'), 'Referenced class should survive an out-of-range escape');
    });

    test('Still applies when a custom fragment is present', async () => {
      // `<%…%>` is matched by the default `ignoreCustomFragments`, which swaps in a
      // wrapper around `minifyCSS` that must keep forwarding the symbol set
      const input = style('.used{color:red}.unused{color:red}') + '<p class="used"></p><%= tpl %>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('.used'), 'Referenced class should be kept');
      assert.ok(!styleOf(output).includes('.unused'), 'Custom fragments must not disable the option');
    });

    test('Reads raw-text elements whose end tag carries whitespace', async () => {
      const input = style('.js-x{color:red}') +
        '<p></p><script>document.body.classList.add("js-x")</script >';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('.js-x'), '`</script >` should still be recognized as an end tag');
    });

    test('Reads raw-text elements whose end tag carries attributes or a slash', async () => {
      // Browsers close the element on all of these, so the script body still runs
      const endTags = ['</script\t\n bar>', '</script foo="bar">', '</script/>', '</script >trailing'];

      for (const endTag of endTags) {
        const input = style('.js-x{color:red}') +
          `<p></p><script>document.body.classList.add("js-x")${endTag}`;
        const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

        assert.ok(styleOf(output).includes('.js-x'), `“${endTag}” should be recognized as an end tag`);
      }
    });

    test('Does not mistake a longer tag name for a raw-text tag', async () => {
      // `</scriptfoo>` closes nothing, so what follows is still script content
      const input = style('.js-x{color:red}') +
        '<p></p><script>void 0</scriptfoo>document.body.classList.add("js-x")';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('.js-x'), 'Script content should run past a non-matching end tag');

      // Likewise, `<styles>` is a different element and must not be stripped as a style sheet
      const other = '<styles class="kept"></styles>' + style('.kept{color:red}') + '<p></p>';
      assert.ok(
        styleOf(await minify(other, { minifyCSS: true, removeUnusedCSS: true })).includes('.kept'),
        '`<styles>` must not be treated as a `style` element'
      );
    });

    test('Decodes character references in attribute values', async () => {
      const cases = [
        ['.used{color:red}', '<p class="us&#101;d"></p>', '.used'],
        ['.used{color:red}', '<p class="us&#x65;d"></p>', '.used'],
        ['#tgt{color:red}', '<p id="t&#103;t"></p>', '#tgt'],
        ['.two{color:red}', '<p class="one&#32;two"></p>', '.two']
      ];

      for (const [css, markup, expected] of cases) {
        const output = await minify(style(css) + markup, { minifyCSS: true, removeUnusedCSS: true });
        assert.ok(styleOf(output).includes(expected), `${markup} should reference ${expected}`);
      }

      // A decoded value must not turn into a match for something else
      const unrelated = await minify(style('.gone{color:red}') + '<p class="us&#101;d"></p>', {
        minifyCSS: true,
        removeUnusedCSS: true
      });
      assert.ok(!styleOf(unrelated).includes('.gone'), 'Unreferenced rules should still be removed');
    });

    test('Keeps offsets aligned when lowercasing changes length', async () => {
      // U+0130 lowercases to two code units, which would shift every later offset—and
      // a shifted strip leaves `class` glued to the preceding text, so it stops parsing
      const input = '<p title="\u0130\u0130\u0130">x</p>' +
        '<style>.used{color:red}.gone{color:red}</style><p class="used"></p>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(styleOf(output).includes('.used'), 'Referenced rule must survive a length-changing character');
      assert.ok(!styleOf(output).includes('.gone'), 'Unreferenced rule should still be removed');
    });

    test('Scans raw-text elements in linear time', () => {
      // A regular expression permissive enough for malformed end tags backtracked
      // quadratically over near-matches; compare growth rather than absolute time,
      // which would depend on the machine, and keep the best of several runs, as a
      // lone sample largely reports what else the machine was doing. No `>` may
      // follow the repetitions—one lets the pattern succeed immediately, which is
      // what makes the near-matches pathological rather than merely long.
      const measure = (/** @type {number} */ count) => {
        const input = '<style>' + '</style\t'.repeat(count);
        let best = Infinity;
        for (let run = 0; run < 3; run++) {
          const started = performance.now();
          collectUsedSymbols(input, true);
          best = Math.min(best, performance.now() - started);
        }
        return best;
      };

      measure(1000); // Warm up, so the first timed run is not the one that compiles
      const small = measure(8000);
      const large = measure(16000);

      // Doubling the input doubles a linear scan but quadruples a quadratic one; the
      // constant absorbs timer noise, which dominates when both runs are near-instant
      assert.ok(
        large <= small * 3 + 50,
        `Scanning grew from ${small.toFixed(1)} ms to ${large.toFixed(1)} ms on twice the input`
      );
    });

    test('Stops stripping a stylesheet at its own end tag, however malformed', async () => {
      // A missed end tag would let the body run on to the next one, swallowing markup
      const input = '<style>.a{color:red}</style bar><p class="a b"></p><style>.b{color:red}</style>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(output.includes('.a{color:red}'), 'Class before the second stylesheet should be kept');
      assert.ok(output.includes('.b{color:red}'), 'Class after the first stylesheet should be kept');
    });

    test('Honors a safelist entry that is a global regular expression', async () => {
      const input = style('.js-a{color:red}.js-b{color:red}.js-c{color:red}') + '<p></p>';
      const output = await minify(input, {
        minifyCSS: true,
        removeUnusedCSS: { safelist: [/^js-/g] }
      });

      // A stateful pattern would otherwise match only every other symbol
      for (const name of ['.js-a', '.js-b', '.js-c']) {
        assert.ok(styleOf(output).includes(name), `${name} should be safelisted`);
      }
    });

    test('Keeps IDs reached through a fragment URL', async () => {
      // `:target` rules and SVG sprites name their element by fragment, never by
      // an `id` attribute on the element doing the referencing
      const cases = [
        ['#sec:target{color:red}', '<a href="#sec">go</a>', '#sec'],
        ['#ic{fill:red}', '<svg><use href="#ic"/></svg>', '#ic'],
        ['#ic{fill:red}', '<svg><use xlink:href="#ic"/></svg>', '#ic'],
        ['#m{color:red}', '<img usemap="#m">', '#m'],
        // Presentation attributes reach a paint server the same way `style` does
        ['#grad stop{stop-color:red}', '<svg><rect fill="url(#grad)"/></svg>', '#grad'],
        ['#blur{flood-color:red}', '<p style="filter:url(#blur)"></p>', '#blur']
      ];

      for (const [css, markup, expected] of cases) {
        const output = await minify(style(css) + markup, { minifyCSS: true, removeUnusedCSS: true });
        assert.ok(styleOf(output).includes(expected), `${markup} should keep ${expected}`);
      }

      // A fragment on another document names nothing here, so it protects nothing
      const external = await minify(style('#gone{color:red}') + '<a href="/page#gone">x</a>', {
        minifyCSS: true,
        removeUnusedCSS: true
      });
      assert.ok(!styleOf(external).includes('#gone'), 'A fragment on another document is not a local reference');
    });

    test('Keeps class names whose characters end a CSS identifier', async () => {
      // `md:flex`, `w-1/2`, and `p-[3px]` are ordinary class names in utility CSS;
      // an identifier scan stops at the `:`, `/`, or `[` and would lose them
      const cases = [
        ['.md\\:flex{display:flex}', '<script>el.classList.add("md:flex")</script>', 'flex'],
        ['.w-1\\/2{width:50%}', '<script>el.classList.add(\'w-1/2\')</script>', 'width'],
        ['.p-\\[3px\\]{padding:3px}', '<script>el.classList.add("p-[3px]")</script>', 'padding'],
        ['.tpl\\:x{color:red}', '<script>el.className=`tpl:x`</script>', 'color'],
        // A name may not start with a digit unescaped, but it may be one
        ['.\\31 col{width:1px}', '<script>el.classList.add("1col")</script>', 'width'],
        ['.md\\:flex{display:flex}', '<p data-c="md:flex"></p>', 'flex']
      ];

      for (const [css, markup, expected] of cases) {
        const output = await minify(style(css) + '<p></p>' + markup, { minifyCSS: true, removeUnusedCSS: true });
        assert.ok(styleOf(output).includes(expected), `${markup} should keep ${css}`);
      }

      // Nothing references these, so the widened scan must not keep them either
      const unused = await minify(style('.md\\:gone{display:flex}.q-\\[1px\\]{padding:1px}') + '<p></p>', {
        minifyCSS: true,
        removeUnusedCSS: true
      });
      assert.strictEqual(styleOf(unused), '', 'Unreferenced names should still be removed');
    });

    test('Reads a style sheet’s own attributes, not its contents', async () => {
      const output = await minify(
        '<style id="theme" class="t">#theme{color:red}.t{color:red}.gone{color:red}</style><p></p>',
        { minifyCSS: true, removeUnusedCSS: true }
      );

      assert.ok(output.includes('#theme'), '`<style id="theme">` is what `#theme` refers to');
      assert.ok(output.includes('.t'), 'A class on the element itself counts too');
      assert.ok(!output.includes('.gone'), 'The sheet is still no evidence for its own selectors');
    });

    test('Reports values it has to ignore rather than silently protecting nothing', async () => {
      // Each case uses a distinct message: `processOptions` reports a given warning
      // once per process, as it does for unknown option keys
      const cases = [
        [{ safelist: 'js-' }, 'safelist'],
        [{ safelist: [42] }, 'type number'],
        [{ scripts: 'false' }, 'scripts'],
        [{ safeList: ['x'] }, 'safeList']
      ];

      for (const [config, expected] of cases) {
        const logs = [];
        await minify(style('.drop{color:red}') + '<p></p>', {
          minifyCSS: true,
          removeUnusedCSS: config,
          log: message => logs.push(String(message))
        });
        assert.ok(
          logs.some(message => message.includes(expected)),
          `${JSON.stringify(config)} should be reported (got ${JSON.stringify(logs)})`
        );
      }
    });

    test('Keeps what an `iframe srcdoc` document references', async () => {
      // `srcdoc` holds a document of its own, and its style sheets are minified
      // against the same symbol set, so its own classes have to be in it
      const quote = String.fromCharCode(39);
      const input = style('.outer{color:red}') + '<p class="outer"></p>' +
        `<iframe srcdoc=${quote}<style>.inner{color:blue}.gone{color:red}</style><p class="inner">hi</p>${quote}></iframe>`;
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(output.includes('.inner'), 'A class the nested document uses should survive');
      assert.ok(!output.includes('.gone'), 'A class nothing uses should still go');
      assert.ok(output.includes('.outer'), 'The outer document should be unaffected');
    });

    test('Reads a start tag past a `>` inside a quoted attribute value', async () => {
      // The tag ends where the parser says it does, so `id` is still an attribute
      const output = await minify(
        '<style media="(min-width:0)" title="a>b" id="theme">#theme{color:red}.gone{color:red}</style><p></p>',
        { minifyCSS: true, removeUnusedCSS: true }
      );

      assert.ok(output.includes('#theme'), '`id` after a `>`-carrying value should still be read');
      assert.ok(!output.includes('.gone'), 'Unreferenced rules should still be removed');
    });

    test('Leaves a document without a style sheet exactly as `minifyCSS` alone would', async () => {
      const input = '<p class="a" data-x="b"></p><script>el.classList.add("c")</script>';
      const baseline = await minify(input, { minifyCSS: true });

      assert.strictEqual(await minify(input, { minifyCSS: true, removeUnusedCSS: true }), baseline);
    });
  });

  // Cache configuration tests
  describe('Caches', () => {
    test('Default sizes work', async () => {
      // Test that caches work without explicit configuration
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

    test('Custom CSS cache size', async () => {
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

    test('Custom JS cache size', async () => {
      const input = '<script>function test() { return 42; }</script>';

      // Should work with custom JS cache size
      const result = await minify(input, {
        minifyJS: true,
        cacheJS: 250 // Custom size
      });

      assert.ok(result.includes('function test(){return 42}') || result.includes('function test(){return 42;}'),
        'JS should be minified with custom cache');
    });

    test('Both cache sizes', async () => {
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
      // Check that object properties are minified
      assert.ok(result.includes('x:1') && result.includes('y:2'), 'JS should be minified with custom cache sizes');
    });

    test('Environment variables', async () => {
      const input = '<style>.test { color: purple; }</style>';

      // Test environment variable override
      process.env.HMN_CACHE_CSS = '900';
      try {
        const result = await minify(input, {
          minifyCSS: true
        });

        assert.ok(result.includes('.test{color:purple}'), 'CSS should minify with env var cache size');
      } finally {
        // Clean-up always runs, even if assertion fails
        delete process.env.HMN_CACHE_CSS;
      }
    });

    test('Option overrides env var', async () => {
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
        // Clean-up always runs, even if assertion fails
        delete process.env.HMN_CACHE_CSS;
      }
    });

    test('Very large cache sizes', async () => {
      const input = '<script>function largeTest() { return "large"; }</script>';

      // Should handle large cache sizes without issues
      const result = await minify(input, {
        minifyJS: true,
        cacheJS: 10000 // Very large size
      });

      assert.ok(result.includes('function largeTest(){'), 'JS should minify with large cache');
    });

    test('Zero cache size coerces to `1`', async () => {
      const input = '<style>.zero { margin: 0; }</style>';

      // Should coerce `0` to `1` and still work
      const result = await minify(input, {
        minifyCSS: true,
        cacheCSS: 0 // Should be coerced to `1`
      });

      assert.ok(result.includes('.zero{margin:0}'), 'CSS should minify even with `cacheCSS: 0`');
    });

    test('Negative env var returns undefined (uses default)', async () => {
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

    test('Infinity env var returns undefined (uses default)', async () => {
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

    test('Invalid string env var returns undefined (uses default)', async () => {
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

    test('`getCacheStats()` omits caches with no effect on untouched caches', async () => {
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
});