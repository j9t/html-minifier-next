import {describe, test} from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';

describe('CSS and JS', () => {
  test('Style minification', async () => {
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

  test('Invalid/empty CSS in style attributes', async () => {
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

  // Tests for minifyCSS configuration options
  test('minifyCSS: Basic boolean true', async () => {
    const input = '<style>body { color: red; font-size: 12px; }</style>';
    const output = '<style>body{color:red;font-size:12px}</style>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('minifyCSS: Custom options', async () => {
    const input = '<style>.class1 { color: red; } .class2 { color: red; }</style>';
    const result = await minify(input, {
      minifyCSS: {}
    });

    // Lightning CSS performs optimizations by default when minify is enabled
    assert.ok(result.includes('color:red'), 'Should minify CSS');
    assert.ok(result.length < input.length, 'Output should be shorter');
  });

  test('minifyCSS: Inline `style` attribute', async () => {
    const input = '<div style="  color: red;  margin: 10px;  "></div>';
    const output = '<div style="color:red;margin:10px"></div>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('minifyCSS: Preserve important comments', async () => {
    const input = '<style>/*! Important license */ body { color: red; }</style>';
    const result = await minify(input, { minifyCSS: true });

    // Lightning CSS preserves “/*!” comments by default
    assert.ok(result.includes('Important license'), 'Important comment should be preserved');
  });

  test('minifyCSS: Combined with `collapseWhitespace`', async () => {
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

  test('minifyCSS: Media query minification', async () => {
    const input = '<link rel="stylesheet" media="  screen  and  ( min-width: 768px )  " href="style.css">';
    const result = await minify(input, { minifyCSS: true });

    // Media query should be minified
    assert.ok(!result.includes('  screen  '), 'Extra spaces should be removed from media query');
    assert.ok(result.includes('screen'), 'Media type should be preserved');
  });

  // Tests for minifyJS configuration options
  test('minifyJS: Basic boolean true', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('minifyJS: Mangle disabled (`mangle: false`)', async () => {
    // Note: Even with `mangle: false`, Terser still applies compress optimizations by default
    // To truly preserve variable names, need to disable both mangle and compress
    const input = '<script>function myFunction(myParam) { var myVariable = myParam + 1; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    // Function and variable names should not be mangled (shortened)
    assert.ok(result.includes('myFunction'), 'Function name should be preserved');
    assert.ok(result.includes('myParam'), 'Parameter name should be preserved');
    // Note: myVariable may still be optimized away if compress is enabled
  });

  test('minifyJS: Top-level mangling (`mangle: { toplevel: true }`)', async () => {
    const input = '<script>function myFunction() { var myVariable = 123; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: { toplevel: true } } });

    // With top-level mangling, function name should be mangled (shortened)
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    assert.ok(!result.includes('myFunction'), 'Function name should be mangled');
    assert.ok(result.length < input.length, 'Output should be shorter than input');
  });

  test('minifyJS: Reserved names (`mangle: { reserved: ["myFunction"] }`)', async () => {
    const input = '<script>function myFunction() { var myVariable = 123; return myVariable; }</script>';
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

  test('minifyJS: Drop console statements (`compress: { drop_console: true }`)', async () => {
    const input = '<script>console.log("debug"); alert("keep this");</script>';
    const output = '<script>alert("keep this")</script>';

    assert.strictEqual(await minify(input, {
      minifyJS: {
        compress: { drop_console: true }
      }
    }), output);
  });

  test('minifyJS: Combined mangle and compress options', async () => {
    const input = '<script>function calculate() { console.log("calculating"); var result = 10 + 20; return result; }</script>';
    const result = await minify(input, {
      minifyJS: {
        mangle: { toplevel: true },
        compress: { drop_console: true }
      }
    });

    // Should remove console.log and mangle names
    assert.ok(!result.includes('console.log'), 'Console statement should be removed');
    assert.ok(!result.includes('calculate'), 'Function name should be mangled');
    assert.ok(result.includes('30'), 'Should optimize 10 + 20 to 30');
  });

  test('minifyJS: Event attribute with mangle disabled', async () => {
    const input = '<button onclick="var myVar = 42; alert(myVar);">Click</button>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    assert.ok(result.includes('myVar'), 'Variable names should not be mangled');
    assert.ok(result.includes('alert'), 'Function call should be preserved');
  });

  // Combined tests
  test('minifyJS and minifyCSS together', async () => {
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

  // Engine field tests
  test('minifyJS: Default engine (Terser)', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Should use terser by default
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('minifyJS: Explicit Terser engine', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Explicitly specify terser engine
    assert.strictEqual(await minify(input, { minifyJS: { engine: 'terser' } }), output);
  });

  test('minifyJS: SWC engine for script blocks', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';

    // SWC should minify the code (exact output may differ from Terser)
    const result = await minify(input, { minifyJS: { engine: 'swc' } });
    assert.ok(result.startsWith('<script>'), 'Should start with script tag');
    assert.ok(result.endsWith('</script>'), 'Should end with script tag');
    assert.ok(result.length < input.length, 'Should be minified (shorter)');
    assert.ok(!result.includes('var x'), 'Variable should be optimized away');
  });

  test('minifyJS: Hybrid behavior with Terser processing inline handlers', async () => {
    const input = '<button onclick="return false;">Click</button>';

    // Even with SWC engine, inline handlers should use Terser
    // This is because SWC doesn’t support bare return statements
    const result = await minify(input, { minifyJS: { engine: 'swc' } });
    assert.ok(result.includes('onclick'), 'onclick attribute should be preserved');
    assert.ok(result.includes('return'), 'Return statement should work (via Terser)');
  });

  test('minifyJS: Hybrid behavior—complex example', async () => {
    const input = `
      <script>function calculate() { var x = 10; var y = 20; return x + y; }</script>
      <button onclick="var result = calculate(); alert(result); return false;">Test</button>
    `;

    // Script block uses SWC, inline handler uses Terser
    const result = await minify(input, {
      minifyJS: { engine: 'swc' },
      collapseWhitespace: true
    });

    assert.ok(result.includes('<script>'), 'Script element should be present');
    assert.ok(result.includes('onclick='), 'onclick attribute should be present');
    assert.ok(result.includes('return'), 'Inline return statement should work');
    assert.ok(result.length < input.length, 'Should be minified overall');
  });

  test('minifyJS: Invalid engine throws error', async () => {
    const input = '<script>function test() { return 1; }</script>';

    await assert.rejects(
      async () => await minify(input, { minifyJS: { engine: 'invalid' } }),
      /Unsupported JS minifier engine/,
      'Should throw error for invalid engine'
    );
  });

  test('minifyJS: Engine-specific options for Terser', async () => {
    const input = '<script>function myFunction() { console.log("test"); var x = 1; return x; }</script>';

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
    assert.ok(result.includes('return'), 'Return statement should be present');
  });

  test('minifyJS: Engine-specific options for SWC', async () => {
    const input = '<script>function myFunction() { var unused = "test"; var x = 1; return x; }</script>';

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

  test('minifyJS: SWC case-insensitivity', async () => {
    const input = '<script>function test() { return 42; }</script>';

    // Engine field should be case-insensitive
    const result1 = await minify(input, { minifyJS: { engine: 'swc' } });
    const result2 = await minify(input, { minifyJS: { engine: 'SWC' } });
    const result3 = await minify(input, { minifyJS: { engine: 'Swc' } });

    assert.strictEqual(result1, result2, 'Case variations should produce same result');
    assert.strictEqual(result2, result3, 'Case variations should produce same result');
  });
});