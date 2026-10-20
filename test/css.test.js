import { describe, test } from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';
import { collectUsedSymbols } from '../src/lib/unused-css.js';

describe('CSS', () => {
  test('Minifies CSS', async () => {
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

  test('Minifies `style` attributes', async () => {
    const input = '<div style="color: red; background-color: yellow; font-family: Verdana, Arial, sans-serif;"></div>';
    const output = '<div style="color:red;background-color:#ff0;font-family:Verdana,Arial,sans-serif"></div>';
    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  // Tests for minifyCSS configuration options
  test('Minifies with `minifyCSS: true`', async () => {
    const input = '<style>body { color: red; font-size: 12px; }</style>';
    const output = '<style>body{color:red;font-size:12px}</style>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('Applies custom options', async () => {
    const input = '<style>.a { &.b { color: red; } }</style>';

    // Lightning CSS keeps nesting by default and lowers it for targets that predate it
    // (versions are encoded as `major << 16`)
    assert.strictEqual(await minify(input, { minifyCSS: true }), '<style>.a{&.b{color:red}}</style>');
    assert.strictEqual(
      await minify(input, { minifyCSS: { targets: { chrome: 80 << 16 } } }),
      '<style>.a.b{color:red}</style>'
    );
  });

  test('Minifies an inline `style` attribute', async () => {
    const input = '<div style="  color: red;  margin: 10px;  "></div>';
    const output = '<div style="color:red;margin:10px"></div>';

    assert.strictEqual(await minify(input, { minifyCSS: true }), output);
  });

  test('Preserves important comments', async () => {
    const input = '<style>/*! Important license */ body { color: red; }</style>';
    // Lightning CSS preserves `/*!` comments by default, followed by a line break
    assert.strictEqual(await minify(input, { minifyCSS: true }), '<style>/*! Important license */\nbody{color:red}</style>');
  });

  test('Works with `collapseWhitespace`', async () => {
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

  test('Minifies media queries', async () => {
    const input = '<link rel="stylesheet" media="  screen  and  ( min-width: 768px )  " href="style.css">';
    const result = await minify(input, { minifyCSS: true });

    // Media query should be minified
    assert.ok(!result.includes('  screen  '), 'Extra spaces should be removed from media query');
    assert.ok(result.includes('screen'), 'Media type should be preserved');
  });

  test('Removes invalid and empty CSS in `style` attributes', async () => {
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

  test('Handles CSS minification errors', async () => {
    // Invalid CSS syntax—should attempt to minify or preserve original
    let input = '<style>body { color: #invalid!!! }</style>';
    let result = await minify(input, { minifyCSS: true });
    assert.ok(result.includes('<style>'));
    assert.ok(result.includes('</style>'));
    // Should crash with continueOnMinifyError: false
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected token/ }
    );

    // Completely malformed CSS
    input = '<style>this is not valid css at all { { { </style>';
    result = await minify(input, { minifyCSS: true });
    assert.ok(result.includes('<style>'));
    assert.ok(result.includes('</style>'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected end of input/ }
    );

    // CSS with unclosed braces
    input = '<style>body { color: red;</style>';
    result = await minify(input, { minifyCSS: true });
    assert.ok(result.includes('style'));
    // Lightning CSS handles unclosed braces without error, even with `errorRecovery: false`
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));

    // Empty `style` element
    input = '<style></style>';
    result = await minify(input, { minifyCSS: true, removeEmptyElements: false });
    assert.strictEqual(result, '<style></style>');
    await assert.doesNotReject(minify(input, {
      continueOnMinifyError: false,
      minifyCSS: true,
      removeEmptyElements: false
    }));

    // `style` attribute with invalid CSS
    input = '<div style="color: #invalid!!!">Test</div>';
    result = await minify(input, { minifyCSS: true });
    assert.ok(result.includes('div'));
    assert.ok(result.includes('Test'));
    await assert.rejects(
      minify(input, { continueOnMinifyError: false, minifyCSS: true }),
      { message: /Unexpected token/ }
    );

    // Valid CSS still works
    input = '<style>  body { color: red; }  </style>';
    result = await minify(input, { minifyCSS: true });
    assert.strictEqual(result, '<style>body{color:red}</style>');
    await assert.doesNotReject(minify(input, { continueOnMinifyError: false, minifyCSS: true }));
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

  // Unused-CSS removal tests
  describe('Unused CSS removal', () => {
    const style = css => `<!doctype html><html><head><style>${css}</style></head><body>`;
    const styleOf = html => (html.match(/<style>([\s\S]*?)<\/style>/) ?? ['', ''])[1];

    test('Removes rules the document doesn’t reference', async () => {
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
        logs.some(message => message.includes('removeUnusedCSS') && message.includes('use with')),
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

    test('Keeps symbols named in foreign scripts as HTML reads them', async () => {
      // In SVG and MathML, `script` content resolves character references
      const input = style('.js-only{color:red}') +
        '<p></p><svg><script>document.body.classList.add("js-&#111;nly")</script></svg>';
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });
      assert.ok(styleOf(output).includes('.js-only'), 'Decoded foreign script references should be kept');
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
      // The style sheet is what turns removal on; without one, nothing would be exercised
      const input = style('.used{color:red}.unused{color:red}') +
        '<p style="color:red" class="used"></p><link media="(min-width:0)" rel="stylesheet" href="a.css">';
      const baseline = await minify(input, { minifyCSS: true });
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });
      const withoutSheet = html => html.replace(/<style>[\s\S]*?<\/style>/, '');

      assert.ok(!styleOf(output).includes('.unused'), 'Unreferenced class should be removed');
      // Attributes carry declarations and media queries, never selectors
      assert.strictEqual(withoutSheet(output), withoutSheet(baseline));
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
      // `\FFFFFF` exceeds the maximum code point; per CSS Syntax it resolves to `U+FFFD`
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
      // `U+0130` lowercases to two code units, which would shift every later offset—and
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
        ['#grad>*{stop-color:red}', '<svg><rect fill="url(#grad)"/></svg>', '#grad'],
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

      // Nothing references these, so the widened scan must not keep them, either
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
      assert.ok(output.includes('.t'), 'A class on the element itself counts, too');
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

    test('Recognizes classes and IDs that follow an element name', async () => {
      const input = style('p.unused{color:red}ul#gone li{color:red}body.used p.used{color:blue}') + '<p class="used"></p>';
      assert.strictEqual(
        styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: true })),
        'body.used p.used{color:#00f}'
      );
    });

    test('Removes unused selectors from a list and keeps the rule for the rest', async () => {
      const options = { minifyCSS: true, removeUnusedCSS: true };

      assert.strictEqual(
        styleOf(await minify(style('.used,.unused,#gone .used{color:red}') + '<p class="used"></p>', options)),
        '.used{color:red}'
      );
      assert.strictEqual(
        styleOf(await minify(style('@media print{.used,.unused{margin:0}}.a{&.unused,&.used{color:red}}') + '<p class="a used"></p>', options)),
        '@media print{.used{margin:0}}.a{&.used{color:red}}'
      );
      assert.strictEqual(
        styleOf(await minify(style('.used,.js-late{color:red}') + '<p class="used"></p>', { minifyCSS: true, removeUnusedCSS: { safelist: [/^js-/] } })),
        '.used,.js-late{color:red}'
      );
    });

    test('Leaves names inside pseudo-class and pseudo-element arguments alone', async () => {
      // `:not(.unused)` matches everything, and the others are not this document’s to judge
      const sheet = '.used:not(.unused){color:red}:is(.unused,.used){color:red}.used:has(.unused){color:red}:host(.unused){color:red}::slotted(.unused){color:red}';
      const output = styleOf(await minify(style(sheet) + '<p class="used"></p>', { minifyCSS: true, removeUnusedCSS: true }));

      for (const selector of ['.used:not(.unused)', ':is(.unused,.used)', '.used:has(.unused)', ':host(.unused)', '::slotted(.unused)']) {
        assert.ok(output.includes(selector), `${selector} should be kept (got ${output})`);
      }
    });

    test('Removes selectors for elements the document does not contain', async () => {
      const options = { minifyCSS: true, removeUnusedCSS: true };

      assert.strictEqual(
        styleOf(await minify(style('p,dialog{color:red}h6{color:red}') + '<p></p>', options)),
        'p{color:red}'
      );

      // Elements the parser supplies count, whether or not the markup spells them out
      const implied = 'html{font-size:62.5%}head{display:none}body{margin:0}table tbody tr td{padding:0}colgroup{width:1px}';
      assert.strictEqual(
        styleOf(await minify(`<style>${implied}</style><table><col><td>x</table>`, options)),
        implied
      );

      // Element names are compared case-insensitively, and SVG’s mixed-case ones keep their rules
      assert.strictEqual(
        styleOf(await minify(style('P{color:red}linearGradient{color:red}') + '<p></p><svg><linearGradient/></svg>', options)),
        'P,linearGradient{color:red}'
      );
    });

    test('Keys cached results to the elements the document contains', async () => {
      const sheet = style('p,dialog{color:red}');
      assert.strictEqual(styleOf(await minify(sheet + '<p></p>', { minifyCSS: true, removeUnusedCSS: true })), 'p{color:red}');
      assert.strictEqual(styleOf(await minify(sheet + '<p></p><dialog></dialog>', { minifyCSS: true, removeUnusedCSS: true })), 'p,dialog{color:red}');
    });

    test('Keeps selectors for safelisted elements, after the same sheet was minified without them', async () => {
      // The CSS cache outlives a `minify()` call, so the safelist has to tell results apart
      const input = style('p,dialog{color:red}') + '<p></p>';

      assert.strictEqual(styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: true })), 'p{color:red}');
      assert.strictEqual(styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: { safelist: ['dialog'] } })), 'p,dialog{color:red}');
      assert.strictEqual(styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: { safelist: [/^dia/] } })), 'p,dialog{color:red}');
    });

    test('Keeps selectors for elements named in inline scripts unless `scripts` is disabled', async () => {
      const input = style('dialog{color:red}') + '<p></p><script>document.body.append(document.createElement("dialog"))</script>';

      assert.strictEqual(styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: true })), 'dialog{color:red}');
      assert.strictEqual(styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: { scripts: false } })), '');
    });

    test('Compares element names from inline scripts case-insensitively', async () => {
      const options = { minifyCSS: true, removeUnusedCSS: true };
      const script = '<script>document.body.append(document.createElement("DIALOG"))</script>';

      assert.strictEqual(styleOf(await minify(style('dialog{color:red}') + '<p></p>' + script, options)), 'dialog{color:red}');
      assert.strictEqual(styleOf(await minify(style('Dialog{color:red}') + '<p></p>' + script, options)), 'Dialog{color:red}');
    });

    test('Keeps parser-supplied table elements when an inline script names a table', async () => {
      const input = style('tbody{color:red}tr{color:red}colgroup{color:red}') +
        '<p></p><script>const t = document.createElement("TABLE"), c = document.createElement("col")</script>';
      const output = styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: true }));

      assert.strictEqual(output, 'tbody,tr,colgroup{color:red}');
    });

    test('Keeps selectors for elements named in foreign scripts as HTML reads them', async () => {
      const input = style('dialog{color:red}') + '<p></p><svg><script>document.createElement("di&#97;log")</script></svg>';
      assert.strictEqual(styleOf(await minify(input, { minifyCSS: true, removeUnusedCSS: true })), 'dialog{color:red}');
    });

    test('Does not leak one document’s script-named elements into another through the CSS cache', async () => {
      const sheet = style('p{color:red}dialog{color:red}');
      const options = { minifyCSS: true, removeUnusedCSS: true };

      assert.strictEqual(styleOf(await minify(sheet + '<p></p><script>x("dialog")</script>', options)), 'p,dialog{color:red}');
      assert.strictEqual(styleOf(await minify(sheet + '<p></p><script>x("other")</script>', options)), 'p{color:red}');
      assert.strictEqual(styleOf(await minify(sheet + '<p></p><script>x("dialog")</script>', options)), 'p,dialog{color:red}');
    });

    test('Does not count an element as evidence for a class of the same name, or vice versa', async () => {
      const output = styleOf(await minify(style('.header{color:red}header{color:blue}') + '<header></header>', { minifyCSS: true, removeUnusedCSS: true }));
      assert.strictEqual(output, 'header{color:#00f}');

      const reverse = styleOf(await minify(style('.footer{color:red}footer{color:blue}') + '<p class="footer"></p>', { minifyCSS: true, removeUnusedCSS: true }));
      assert.strictEqual(reverse, '.footer{color:red}');
    });

    test('Leaves selector lists in `@scope` style sheets alone', async () => {
      // Dropping a scope limit would widen the scope, not narrow it
      const sheet = '@scope (.used) to (.unused){p{color:red}}.used,.other{color:red}';
      const output = styleOf(await minify(style(sheet) + '<div class="used"><p></p></div>', { minifyCSS: true, removeUnusedCSS: true }));

      assert.ok(output.includes('to (.unused)'), `The scope limit should be kept (got ${output})`);
    });

    test('Does not leak one document’s elements into another through the CSS cache', async () => {
      const sheet = 'p{color:red}dialog{color:red}';
      const options = { minifyCSS: true, removeUnusedCSS: true };

      assert.strictEqual(styleOf(await minify(style(sheet) + '<p></p>', options)), 'p{color:red}');
      assert.strictEqual(styleOf(await minify(style(sheet) + '<p></p><dialog></dialog>', options)), 'p,dialog{color:red}');
    });

    test('Keeps what an `iframe srcdoc` document references', async () => {
      // `srcdoc` holds a document of its own, and its style sheets are minified
      // against its own symbol set
      const quote = String.fromCharCode(39);
      const input = style('.outer{color:red}') + '<p class="outer"></p>' +
        `<iframe srcdoc=${quote}<style>.inner{color:blue}.gone{color:red}</style><p class="inner">hi</p>${quote}></iframe>`;
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(output.includes('.inner'), 'A class the nested document uses should survive');
      assert.ok(!output.includes('.gone'), 'A class nothing uses should still go');
      assert.ok(output.includes('.outer'), 'The outer document should be unaffected');
    });

    test('Scopes `iframe srcdoc` style sheets to the nested document', async () => {
      // Parent styles do not reach into the nested browsing context, and vice
      // versa: A parent rule only the `srcdoc` uses goes, the `srcdoc`’s own stays
      const quote = String.fromCharCode(39);
      const input = style('.outer{color:red}.inner{color:green}') + '<p class="outer"></p>' +
        `<iframe srcdoc=${quote}<style>.inner{color:blue}</style><p class="inner">hi</p>${quote}></iframe>`;
      const output = await minify(input, { minifyCSS: true, removeUnusedCSS: true });

      assert.ok(!output.includes('color:green'), 'A parent rule only the nested document references should go');
      assert.ok(output.includes('color:#00f'), 'The nested document’s own rule should stay');
      assert.ok(output.includes('color:red'), 'The parent’s referenced rule should stay');
    });

    test('Reads an entity-encoded `srcdoc` document', async () => {
      // Without a literal style element in the parent, the symbols come from the
      // decoded `srcdoc` markup alone
      const output = await minify(
        '<iframe srcdoc="&lt;style&gt;.used{color:red}.gone{color:blue}&lt;/style&gt;&lt;p class=&#39;used&#39;&gt;x&lt;/p&gt;"></iframe>',
        { minifyCSS: true, removeUnusedCSS: true }
      );

      assert.ok(output.includes('.used'), 'A class the nested document uses should survive');
      assert.ok(!output.includes('.gone'), 'A class nothing uses should still go');
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

  describe('`canMinifyCSS`', () => {
    test('A `false` return leaves the CSS unminified', async () => {
      const input = '<style>body { color: red; font-size: 12px; }</style>';
      assert.strictEqual(await minify(input, { minifyCSS: true, canMinifyCSS: () => false }), input);
      assert.strictEqual(
        await minify(input, { minifyCSS: true, canMinifyCSS: () => true }),
        '<style>body{color:red;font-size:12px}</style>'
      );
    });

    test('The hook receives the CSS and its type', async () => {
      const received = [];
      const input = '<style>body { color: red; }</style><p style="margin: 0;"></p><link rel="stylesheet" href="a.css" media="screen and (min-width: 100px)">';
      await minify(input, {
        minifyCSS: true,
        canMinifyCSS: (text, type) => {
          received.push([text, type]);
          return true;
        }
      });
      assert.deepStrictEqual(received, [
        ['body { color: red; }', undefined],
        ['margin: 0;', 'inline'],
        ['screen and (min-width: 100px)', 'media']
      ]);
    });

    test('Pieces of CSS are exempted individually', async () => {
      const input = '<style>.keep { color: red; }</style><style>.skip { color: blue; }</style>';
      const result = await minify(input, {
        minifyCSS: true,
        canMinifyCSS: text => text.includes('.keep')
      });
      assert.strictEqual(result, '<style>.keep{color:red}</style><style>.skip { color: blue; }</style>');
    });

    test('Attributes are exempted by type', async () => {
      const input = '<div style="color: red; font-size: 12px;"></div><link rel="stylesheet" href="a.css" media="screen and (min-width: 100px)"><style>body { color: blue; }</style>';
      const result = await minify(input, {
        minifyCSS: true,
        canMinifyCSS: (_, type) => type === 'inline'
      });
      assert.strictEqual(result, '<div style="color:red;font-size:12px"></div><link rel="stylesheet" href="a.css" media="screen and (min-width: 100px)"><style>body { color: blue; }</style>');
    });

    test('Exempted CSS keeps its URLs and unused rules', async () => {
      const input = '<style>.a { background: url(https://example.com/x/a.png); } .unused { color: red; }</style><div class="a" style="background: url(https://example.com/x/b.png)"></div>';
      const options = { minifyCSS: true, minifyURLs: 'https://example.com/x/', removeUnusedCSS: true };
      assert.strictEqual(
        await minify(input, options),
        '<style>.a{background:url(a.png)}</style><div class="a" style="background:url(b.png)"></div>'
      );
      assert.strictEqual(await minify(input, { ...options, canMinifyCSS: () => false }), input);
    });

    test('The hook is not called when `minifyCSS` is a function', async () => {
      let calls = 0;
      const logs = [];
      const input = '<style>body { color: red; }</style>';
      const result = await minify(input, {
        minifyCSS: text => text.replace(/\s+/g, ''),
        canMinifyCSS: () => {
          calls++;
          return false;
        },
        log: message => logs.push(String(message))
      });
      assert.strictEqual(result, '<style>body{color:red;}</style>');
      assert.strictEqual(calls, 0);
      assert.ok(logs.some(message => message.includes('canMinifyCSS') && message.includes('function of your own')));
    });

    test('Setting the hook without `minifyCSS` is reported', async () => {
      const logs = [];
      await minify('<style>body { color: red; }</style>', {
        canMinifyCSS: () => true,
        log: message => logs.push(String(message))
      });
      assert.ok(logs.some(message => message.includes('canMinifyCSS') && message.includes('minifyCSS')));
    });

    test('A hook that throws leaves the CSS unminified, or rejects without `continueOnMinifyError`', async () => {
      const input = '<style>body { color: red; }</style>';
      const canMinifyCSS = () => { throw new Error('Hook failure'); };
      const logs = [];
      const result = await minify(input, {
        minifyCSS: true,
        canMinifyCSS,
        log: message => logs.push(String(message))
      });
      assert.strictEqual(result, input);
      assert.ok(logs.some(message => message.includes('Hook failure')));

      await assert.rejects(minify(input, { minifyCSS: true, continueOnMinifyError: false, canMinifyCSS }), /Hook failure/);
    });

    test('A hook that returns a promise is an error, whether it resolves or rejects', async () => {
      const input = '<style>body { color: red; }</style>';
      for (const canMinifyCSS of [async () => false, () => Promise.reject(new Error('Hook failure'))]) {
        const logs = [];
        const result = await minify(input, {
          minifyCSS: true,
          canMinifyCSS,
          log: message => logs.push(String(message))
        });
        assert.strictEqual(result, input, 'The CSS should be left unminified');
        assert.ok(logs.some(message => message.includes('`canMinifyCSS` must return a boolean')));
        await assert.rejects(minify(input, { minifyCSS: true, continueOnMinifyError: false, canMinifyCSS }), TypeError);
      }
    });
  });
});