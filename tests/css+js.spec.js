import {describe, test} from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';

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

  // Tests for minifyJS configuration options
  test('JS: Basic boolean true', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('JS: Mangle disabled (`mangle: false`)', async () => {
    // Note: Even with `mangle: false`, Terser still applies compress optimizations by default
    // To truly preserve variable names, need to disable both mangle and compress
    const input = '<script>function myFunction(myParam) { var myVariable = myParam + 1; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    // Function and variable names should not be mangled (shortened)
    assert.ok(result.includes('myFunction'), 'Function name should be preserved');
    assert.ok(result.includes('myParam'), 'Parameter name should be preserved');
    // Note: `myVariable` may still be optimized away if compress is enabled
  });

  test('JS: Top-level mangling (`mangle: { toplevel: true }`)', async () => {
    const input = '<script>function myFunction() { var myVariable = 123; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: { toplevel: true } } });

    // With top-level mangling, function name should be mangled (shortened)
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    assert.ok(!result.includes('myFunction'), 'Function name should be mangled');
    assert.ok(result.length < input.length, 'Output should be shorter than input');
  });

  test('JS: Reserved names (`mangle: { reserved: ["myFunction"] }`)', async () => {
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
    const input = '<script>function calculate() { console.log("calculating"); var result = 10 + 20; return result; }</script>';
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
    const input = '<button onclick="var myVar = 42; alert(myVar);">Click</button>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    assert.ok(result.includes('myVar'), 'Variable names should not be mangled');
    assert.ok(result.includes('alert'), 'Function call should be preserved');
  });

  // Engine field tests
  test('JS: Default engine (Terser)', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Should use Terser by default
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('JS: Explicit Terser engine', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Explicitly specify terser engine
    assert.strictEqual(await minify(input, { minifyJS: { engine: 'terser' } }), output);
  });

  test('JS: SWC engine for script blocks', async () => {
    const input = '<script>function myFunction() { var x = 1; return x; }</script>';

    // SWC should minify the code (exact output may differ from Terser)
    const result = await minify(input, { minifyJS: { engine: 'swc' } });
    assert.ok(result.startsWith('<script>'), 'Should start with script tag');
    assert.ok(result.endsWith('</script>'), 'Should end with script tag');
    assert.ok(result.length < input.length, 'Should be minified (shorter)');
    assert.ok(!result.includes('var x'), 'Variable should be optimized away');
  });

  test('JS: Hybrid behavior with Terser processing inline handlers', async () => {
    const input = '<button onclick="return false;">Click</button>';

    // Even with SWC engine, inline handlers should use Terser
    // This is because SWC doesn’t support bare return statements
    const result = await minify(input, { minifyJS: { engine: 'swc' } });
    assert.ok(result.includes('onclick'), 'onclick attribute should be preserved');
    assert.ok(result.includes('return'), 'Return statement should work (via Terser)');
  });

  test('JS: Hybrid behavior—complex example', async () => {
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

  test('JS: Invalid engine throws error', async () => {
    const input = '<script>function test() { return 1; }</script>';

    await assert.rejects(
      async () => await minify(input, { minifyJS: { engine: 'invalid' } }),
      /Unsupported JS minifier engine/,
      'Should throw error for invalid engine'
    );
  });

  test('JS: Engine-specific options for Terser', async () => {
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

  test('JS: Engine-specific options for SWC', async () => {
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

    // Test preset as option key (should work the same as spreading `getPreset`)
    input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html>\n  <head>\n    <!-- Comment -->\n  </head>\n</html>';
    const presetOptionResult = await minify(input, { preset: 'conservative' });
    const spreadPresetResult = await minify(input, getPreset('conservative'));
    assert.strictEqual(presetOptionResult, spreadPresetResult, 'Using preset option should produce same result as spreading getPreset()');
    assert.ok(!presetOptionResult.includes('<!-- Comment -->'), 'Preset option: should apply preset settings');

    // Test preset with overrides (user options should override preset)
    input = '<!DOCTYPE html>\n<html>\n  <head>\n    <!-- Comment -->\n  </head>\n</html>';
    const presetWithOverride = await minify(input, { preset: 'conservative', removeComments: false });
    assert.ok(presetWithOverride.includes('<!-- Comment -->'), 'User option should override preset setting');

    // Test unknown preset emits warning
    const originalWarn = console.warn;
    let warnMessage = '';
    console.warn = (msg) => { warnMessage = msg; };
    try {
      input = '<p>Test</p>';
      await minify(input, { preset: 'nonexistent' });
      assert.ok(warnMessage.includes('Unknown preset “nonexistent”'), 'Should warn about unknown preset');
      assert.ok(warnMessage.includes('conservative, comprehensive'), 'Should list available presets');
    } finally {
      console.warn = originalWarn;
    }
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

  // Cache configuration tests
  describe('Caches', () => {
    test('Default sizes work', async () => {
      // Test that caches work without explicit configuration
      const input = `
        <style>body { color: red; margin: 0; }</style>
        <script>var x = 1; console.log(x);</script>
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
        <script>var data = { x: 1, y: 2 };</script>
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
  });
});