// Generate JSON Schema for HMN configuration files (html-minifier-next.schema.json)
// from shared option definitions—run via `npm run build:schema`

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { optionDefinitions } from '../src/lib/option-definitions.js';
import { getPresetNames } from '../src/presets.js';

const schemaPath = fileURLToPath(new URL('../html-minifier-next.schema.json', import.meta.url));

// Map option definition types to JSON Schema fragments; the schema describes
// the JSON configuration file format, not the programmatic API—regexes are
// expressed as strings (e.g., `"/ng-class/"` or `"ng-class"`), and options
// that take functions are not available in JSON at all
const typeSchemas = {
  boolean: { type: 'boolean' },
  invertedBoolean: { type: 'boolean' },
  int: { type: 'integer', minimum: 0 },
  string: { type: 'string' },
  regexp: { type: 'string' },
  regexpArray: { type: ['string', 'array'], items: { type: 'string' } },
  json: { type: ['boolean', 'string', 'object'] },
  jsonArray: { type: ['string', 'array'], items: { type: 'string' } }
};

// Keys that are valid in config files but not part of `optionDefinitions`
// (mirrors `CONFIG_KEYS_EXTRA` in cli.js)
const propertiesExtra = {
  $schema: {
    description: 'JSON Schema reference for this configuration file (enables editor validation and autocomplete)',
    type: 'string'
  },
  preset: {
    description: 'Preset configuration to start from—config file options override preset options',
    enum: getPresetNames()
  },
  fileExt: {
    description: 'File extension(s) to process, as comma-separated string or array (default: `html,htm,shtml,shtm`; use `*` for all files)',
    type: ['string', 'array'],
    items: { type: 'string' }
  },
  ignoreDir: {
    description: 'Directories—relative to the input directory—to exclude from processing, as comma-separated string or array',
    type: ['string', 'array'],
    items: { type: 'string' }
  }
};

function buildConfigSchema() {
  const properties = { ...propertiesExtra };

  for (const [key, definition] of Object.entries(optionDefinitions)) {
    const typeSchema = typeSchemas[definition.type];
    if (!typeSchema) {
      throw new Error(`No JSON Schema mapping for option “${key}” (type “${definition.type}”)—add the type to \`typeSchemas\` in scripts/build-schema.js`);
    }
    properties[key] = {
      // Prefer the affirmative description—config keys state what `true` does
      description: definition.descriptionAffirmative ?? definition.description,
      ...typeSchema
    };
  }

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://raw.githubusercontent.com/j9t/html-minifier-next/main/html-minifier-next.schema.json',
    title: 'HTML Minifier Next configuration',
    description: 'Configuration file for HTML Minifier Next (HMN), used via `--config-file`',
    type: 'object',
    properties,
    additionalProperties: false
  };
}

// Write the schema file when run as a script (not when imported by tests)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fs.writeFileSync(schemaPath, JSON.stringify(buildConfigSchema(), null, 2) + '\n');
  console.error(`Generated ${schemaPath}`);
}

// Exports

export {
  buildConfigSchema
};