/**
 * CSS and script content wrapping for minification
 */

import {
  RE_ESCAPE_LT,
  jsonScriptTypes
} from './constants.js';
import { isExecutableScript } from './attributes.js';
import { findTagEnd } from './utils.js';
import { trimWhitespace } from './whitespace.js';

/** @import { ProcessedOptions } from './options.js' */

// CSS processing

// Give bare declarations and media queries a parseable context for CSS minifiers
/**
 * @param {string} text
 * @param {string} [type]
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
 * @param {string} [type]
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

/** @param {number} code */
function isJsonWhitespace(code) {
  return code === 32 || code === 10 || code === 13 || code === 9;
}

// Remove whitespace between tokens of valid JSON in one pass, copying strings as written
// unless they hold escapes (re-serialized to shorten them) or `<` (escaped)
/** @param {string} text */
function stripJsonWhitespace(text) {
  const length = text.length;
  let out = '';
  let start = 0;
  let i = 0;
  while (i < length) {
    const code = text.charCodeAt(i);
    if (code === 34) { // `"`
      let end = i + 1;
      let hasEscape = false;
      let hasLt = false;
      for (;;) {
        const c = text.charCodeAt(end);
        if (c === 34) break;
        if (c === 92) { // `\`
          hasEscape = true;
          end += 2;
          continue;
        }
        if (c === 60) hasLt = true; // `<`
        end++;
      }
      if (hasEscape || hasLt) {
        let string = text.slice(i, end + 1);
        if (hasEscape) string = JSON.stringify(JSON.parse(string));
        out += text.slice(start, i) + string.replace(RE_ESCAPE_LT, '\\u003C');
        start = end + 1;
      }
      i = end + 1;
    } else if (isJsonWhitespace(code)) {
      out += text.slice(start, i);
      do i++;
      while (i < length && isJsonWhitespace(text.charCodeAt(i)));
      start = i;
    } else {
      i++;
    }
  }
  return out + text.slice(start);
}

// Minify JSON script content, keeping `<` escaped—parsing only validates,
// as serializing the parsed value would change some values (e.g., large numbers)
/**
 * @param {string} text
 * @param {{continueOnMinifyError?: boolean, log?: Function}} options
 */
function minifyJson(text, options) {
  try {
    JSON.parse(text);
    return stripJsonWhitespace(text);
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
 * @param {ProcessedOptions} options
 * @param {string} tag
 * @param {Array<{name: string, value?: string | undefined}>} currentAttrs
 * @param {Function} minifyHTML
 */
async function processScript(text, options, tag, currentAttrs, minifyHTML) {
  for (const attr of currentAttrs) {
    const attrName = attr.name.toLowerCase();
    if (attrName === 'type') {
      const rawValue = attr.value;
      const normalizedValue = trimWhitespace((rawValue || '').split(/;/, 2)[0] ?? '').toLowerCase();
      if (tag === 'script' && jsonScriptTypes.has(normalizedValue)) {
        return options.minifyJSON ? minifyJson(text, options) : text;
      }
      if (options.processScripts && rawValue && options.processScripts.indexOf(rawValue) > -1) {
        return await minifyHTML(text, options);
      }
    }
  }
  return text;
}

// A `script` element is walked in three steps rather than matched by one pattern—
// a pattern spanning the whole element rescans the same text for every candidate
// tag, which turns markup repeating `<script` or `</script` into a quadratic scan
const RE_SCRIPT_START = /<script\b/gi;
// A tag name ends at whitespace, a slash, or the closing bracket, so `</scriptx>` names a
// different element and leaves the body running, as it does for the parser
const RE_SCRIPT_END = /<\/script(?=[\s/>])/gi;
const RE_TYPE_ATTRIBUTE = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/**
 * Collects the bodies of executable inline scripts, in document order, so they can be
 * minified as one batch ahead of the parse. Duplicates are dropped: The minifier is
 * content-keyed, so the same body only needs dispatching once.
 * @param {string} html
 * @returns {Array<{code: string, isModule: boolean}>}
 */
function extractScriptBodies(html) {
  /** @type {Array<{code: string, isModule: boolean}>} */
  const bodies = [];
  const seen = new Set();

  RE_SCRIPT_START.lastIndex = 0;
  let startTag;
  while ((startTag = RE_SCRIPT_START.exec(html))) {
    const tagEnd = findTagEnd(html, RE_SCRIPT_START.lastIndex);
    if (tagEnd === -1) {
      break;
    }
    // Script content is raw text, so the body runs to the first `</script`—
    // no nesting to account for
    RE_SCRIPT_END.lastIndex = tagEnd + 1;
    const endTag = RE_SCRIPT_END.exec(html);
    if (!endTag) {
      break;
    }
    const closeEnd = html.indexOf('>', RE_SCRIPT_END.lastIndex);
    if (closeEnd === -1) {
      break;
    }
    // Resuming past the element is what keeps every character visited once
    RE_SCRIPT_START.lastIndex = closeEnd + 1;

    const code = html.slice(tagEnd + 1, endTag.index);
    // Whitespace-only and external scripts carry no work the minifier would do
    if (!code.trim()) {
      continue;
    }

    const typeMatch = RE_TYPE_ATTRIBUTE.exec(html.slice(startTag.index + '<script'.length, tagEnd));
    /** @type {Array<{name: string, value: string}>} */
    const attrs = typeMatch
      ? [{ name: 'type', value: typeMatch[1] ?? typeMatch[2] ?? typeMatch[3] ?? '' }]
      : [];
    if (!isExecutableScript('script', attrs) || hasJsonScriptType(attrs)) {
      continue;
    }

    // Module and classic scripts minify differently, so identical bodies in the two
    // modes stay separate entries
    const isModule = trimWhitespace((attrs[0]?.value ?? '')).toLowerCase() === 'module';
    const key = (isModule ? 'm|' : '|') + code;
    if (!seen.has(key)) {
      seen.add(key);
      bodies.push({ code, isModule });
    }
  }

  return bodies;
}

export {
  // CSS
  wrapCSS,
  unwrapCSS,

  // Scripts
  minifyJson,
  hasJsonScriptType,
  extractScriptBodies,
  processScript
};