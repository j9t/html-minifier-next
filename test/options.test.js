import fs from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';
import { optionDependencies, optionKeysExtra, processOptions } from '../src/lib/options.js';
import { optionDefinitions } from '../src/lib/option-definitions.js';
import { MISSING_DEPENDENCY } from '../src/lib/constants.js';
import { buildConfigSchema } from '../scripts/build-schema.js';

const schemaOnDisk = JSON.parse(
  fs.readFileSync(new URL('../html-minifier-next.schema.json', import.meta.url), 'utf8')
);
// Normalized since a Windows checkout carries CRLF and the parsing is line-anchored
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Warnings are emitted once per message per process, so every case here uses a
// distinct option pair and each pair is asserted exactly once
const warningsFor = async (input, options) => {
  const logs = [];
  await minify(input, { ...options, log: message => logs.push(String(message)) });
  return logs.filter(message => message.includes('Ignoring'));
};

describe('Options', () => {
  describe('Definitions and schema', () => {
    test('Checked-in schema is in sync with the option definitions (regenerate via `npm run build:schema`)', () => {
      assert.deepStrictEqual(schemaOnDisk, buildConfigSchema());
    });

    test('Schema covers every option definition', () => {
      for (const key of Object.keys(optionDefinitions)) {
        assert.ok(key in schemaOnDisk.properties, `Missing schema property for option \`${key}\``);
      }
    });

    test('Every schema property has a type or enum (catches option types missing from the generator)', () => {
      for (const [key, property] of Object.entries(schemaOnDisk.properties)) {
        assert.ok(property.type || property.enum, `Missing type mapping for schema property \`${key}\``);
      }
    });

    test('Every schema property has a description', () => {
      for (const [key, property] of Object.entries(schemaOnDisk.properties)) {
        assert.ok(typeof property.description === 'string' && property.description.length, `Missing description for schema property \`${key}\``);
      }
    });
  });

  // `removeUnusedCSS`, whose prerequisite can be set and still unusable, is
  // covered in css.test.js
  describe('Option dependencies', () => {
    test('Every entry names options that exist', () => {
      for (const { option, requires } of optionDependencies) {
        assert.ok(Object.hasOwn(optionDefinitions, option) || optionKeysExtra.has(option), `\`${option}\` is not an option`);
        assert.ok(Object.hasOwn(optionDefinitions, requires), `\`${requires}\`, needed by \`${option}\`, is not an option`);
      }
    });

    test('The README table lists the same dependencies, and no others', () => {
      // Found by its header row rather than by heading text, and stopped at the blank
      // line that ends it, so that neither a renamed heading nor a later table interferes
      const table = readme.split(/^\| Option \| Needs \|\n\| --- \| --- \|\n/m)[1]?.split('\n\n')[0] ?? '';
      const documented = [...table.matchAll(/^\| `(\w+)` \| (.+?) \|$/gm)];
      assert.deepStrictEqual(
        documented.map(([, option]) => option),
        optionDependencies.map(({ option }) => option),
        'README rows should match the table, in the same order'
      );
      for (const [index, [, option, needs]] of documented.entries()) {
        assert.ok(needs.includes(`\`${optionDependencies[index].requires}\``), `The README row for \`${option}\` should name what it needs`);
      }
    });

    test('An option that needs another one says so when it is missing', async () => {
      const cases = [
        ['collapseInlineTagWhitespace', { collapseInlineTagWhitespace: true }, 'collapseWhitespace', '--collapse-whitespace'],
        ['collapseNoBreakSpaces', { collapseNoBreakSpaces: true }, 'collapseWhitespace', '--collapse-whitespace'],
        ['conservativeCollapse', { conservativeCollapse: true }, 'collapseWhitespace', '--collapse-whitespace'],
        ['preserveLineBreaks', { preserveLineBreaks: true }, 'collapseWhitespace', '--collapse-whitespace'],
        ['trimCustomFragments', { trimCustomFragments: true }, 'collapseWhitespace', '--collapse-whitespace'],
        ['inlineCustomElements', { inlineCustomElements: ['custom-element'] }, 'collapseWhitespace', '--collapse-whitespace'],
        ['noNewlinesBeforeTagClose', { noNewlinesBeforeTagClose: true }, 'maxLineLength', '--max-line-length'],
        ['removeEmptyElementsExcept', { removeEmptyElementsExcept: ['td'] }, 'removeEmptyElements', '--remove-empty-elements'],
        ['customEventAttributes', { customEventAttributes: [/^ng-/] }, 'minifyJS', '--minify-js']
      ];

      for (const [option, options, requires, flag] of cases) {
        const warnings = await warningsFor('<p>x</p>', options);
        assert.strictEqual(warnings.length, 1, `\`${option}\` alone should warn`);
        assert.ok(warnings[0].includes(`\`${option}\``), `The warning should name \`${option}\``);
        assert.ok(warnings[0].includes(`\`${requires}\``), `The warning should name \`${requires}\``);
        assert.ok(warnings[0].includes(flag), `The warning should name the flag a CLI user would reach for (${flag})`);

        // Batch runs would otherwise flood STDERR with the same line
        assert.deepStrictEqual(await warningsFor('<p>x</p>', options), [], `\`${option}\` should warn once per process`);
      }
    });

    test('An option paired with the one it needs stays quiet', async () => {
      const cases = [
        { collapseInlineTagWhitespace: true, collapseWhitespace: true },
        { collapseNoBreakSpaces: true, collapseWhitespace: true },
        { conservativeCollapse: true, collapseWhitespace: true },
        { preserveLineBreaks: true, collapseWhitespace: true },
        { trimCustomFragments: true, collapseWhitespace: true },
        { inlineCustomElements: ['custom-element'], collapseWhitespace: true },
        { noNewlinesBeforeTagClose: true, maxLineLength: 20 },
        { removeEmptyElementsExcept: ['td'], removeEmptyElements: true },
        { customEventAttributes: [/^ng-/], minifyJS: true }
      ];

      for (const options of cases) {
        assert.deepStrictEqual(await warningsFor('<p>x</p>', options), [], `${Object.keys(options)[0]} should not warn`);
      }
    });

    test('An option left off, or handed an empty array, asks for nothing', async () => {
      assert.deepStrictEqual(await warningsFor('<p>x</p>', { conservativeCollapse: false }), []);
      assert.deepStrictEqual(await warningsFor('<p>x</p>', { inlineCustomElements: [] }), []);
      assert.deepStrictEqual(await warningsFor('<p>x</p>', { maxLineLength: 0, noNewlinesBeforeTagClose: false }), []);
    });

    test('A preset that pairs the options itself stays quiet', async () => {
      assert.deepStrictEqual(await warningsFor('<p>x</p>', { preset: 'conservative' }), []);
      assert.deepStrictEqual(await warningsFor('<p>x</p>', { preset: 'comprehensive' }), []);
    });

    test('Cache sizes never warn—they configure a cache rather than transform markup', async () => {
      assert.deepStrictEqual(await warningsFor('<p>x</p>', { cacheCSS: 300, cacheJS: 300, cacheSVG: 300 }), []);
    });
  });

  describe('Optional engines', () => {
    const swcNotInstalled = async () => {
      const err = new Error('The SWC minifier requires @swc/core to be installed.');
      err.code = MISSING_DEPENDENCY;
      throw err;
    };

    test('An engine that is not installed is reported, however errors are handled', async () => {
      for (const continueOnMinifyError of [true, false]) {
        const options = processOptions(
          { minifyJS: { engine: 'swc' }, continueOnMinifyError },
          { getTerser: async () => ({}), getSwc: swcNotInstalled, jsMinifyCache: new Map() }
        );

        await assert.rejects(
          async () => await options.minifyJS('var a = 1;', false),
          /requires @swc\/core/,
          `Asking for an engine that is missing is a configuration error (\`continueOnMinifyError: ${continueOnMinifyError}\`)`
        );
      }
    });

    test('A minification error is still tolerated', async () => {
      const script = 'var a = 1;';
      const options = processOptions(
        { minifyJS: { engine: 'swc' }, continueOnMinifyError: true },
        {
          getTerser: async () => ({}),
          getSwc: async () => ({ minify: async () => { throw new Error('Unexpected token'); } }),
          jsMinifyCache: new Map()
        }
      );

      assert.strictEqual(await options.minifyJS(script, false), script, 'Content the engine chokes on should pass through as before');
    });
  });

  test('Applies presets', async () => {
    const { getPreset } = await import('../src/presets.js');

    // With conservative preset
    let input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html>\n  <head>\n    <!-- Comment -->\n    <script type="application/ld+json">\n{\n  "name": "Test",\n  "url": "https://example.com/page"\n}\n    </script>\n  </head>\n</html>';
    const conservativeResult = await minify(input, getPreset('conservative'));
    // Conservative preset should: remove comments, use short doctype, leave JSON as is
    assert.ok(!conservativeResult.includes('<!-- Comment -->'), 'Conservative: Should remove comments');
    assert.ok(conservativeResult.includes('<!doctype html>'), 'Conservative: Should use short doctype');
    assert.ok(conservativeResult.includes('{\n  "name": "Test",\n  "url": "https://example.com/page"\n}'), 'Conservative: Should leave JSON as is');

    // With comprehensive preset
    input = '<script type="importmap">\n{\n  "imports": {\n    "vue": "https://cdn.example.com/vue.js"\n  }\n}\n</script>';
    const comprehensiveResult = await minify(input, getPreset('comprehensive'));
    // Comprehensive preset should: minify JSON, collapse whitespace, remove quotes from
    // attributes where possible
    assert.ok(comprehensiveResult.includes('{"imports":{"vue":"https://cdn.example.com/vue.js"}}'), 'Comprehensive: Should minify JSON');
    assert.ok(comprehensiveResult.includes('type=importmap'), 'Comprehensive: Should remove attribute quotes');

    // JSON minification is opt-in
    input = '<script type="application/json">{\n  "test": "value"\n}</script>';
    const noOptionsResult = await minify(input, {});
    assert.strictEqual(noOptionsResult, input, 'No options: Should leave JSON as is');

    // Preset as option key (should work the same as spreading `getPreset`)
    input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">\n<html>\n  <head>\n    <!-- Comment -->\n  </head>\n</html>';
    const presetOptionResult = await minify(input, { preset: 'conservative' });
    const spreadPresetResult = await minify(input, getPreset('conservative'));
    assert.strictEqual(presetOptionResult, spreadPresetResult, 'Using preset option should produce same result as spreading getPreset()');
    assert.ok(!presetOptionResult.includes('<!-- Comment -->'), 'Preset option: Should apply preset settings');

    // Preset with overrides (user options should override preset)
    input = '<!DOCTYPE html>\n<html>\n  <head>\n    <!-- Comment -->\n  </head>\n</html>';
    const presetWithOverride = await minify(input, { preset: 'conservative', removeComments: false });
    assert.ok(presetWithOverride.includes('<!-- Comment -->'), 'User option should override preset setting');

    // Unknown preset emits warning (once per preset name per process)
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

  describe('Object-valued options handed a string', () => {
    // `'false'` must not switch minification on: Any non-empty string is truthy, and these options
    // read a non-object as `{}`
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

  // Combined tests
  test('Applies `minifyJS` and `minifyCSS` together', async () => {
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

  test('`canMinifyCSS` and `canMinifyJS` work together, and with `collapseWhitespace`', async () => {
    const input = `
      <style>
        .a { color: red; }
      </style>
      <style>
        .b { color: blue; }
      </style>
      <script>
        let x = 1;
      </script>
      <script>
        let y = 2;
      </script>
    `;
    const result = await minify(input, {
      minifyCSS: true,
      minifyJS: true,
      collapseWhitespace: true,
      canMinifyCSS: text => text.includes('.a'),
      canMinifyJS: text => text.includes('x = 1')
    });
    assert.strictEqual(result, '<style>.a{color:red}</style><style>.b { color: blue; }</style><script>let x=1</script><script>let y = 2;</script>');
  });
});