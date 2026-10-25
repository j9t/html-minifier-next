import { describeQuantifierRisk, parseRegExp } from '../../src/lib/utils.js';
import { optionDefinitions } from '../../src/lib/option-definitions.js';

// Turn the demo’s option controls into the options object the minifier takes,
// kept apart from the page so that it can be read without one

/**
 * @param {{id: string, type?: string, value?: string, checked?: boolean}[]} options
 * @returns {Record<string, unknown>}
 */
export const getOptions = (options) => {
  const minifierOptions = {};

  options.forEach((option) => {
    let value;

    if (option.type === 'checkbox') {
      value = Boolean(option.checked);
    } else if (option.type === 'number') {
      const n = Number.parseInt(String(option.value), 10);
      if (Number.isNaN(n)) return;
      value = n;
    } else if (option.value === '') {
      return;
    } else {
      value = option.value;
    }

    const type = typeof value === 'string' ? optionDefinitions[option.id]?.type : undefined;

    if (type === 'jsonArray') {
      value = value.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    }

    if (type === 'regexp') {
      try {
        value = parseRegExp(value);
      } catch (err) {
        console.warn(`Invalid regex pattern: ${value}`, err);
        return;
      }
    }

    if (type === 'regexpArray') {
      // Split by whitespace and convert each pattern to RegExp, `/…/flags` included
      const patterns = value.split(/\s+/).filter(p => p.trim());
      value = patterns.map(pattern => {
        try {
          const parsed = parseRegExp(pattern);
          // Warn about potentially dangerous patterns (ReDoS risk)
          const risk = describeQuantifierRisk(parsed);
          if (risk) {
            console.warn(`Potentially dangerous regex pattern detected: ${pattern}`);
            console.warn(`The pattern ${risk}.`);
          }
          return parsed;
        } catch (err) {
          console.warn(`Invalid regex pattern: ${pattern}`, err);
          return null;
        }
      }).filter(Boolean);
    }

    minifierOptions[option.id] = value;
  });

  return minifierOptions;
};