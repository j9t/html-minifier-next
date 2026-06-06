import {
  jsonScriptTypes
} from './constants.js';
import { trimWhitespace } from './whitespace.js';

// CSS processing

// Wrap CSS declarations for inline styles and media queries
// This ensures proper context for CSS minification
/**
 * @param {string} text
 * @param {string} type
 */
function wrapCSS(text, type) {
  switch (type) {
    case 'inline':
      return '*{' + text + '}';
    case 'media':
      return '@media ' + text + '{a{top:0}}';
    default:
      return text;
  }
}

/**
 * @param {string} text
 * @param {string} type
 */
function unwrapCSS(text, type) {
  let matches;
  switch (type) {
    case 'inline':
      matches = text.match(/^\*\{([\s\S]*)\}$/);
      break;
    case 'media':
      matches = text.match(/^@media ([\s\S]*?)\s*{[\s\S]*}$/);
      break;
  }
  return matches ? matches[1] ?? text : text;
}

// Script processing

/**
 * @param {string} text
 * @param {{continueOnMinifyError?: boolean, log?: Function}} options
 */
function minifyJson(text, options) {
  try {
    return JSON.stringify(JSON.parse(text));
  }
  catch (err) {
    if (!options.continueOnMinifyError) {
      throw err;
    }
    options.log && options.log(err);
    return text;
  }
}

/** @param {Array<{name: string, value?: string}>} attrs */
function hasJsonScriptType(attrs) {
  for (const attr of attrs) {
    if (attr.name.toLowerCase() === 'type') {
      const attrValue = trimWhitespace((attr.value || '').split(/;/, 2)[0] ?? '').toLowerCase();
      if (jsonScriptTypes.has(attrValue)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * @param {string} text
 * @param {{continueOnMinifyError?: boolean, log?: Function, processScripts?: string[]}} options
 * @param {Array<{name: string, value?: string | undefined}>} currentAttrs
 * @param {Function} minifyHTML
 */
async function processScript(text, options, currentAttrs, minifyHTML) {
  for (const attr of currentAttrs) {
    const attrName = attr.name.toLowerCase();
    if (attrName === 'type') {
      const rawValue = attr.value;
      const normalizedValue = trimWhitespace((rawValue || '').split(/;/, 2)[0] ?? '').toLowerCase();
      // Minify JSON script types automatically
      if (jsonScriptTypes.has(normalizedValue)) {
        return minifyJson(text, options);
      }
      // Process custom script types if specified
      if (options.processScripts && rawValue && options.processScripts.indexOf(rawValue) > -1) {
        return await minifyHTML(text, options);
      }
    }
  }
  return text;
}

// Exports

export {
  // CSS
  wrapCSS,
  unwrapCSS,

  // Scripts
  minifyJson,
  hasJsonScriptType,
  processScript
};