import fs from 'fs';
import { describe, test } from 'node:test';
import assert from 'node:assert';
import { buildConfigSchema } from '../scripts/build-schema.js';
import { optionDefinitions } from '../src/lib/option-definitions.js';

const schemaOnDisk = JSON.parse(
  fs.readFileSync(new URL('../html-minifier-next.schema.json', import.meta.url), 'utf8')
);

describe('JSON Schema', () => {
  test('Checked-in schema is in sync with the option definitions (regenerate via `npm run build:schema`)', () => {
    assert.deepStrictEqual(schemaOnDisk, buildConfigSchema());
  });

  test('Schema covers every option definition', () => {
    for (const key of Object.keys(optionDefinitions)) {
      assert.ok(key in schemaOnDisk.properties, `Missing schema property for option “${key}”`);
    }
  });

  test('Every schema property has a description', () => {
    for (const [key, property] of Object.entries(schemaOnDisk.properties)) {
      assert.ok(typeof property.description === 'string' && property.description.length, `Missing description for schema property “${key}”`);
    }
  });
});