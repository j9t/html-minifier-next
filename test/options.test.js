import fs from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';
import { optionDependencies, processOptions } from '../src/lib/options.js';
import { optionDefinitions } from '../src/lib/option-definitions.js';
import { buildConfigSchema } from '../scripts/build-schema.js';

const schemaOnDisk = JSON.parse(
  fs.readFileSync(new URL('../html-minifier-next.schema.json', import.meta.url), 'utf8')
);
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');

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

  // `removeUnusedCSS`, whose prerequisite can be set and still unusable, is covered in css+js.test.js
  describe('Option dependencies', () => {
    test('Every entry names options that exist', () => {
      for (const { option, requires } of optionDependencies) {
        assert.ok(Object.hasOwn(optionDefinitions, option), `\`${option}\` is not an option`);
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

    test('A minifier asked for but not loadable counts as absent', async () => {
      // `minifyCSS` settles to a no-op when Lightning CSS cannot be loaded, and unused-CSS
      // removal rides along with it—so the dependency is unmet even though the user set it
      const logs = [];
      const options = processOptions(
        { minifyCSS: true, removeUnusedCSS: true, log: message => logs.push(String(message)) },
        { getLightningCSS: undefined, cssMinifyCache: undefined }
      );

      assert.strictEqual(options.removeUnusedCSS, null, 'Removal should be switched off, not left to run without a minifier');
      assert.ok(
        logs.some(message => message.includes('`removeUnusedCSS`') && message.includes('`minifyCSS`')),
        'Silently doing nothing would be the surprise, so it should warn'
      );
    });

    test('Cache sizes never warn—they configure a cache rather than transform markup', async () => {
      assert.deepStrictEqual(await warningsFor('<p>x</p>', { cacheCSS: 300, cacheJS: 300, cacheSVG: 300 }), []);
    });
  });
});