// Imports

import {
  jsonScriptTypes
} from './constants.js';
import { replaceAsync } from './utils.js';
import { trimWhitespace } from './whitespace.js';

// CSS processing

// Wrap CSS declarations for inline styles and media queries
// This ensures proper context for CSS minification

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
  return matches ? matches[1] : text;
}

async function cleanConditionalComment(comment, options, minifyHTML) {
  return options.processConditionalComments
    ? await replaceAsync(comment, /^(\[if\s[^\]]+]>)([\s\S]*?)(<!\[endif])$/, async function (match, prefix, text, suffix) {
      return prefix + await minifyHTML(text, options, true) + suffix;
    })
    : comment;
}

// Script processing

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

function hasJsonScriptType(attrs) {
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      const attrValue = trimWhitespace((attrs[i].value || '').split(/;/, 2)[0]).toLowerCase();
      if (jsonScriptTypes.has(attrValue)) {
        return true;
      }
    }
  }
  return false;
}

async function processScript(text, options, currentAttrs, minifyHTML) {
  for (let i = 0, len = currentAttrs.length; i < len; i++) {
    const attrName = currentAttrs[i].name.toLowerCase();
    if (attrName === 'type') {
      const rawValue = currentAttrs[i].value;
      const normalizedValue = trimWhitespace((rawValue || '').split(/;/, 2)[0]).toLowerCase();
      // Minify JSON script types automatically
      if (jsonScriptTypes.has(normalizedValue)) {
        return minifyJson(text, options);
      }
      // Process custom script types if specified
      if (options.processScripts && options.processScripts.indexOf(rawValue) > -1) {
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
  cleanConditionalComment,

  // Scripts
  minifyJson,
  hasJsonScriptType,
  processScript
};