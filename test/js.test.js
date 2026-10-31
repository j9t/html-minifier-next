import { describe, test } from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';
import { extractScriptBodies } from '../src/lib/content.js';

describe('JS', () => {
  test('Keeps names with `mangle: false`', async () => {
    // Note: Even with `mangle: false`, Terser still applies compress optimizations by default
    // To truly preserve variable names, need to disable both mangle and compress
    const input = '<script>function myFunction(myParam) { let myVariable = myParam + 1; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: false } });

    // Function and variable names should not be mangled (shortened)
    assert.ok(result.includes('myFunction'), 'Function name should be preserved');
    assert.ok(result.includes('myParam'), 'Parameter name should be preserved');
    // Note: `myVariable` may still be optimized away if compress is enabled
  });

  test('Mangles top-level names with `mangle: { toplevel: true }`', async () => {
    const input = '<script>function myFunction() { let myVariable = 123; return myVariable; }</script>';
    const result = await minify(input, { minifyJS: { mangle: { toplevel: true } } });

    // With top-level mangling, function name should be mangled (shortened)
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    assert.ok(!result.includes('myFunction'), 'Function name should be mangled');
    assert.ok(result.length < input.length, 'Output should be shorter than input');
  });

  test('Keeps reserved names (`mangle: { reserved: ["myFunction"] }`)', async () => {
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

  test('Drops console statements (`compress: { drop_console: true }`)', async () => {
    const input = '<script>console.log("debug"); alert("keep this");</script>';
    const output = '<script>alert("keep this")</script>';

    assert.strictEqual(await minify(input, {
      minifyJS: {
        compress: { drop_console: true }
      }
    }), output);
  });

  test('Combines mangle and compress options', async () => {
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

  test('Keeps names in event attributes with mangle disabled', async () => {
    // A parameter is local, so it is mangled by default
    const input = '<button onclick="function show(myVar) { alert(myVar); } show(42);">Click</button>';

    assert.strictEqual(await minify(input, { minifyJS: true }), '<button onclick="function show(o){alert(o)}show(42)">Click</button>');
    assert.strictEqual(await minify(input, { minifyJS: { mangle: false } }), '<button onclick="function show(myVar){alert(myVar)}show(42)">Click</button>');
  });

  test('Decodes entity references in event handler attributes before minification', async () => {
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

  test('Minifies the MIME types that trigger minification', async () => {
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

  test('Enables module-specific optimizations for `type=module`', async () => {
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
  test('Uses Terser by default', async () => {
    const input = '<script>function myFunction() { let x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Should use Terser by default
    assert.strictEqual(await minify(input, { minifyJS: true }), output);
  });

  test('Uses Terser when set explicitly', async () => {
    const input = '<script>function myFunction() { let x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    // Explicitly specify terser engine
    assert.strictEqual(await minify(input, { minifyJS: { engine: 'terser' } }), output);
  });

  test('Uses SWC for script blocks', async () => {
    const input = '<script>function myFunction() { let x = 1; return x; }</script>';
    const output = '<script>function myFunction(){return 1}</script>';

    assert.strictEqual(await minify(input, { minifyJS: { engine: 'swc' } }), output);

    // Both engines minify alike, so the parser’s error message is what tells them apart
    // (Terser reports “Name expected” here)
    await assert.rejects(
      minify('<script>var = = =;</script>', { minifyJS: { engine: 'swc' }, continueOnMinifyError: false }),
      { message: /Unexpected token `=`/ }
    );
  });

  test('Uses SWC for inline handlers', async () => {
    const options = { minifyJS: { engine: 'swc' }, continueOnMinifyError: false };

    assert.strictEqual(
      await minify('<button onclick="event.preventDefault(); return false;">Click</button>', options),
      '<button onclick="return event.preventDefault(),!1">Click</button>'
    );

    // Terser would report “Name expected,” so this shows SWC took the handler
    await assert.rejects(
      minify('<button onclick="var = = =; return false;">Test</button>', options),
      { message: /Unexpected token `=`/ }
    );
  });

  test('Uses SWC for script blocks and inline handlers in one document', async () => {
    const input = `
      <script>function calculate() { let x = 10; let y = 20; return x + y; }</script>
      <button onclick="let result = calculate(); alert(result); return false;">Test</button>
    `;

    assert.strictEqual(
      await minify(input, { minifyJS: { engine: 'swc' }, collapseWhitespace: true, continueOnMinifyError: false }),
      '<script>function calculate(){return 30}</script><button onclick="let result=calculate();return alert(result),!1">Test</button>'
    );
  });

  test('Keeps a directive prologue in inline handlers under SWC', async () => {
    const input = '<button onclick="\'use strict\'; return this.value;">Test</button>';
    const output = '<button onclick=\'"use strict";return this.value\'>Test</button>';

    assert.strictEqual(await minify(input, { minifyJS: { engine: 'swc' }, continueOnMinifyError: false }), output);
  });

  test('Applies SWC options to inline handlers', async () => {
    const input = '<button onclick="console.log(1); return false;">Test</button>';
    const output = '<button onclick="return!1">Test</button>';

    assert.strictEqual(await minify(input, { minifyJS: { engine: 'swc', compress: { drop_console: true } }, continueOnMinifyError: false }), output);
  });

  test('Throws an error for an invalid engine', async () => {
    const input = '<script>function test() { return 1; }</script>';

    await assert.rejects(
      async () => await minify(input, { minifyJS: { engine: 'invalid' } }),
      /Unsupported JS minifier engine/,
      'Should throw error for invalid engine'
    );
  });

  test('Applies engine-specific options for Terser', async () => {
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

  test('Applies engine-specific options for SWC', async () => {
    const input = '<script>function myFunction() { console.log("test"); let x = 1; return x; }</script>';

    const result = await minify(input, {
      minifyJS: {
        engine: 'swc',
        compress: {
          drop_console: true
        }
      }
    });

    assert.ok(!result.includes('console'), 'Console should be dropped');
    assert.ok(result.includes('function myFunction()'), 'Function should remain');
    assert.ok(result.includes('return'), '`return` statement should be present');
  });

  test('Reads the SWC engine name case-insensitively', async () => {
    const input = '<script>function test() { return 42; }</script>';

    // Engine field should be case-insensitive
    const result1 = await minify(input, { minifyJS: { engine: 'swc' } });
    const result2 = await minify(input, { minifyJS: { engine: 'SWC' } });
    const result3 = await minify(input, { minifyJS: { engine: 'Swc' } });

    assert.strictEqual(result1, result2, 'Case variations should produce same result');
    assert.strictEqual(result2, result3, 'Case variations should produce same result');
  });

  test('Rejects a non-string engine with the engine error', async () => {
    const input = '<script>function test() { return 42; }</script>';

    for (const engine of [1, true, {}, ['swc']]) {
      await assert.rejects(
        async () => await minify(input, { minifyJS: { engine } }),
        /Unsupported JS minifier engine/,
        `Should reject ${JSON.stringify(engine)} without a type error`
      );
    }
  });

  test('Still rejects an engine that cannot be serialized with the engine error', async () => {
    const input = '<script>function test() { return 42; }</script>';
    const cyclic = {};
    cyclic.self = cyclic;

    for (const engine of [1n, cyclic]) {
      await assert.rejects(
        async () => await minify(input, { minifyJS: { engine } }),
        /Unsupported JS minifier engine/,
        `Should reject a ${typeof engine === 'bigint' ? 'BigInt' : 'cyclic object'} without a serialization error`
      );
    }
  });

  test('Falls back to Terser for an unset engine', async () => {
    const input = '<script>function test() { return 42; }</script>';
    const output = await minify(input, { minifyJS: { engine: 'terser' } });

    for (const engine of [undefined, null, '']) {
      assert.strictEqual(
        await minify(input, { minifyJS: { engine } }),
        output,
        `${JSON.stringify(engine)} should fall back to Terser`
      );
    }
  });

  test('Handles JavaScript minification errors', async () => {
    // Invalid JavaScript syntax
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

    // Completely malformed JavaScript
    input = '<script>{{ this is not valid javascript }} [[</script>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('<script>'));
    assert.ok(result.includes('</script>'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // JS with unclosed brackets
    input = '<script>function test() { console.log("hi");</script>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('script'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Empty `script` element
    input = '<script></script>';
    result = await minify(input, { minifyJS: true, removeEmptyElements: false });
    assert.strictEqual(result, '<script></script>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    // Event attribute with invalid JS
    input = '<button onclick="function( { syntax">Click</button>';
    result = await minify(input, { minifyJS: true });
    assert.ok(result.includes('button'));
    assert.ok(result.includes('Click'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyJS: true }),
      { message: /Unexpected token/ }
    );

    // Valid JS still works
    input = '<script>  console.log( "test" );  </script>';
    result = await minify(input, { minifyJS: true });
    assert.strictEqual(result, '<script>console.log("test")</script>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));

    // Event attribute with valid JS (quote style may change during minification)
    input = '<button onclick="  alert( \'test\' )  ">Click</button>';
    result = await minify(input, { minifyJS: true });
    // Minifier may normalize quote styles
    assert.ok(result.includes('onclick='));
    assert.ok(result.includes('alert'));
    assert.ok(result.includes('test'));
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyJS: true }));
  });

  describe('Script body extraction', () => {
    const codesOf = (html) => extractScriptBodies(html).map(body => body.code);

    test('Collects executable scripts in document order', () => {
      assert.deepStrictEqual(
        codesOf('<script>var a = 1;</script><p>x</p><script>var b = 2;</script>'),
        ['var a = 1;', 'var b = 2;']
      );
    });

    test('Skips external and whitespace-only scripts', () => {
      assert.deepStrictEqual(codesOf('<script src="a.js"></script><script>  \n </script>'), []);
    });

    test('Skips data blocks, keeping executable types', () => {
      const input = '<script type="application/json">{"a":1}</script>' +
        '<script type="application/ld+json">{"b":2}</script>' +
        '<script type="text/template"><p>x</p></script>' +
        '<script type="text/javascript">var a = 1;</script>';

      assert.deepStrictEqual(codesOf(input), ['var a = 1;']);
    });

    test('Records a module as one', () => {
      assert.deepStrictEqual(
        extractScriptBodies('<script type="module">var a = 1;</script>'),
        [{ code: 'var a = 1;', isModule: true }]
      );
    });

    test('Keeps the same body in both script modes as two entries', () => {
      assert.deepStrictEqual(
        extractScriptBodies('<script>var a = 1;</script><script type="module">var a = 1;</script>'),
        [{ code: 'var a = 1;', isModule: false }, { code: 'var a = 1;', isModule: true }]
      );
    });

    test('Dispatches a repeated body once', () => {
      assert.deepStrictEqual(codesOf('<script>var a = 1;</script><script>var a = 1;</script>'), ['var a = 1;']);
    });

    test('Does not end the tag at a `>` inside an attribute value', () => {
      assert.deepStrictEqual(codesOf('<script data-x="a>b">var a = 1;</script>'), ['var a = 1;']);
    });

    test('Leaves markup that looks like script content alone', () => {
      assert.deepStrictEqual(codesOf('<p>var a = 1;</p><pre>&lt;script&gt;x&lt;/script&gt;</pre>'), []);
    });

    test('Collects exactly the bodies the minifier is asked to minify', async () => {
      const input = '<script>var a = 1;</script><script type="module">var b = 2;</script>' +
        '<script src="a.js"></script><script type="application/json">{"c":3}</script>';
      const asked = [];

      await minify(input, {
        mergeScripts: false,
        minifyJS: (code, inline) => {
          if (!inline && code.trim()) asked.push(code);
          return code;
        }
      });

      assert.deepStrictEqual(codesOf(input), asked);
    });

    test('Still ends the body at a closing tag carrying junk', () => {
      assert.deepStrictEqual(codesOf('<script>var a = 1;</script foo bar>'), ['var a = 1;']);
    });

    test('Does not end the body at a tag whose name only starts with `script`', () => {
      const body = 'var a = 1; // </scriptx>\nvar b = 2;';
      assert.deepStrictEqual(codesOf('<script>' + body + '</script>'), [body]);
    });

    test('Skips an unclosed script', () => {
      assert.deepStrictEqual(codesOf('<script>var a = 1;'), []);
      assert.deepStrictEqual(codesOf('<script>var a = 1;</script'), []);
    });

    test('Does not degrade to a quadratic scan on repeated `</script`', () => {
      const input = '<script>var a = 1;' + '</script'.repeat(20000);
      const start = performance.now();

      assert.deepStrictEqual(codesOf(input), []);
      assert.ok(performance.now() - start < 500, 'Extraction should stay linear in the input length');
    });

    test('Does not degrade to a quadratic scan on repeated `<script`', () => {
      const input = '<script '.repeat(20000);
      const start = performance.now();

      assert.deepStrictEqual(codesOf(input), []);
      assert.ok(performance.now() - start < 500, 'Extraction should stay linear in the input length');
    });
  });

  describe('`canMinifyJS`', () => {
    test('Leaves the JavaScript unminified on a `false` return', async () => {
      const input = '<script>function test() { let x = 1; return x; }</script>';
      assert.strictEqual(await minify(input, { minifyJS: true, canMinifyJS: () => false }), input);
      assert.strictEqual(
        await minify(input, { minifyJS: true, canMinifyJS: () => true }),
        '<script>function test(){return 1}</script>'
      );
    });

    test('Passes the JavaScript and whether it is inline to the hook', async () => {
      const received = [];
      const input = '<script>let a = 1;</script><script type="module">export const b = 2;</script><button onclick="let c = 3;">Click</button>';
      await minify(input, {
        minifyJS: true,
        canMinifyJS: (text, inline) => {
          received.push([text, inline]);
          return true;
        }
      });
      assert.deepStrictEqual(received, [
        ['let a = 1;', false],
        ['export const b = 2;', false],
        ['let c = 3;', true]
      ]);
    });

    test('Pieces of JavaScript are exempted individually', async () => {
      const input = '<script>function keep() { return 1; }</script><script>function skip() { return 2; }</script>';
      const result = await minify(input, {
        minifyJS: true,
        canMinifyJS: text => text.includes('keep')
      });
      assert.strictEqual(result, '<script>function keep(){return 1}</script><script>function skip() { return 2; }</script>');
    });

    test('Exempts event handlers by `inline`', async () => {
      const input = '<script>let x = 1;</script><button onclick="let y = 2;">Click</button>';
      const result = await minify(input, {
        minifyJS: true,
        canMinifyJS: (_, inline) => !inline
      });
      assert.strictEqual(result, '<script>let x=1</script><button onclick="let y = 2;">Click</button>');
    });

    test('Still merges exempted scripts under `mergeScripts`', async () => {
      const input = '<script>function keep() { return 1; }</script><script>function skip() { return 2; }</script>';
      const result = await minify(input, {
        minifyJS: true,
        mergeScripts: true,
        canMinifyJS: text => text.includes('keep')
      });
      assert.strictEqual(result, '<script>function keep(){return 1};function skip() { return 2; }</script>');
    });

    // SWC dispatches scripts in parallel before the parse reaches them
    test('Makes the same hook calls, with the same effect, under either engine', async () => {
      const input = '<script> var a = 1; console.log(a); </script><script> var b = 2; console.log(b); </script><button onclick="var c = 3;">Go</button>';
      for (const engine of ['terser', 'swc']) {
        const received = [];
        const result = await minify(input, {
          collapseWhitespace: true,
          minifyJS: { engine },
          mergeScripts: false,
          canMinifyJS: (text, inline) => {
            received.push([text, inline]);
            return !text.includes('b = 2');
          }
        });
        assert.deepStrictEqual(received, [
          ['var a = 1; console.log(a);', false],
          ['var b = 2; console.log(b);', false],
          ['var c = 3;', true]
        ], `${engine}: hook calls`);
        assert.strictEqual(result, '<script>var a=1;console.log(a)</script><script>var b = 2; console.log(b);</script><button onclick="var c=3">Go</button>', `${engine}: output`);
      }
    });

    test('Does not call the hook when `minifyJS` is a function', async () => {
      let calls = 0;
      const logs = [];
      const input = '<script>let x = 1;</script>';
      const result = await minify(input, {
        minifyJS: text => text.replace(/\s+/g, ''),
        canMinifyJS: () => {
          calls++;
          return false;
        },
        log: message => logs.push(String(message))
      });
      assert.strictEqual(result, '<script>letx=1;</script>');
      assert.strictEqual(calls, 0);
      assert.ok(logs.some(message => message.includes('canMinifyJS') && message.includes('function of your own')));
    });

    test('Reports setting the hook without `minifyJS`', async () => {
      const logs = [];
      await minify('<script>let x = 1;</script>', {
        canMinifyJS: () => true,
        log: message => logs.push(String(message))
      });
      assert.ok(logs.some(message => message.includes('canMinifyJS') && message.includes('minifyJS')));
    });

    test('Leaves the JavaScript unminified when the hook throws, or rejects without `continueOnMinifyError`', async () => {
      const input = '<script>let x = 1;</script><button onclick="let y = 2;">Click</button>';
      const canMinifyJS = () => { throw new Error('Hook failure'); };
      const logs = [];
      const result = await minify(input, {
        minifyJS: true,
        canMinifyJS,
        log: message => logs.push(String(message))
      });
      assert.strictEqual(result, input);
      assert.ok(logs.some(message => message.includes('Hook failure')));

      await assert.rejects(minify(input, { minifyJS: true, continueOnMinifyError: false, canMinifyJS }), /Hook failure/);
    });

    test('Treats a hook that returns a promise as an error, whether it resolves or rejects', async () => {
      const input = '<script>let x = 1;</script><button onclick="let y = 2;">Click</button>';
      for (const canMinifyJS of [async () => false, () => Promise.reject(new Error('Hook failure'))]) {
        const logs = [];
        const result = await minify(input, {
          minifyJS: true,
          canMinifyJS,
          log: message => logs.push(String(message))
        });
        assert.strictEqual(result, input, 'The JavaScript should be left unminified');
        assert.ok(logs.some(message => message.includes('`canMinifyJS` must return a boolean')));
        await assert.rejects(minify(input, { minifyJS: true, continueOnMinifyError: false, canMinifyJS }), TypeError);
      }
    });
  });

  describe('Deferred JS minification', () => {
    test('Keeps the results of multiple scripts in document order', async () => {
      const input = '<script>var a = 1; console.log(a);</script>' +
        '<script>var b = 2; console.log(b);</script>' +
        '<script>var c = 3; console.log(c);</script>';
      const output = '<script>var a=1;console.log(a)</script>' +
        '<script>var b=2;console.log(b)</script>' +
        '<script>var c=3;console.log(c)</script>';

      assert.strictEqual(await minify(input, { minifyJS: true, mergeScripts: false }), output);
    });

    test('Scripts sharing content resolve independently', async () => {
      const input = '<script>var a = 1; console.log(a);</script>' +
        '<p>x</p>' +
        '<script>var a = 1; console.log(a);</script>';
      const output = '<script>var a=1;console.log(a)</script>' +
        '<p>x</p>' +
        '<script>var a=1;console.log(a)</script>';

      assert.strictEqual(await minify(input, { minifyJS: true, mergeScripts: false }), output);
    });

    test('Treats a whitespace-only script as empty', async () => {
      assert.strictEqual(
        await minify('<script>   </script>', { minifyJS: true, removeEmptyElements: true }),
        ''
      );
    });

    test('Still emits a script that minifies away', async () => {
      // `removeEmptyElements` decides on the source text, so a comment-only script
      // survives as an empty element rather than being dropped
      assert.strictEqual(
        await minify('<script>/* just a comment */</script>', { minifyJS: true }),
        '<script></script>'
      );
    });

    test('Propagates minification errors with `continueOnMinifyError: false`', async () => {
      await assert.rejects(
        () => minify('<script>var = = =;</script>', { minifyJS: true, continueOnMinifyError: false }),
        { message: /Name expected/ }
      );
    });

    test('Swallows minification errors with `continueOnMinifyError`', async () => {
      const logged = [];
      const result = await minify(
        '<script>var a = 1;</script><script>var = = =;</script>',
        { minifyJS: true, mergeScripts: false, continueOnMinifyError: true, log: (err) => logged.push(err) }
      );

      assert.ok(result.includes('var a=1'), 'Valid script is still minified');
      assert.ok(result.includes('var = = =;'), 'Invalid script is passed through unchanged');
      assert.ok(logged.length > 0, 'Failure is reported through `log`');
    });

    test('Shows a user-supplied function each script exactly once', async () => {
      const seen = [];
      const input = '<script>var a = 1;</script><script>var b = 2;</script>';

      await minify(input, {
        mergeScripts: false,
        minifyJS: (code) => {
          seen.push(code);
          return code;
        }
      });

      assert.deepStrictEqual(seen, ['var a = 1;', 'var b = 2;']);
    });

    test('Combines `processScripts` with the batched engine', async () => {
      const scripts = '<script>var b = 1 ;</script><script>var c = 2 ;</script>';
      const options = { collapseWhitespace: true, minifyJS: { engine: 'swc' }, mergeScripts: false };

      assert.strictEqual(
        await minify('<script type="text/html"><div>  a  </div></script>' + scripts,
          { ...options, processScripts: ['text/html'] }),
        '<script type="text/html"><div>a</div></script><script>var b=1</script><script>var c=2</script>'
      );

      // An executable type is the case that reaches both the markup and the JS step
      assert.strictEqual(
        await minify('<script type="text/javascript"><div>  a  </div></script>' + scripts,
          { ...options, processScripts: ['text/javascript'] }),
        '<script type="text/javascript"><div>a</div></script><script>var b=1</script><script>var c=2</script>'
      );
    });

    test('Keeps deferred results through whitespace collapsing around scripts', async () => {
      const input = '<div>\n  <script>var a = 1; console.log(a);</script>\n  <p>text</p>\n</div>';
      const output = '<div><script>var a=1;console.log(a)</script><p>text</p></div>';

      assert.strictEqual(await minify(input, { minifyJS: true, collapseWhitespace: true }), output);
    });
  });
});