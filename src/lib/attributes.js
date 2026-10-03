/**
 * HTML attribute parsing, decoding, and minification
 */

import {
  RE_EVENT_ATTR_DEFAULT,
  RE_CAN_REMOVE_ATTR_QUOTES,
  RE_AMP_ENTITY,
  RE_ATTR_WS_CHECK,
  RE_ATTR_WS_COLLAPSE,
  RE_ATTR_WS_TRIM,
  RE_WS_CHAR,
  generalDefaults,
  tagDefaults,
  executableScriptsMimetypes,
  keepScriptsMimetypes,
  isSimpleBoolean,
  isBooleanValue,
  collapsibleValues,
  srcsetElements,
  RE_EMPTY_ATTRIBUTE,
  RE_STYLE_ELEMENT
} from './constants.js';
import { trimWhitespace, collapseWhitespaceAll } from './whitespace.js';
import { shouldMinifyInnerHTML } from './options.js';
import { collectUsage } from './unused-css.js';
import { identity, isThenable, lowercase } from './utils.js';

/** @import { ProcessedOptions } from './options.js' */

// Type definitions

/**
 * @typedef {{ name: string, value?: string | undefined, quote?: string, customAssign?: string, customOpen?: string, customClose?: string }} HTMLAttribute
 *  Internal counterpart of the public typedef in htmlminifier.js—keep in sync.
 */

// Lazy-load entities (used for `decodeEntities`, event-handler attribute
// decoding before `minifyJS`, and `srcdoc` decoding/re-encoding)

/** @type {Promise<Function> | undefined} */
let decodeHTMLStrictPromise;
async function getDecodeHTMLStrict() {
  if (!decodeHTMLStrictPromise) {
    decodeHTMLStrictPromise = import('entities').then(m => m.decodeHTMLStrict);
  }
  return decodeHTMLStrictPromise;
}

/** @type {Promise<Function> | undefined} */
let escapeAttributePromise;
async function getEscapeAttribute() {
  if (!escapeAttributePromise) {
    escapeAttributePromise = import('entities').then(m => m.escapeAttribute);
  }
  return escapeAttributePromise;
}

// Validators

/**
 * @param {string} text
 * @param {ProcessedOptions} options
 */
function isIgnoredComment(text, options) {
  for (const pattern of options.ignoreCustomComments) {
    if (pattern.test(text)) {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} attrName
 * @param {{customEventAttributes?: RegExp[]}} options
 * @param {string} [attrNameOut] - The name as written, for the patterns
 */
function isEventAttribute(attrName, options, attrNameOut = attrName) {
  const patterns = options.customEventAttributes;
  if (patterns) {
    for (const pattern of patterns) {
      if (pattern.test(attrNameOut)) {
        return true;
      }
    }
    return false;
  }
  return RE_EVENT_ATTR_DEFAULT.test(attrName);
}

/** @param {string} value */
function canRemoveAttributeQuotes(value) {
  // https://mathiasbynens.be/notes/unquoted-attribute-values
  return RE_CAN_REMOVE_ATTR_QUOTES.test(value);
}

/**
 * @param {HTMLAttribute[]} attributes
 * @param {string} attribute
 */
function attributesInclude(attributes, attribute) {
  for (const attr of attributes) {
    if (attr.name.toLowerCase() === attribute) {
      return true;
    }
  }
  return false;
}

/**
 * Remove duplicate attributes from an attribute list.
 * Per HTML spec, when an attribute appears multiple times, the first occurrence wins.
 * Duplicate attributes result in invalid HTML, so only the first is kept.
 * @param {HTMLAttribute[]} attrs - Array of attribute objects with `name` property
 * @param {boolean} caseSensitive - Whether to compare names case-sensitively (for XML/SVG)
 * @returns {HTMLAttribute[]} Deduplicated attribute array (modifies in place and returns)
 */
function deduplicateAttributes(attrs, caseSensitive) {
  if (attrs.length < 2) {
    return attrs;
  }

  const seen = new Set();
  let writeIndex = 0;

  for (const attr of attrs) {
    const key = caseSensitive ? attr.name : attr.name.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      attrs[writeIndex++] = attr;
    }
  }

  attrs.length = writeIndex;
  return attrs;
}

/**
 * @param {string} tag
 * @param {string} attrName
 * @param {string} attrValue
 * @param {HTMLAttribute[]} attrs
 */
function isAttributeRedundant(tag, attrName, attrValue, attrs) {
  // Fast-path: Check if this element–attribute combination can possibly be redundant
  // before normalizing the value; own properties only, so `constructor` has no default
  const generalDefault = Object.hasOwn(generalDefaults, attrName)
    ? /** @type {Record<string, string>} */ (generalDefaults)[attrName]
    : undefined;
  const tagAttrDefaults = Object.hasOwn(tagDefaults, tag)
    ? /** @type {Record<string, string>} */ (/** @type {Record<string, unknown>} */ (tagDefaults)[tag])
    : undefined;
  const tagDefault = tagAttrDefaults && Object.hasOwn(tagAttrDefaults, attrName) ? tagAttrDefaults[attrName] : undefined;

  // Check for legacy attribute rules (element- and attribute-specific)
  const isLegacyAttr = (tag === 'script' && (attrName === 'language' || attrName === 'charset')) || (tag === 'a' && attrName === 'name');

  // Without a default for this very attribute, nor a legacy rule, the value cannot be redundant
  if (generalDefault === undefined && tagDefault === undefined && !isLegacyAttr) {
    return false;
  }

  // Value needs to be checked, so normalize it
  attrValue = attrValue ? trimWhitespace(attrValue.toLowerCase()) : '';

  // Legacy attribute checks
  if (tag === 'script' && attrName === 'language' && attrValue === 'javascript') {
    return true;
  }
  if (tag === 'script' && attrName === 'charset' && !attributesInclude(attrs, 'src')) {
    return true;
  }
  if (tag === 'a' && attrName === 'name' && attributesInclude(attrs, 'id')) {
    return true;
  }

  return attrValue === generalDefault || attrValue === tagDefault;
}

function isScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0] ?? '').toLowerCase();
  return attrValue === '' || executableScriptsMimetypes.has(attrValue);
}

function keepScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0] ?? '').toLowerCase();
  return keepScriptsMimetypes.has(attrValue);
}

/**
 * @param {string} tag
 * @param {HTMLAttribute[]} attrs
 */
function isExecutableScript(tag, attrs) {
  if (tag !== 'script') {
    return false;
  }
  for (const attr of attrs) {
    if (attr.name.toLowerCase() === 'type') {
      return isScriptTypeAttribute(attr.value);
    }
  }
  return true;
}

function isStyleLinkTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue).toLowerCase();
  return attrValue === '' || attrValue === 'text/css';
}

/**
 * @param {string} tag
 * @param {HTMLAttribute[]} attrs
 */
function isStyleElement(tag, attrs) {
  if (tag !== 'style') {
    return false;
  }
  for (const attr of attrs) {
    if (attr.name.toLowerCase() === 'type') {
      return isStyleLinkTypeAttribute(attr.value);
    }
  }
  return true;
}

/**
 * Whether an attribute collapses to its name; takes name and value as written, lower-casing
 * the value only for the few names that depend on it
 *
 * @param {string} attrName
 * @param {string} attrValue
 */
function collapsesToBooleanName(attrName, attrValue) {
  const name = attrName.toLowerCase();
  if (isSimpleBoolean.has(name)) {
    return true;
  }
  const values = collapsibleValues.get(name);
  if (values) {
    return values.has(attrValue.toLowerCase());
  }
  return name === 'draggable' && !isBooleanValue.has(attrValue.toLowerCase());
}

const uriTypeAttributes = new Map([
  ['a', new Set(['href'])],
  ['area', new Set(['href'])],
  ['audio', new Set(['src'])],
  ['base', new Set(['href'])],
  ['blockquote', new Set(['cite'])],
  ['button', new Set(['formaction'])],
  ['del', new Set(['cite'])],
  ['embed', new Set(['src'])],
  ['form', new Set(['action'])],
  ['frame', new Set(['longdesc', 'src'])],
  ['head', new Set(['profile'])],
  ['iframe', new Set(['src'])],
  ['img', new Set(['longdesc', 'src', 'usemap'])],
  ['input', new Set(['formaction', 'src', 'usemap'])],
  ['ins', new Set(['cite'])],
  ['link', new Set(['href'])],
  ['object', new Set(['classid', 'codebase', 'data', 'usemap'])],
  ['q', new Set(['cite'])],
  ['script', new Set(['src'])],
  ['source', new Set(['src'])],
  ['track', new Set(['src'])],
  ['video', new Set(['poster', 'src'])]
]);

/**
 * @param {string} attrName
 * @param {string} tag
 */
function isUriTypeAttribute(attrName, tag) {
  const set = uriTypeAttributes.get(tag);
  return set ? set.has(attrName) : false;
}

const numberTypeAttributes = new Map([
  ['a', new Set(['tabindex'])],
  ['area', new Set(['tabindex'])],
  ['button', new Set(['tabindex'])],
  ['col', new Set(['span'])],
  ['colgroup', new Set(['span'])],
  ['input', new Set(['maxlength', 'tabindex'])],
  ['object', new Set(['tabindex'])],
  ['select', new Set(['size', 'tabindex'])],
  ['td', new Set(['colspan', 'rowspan'])],
  ['textarea', new Set(['cols', 'rows', 'tabindex'])],
  ['th', new Set(['colspan', 'rowspan'])]
]);

/**
 * @param {string} attrName
 * @param {string} tag
 */
function isNumberTypeAttribute(attrName, tag) {
  const set = numberTypeAttributes.get(tag);
  return set ? set.has(attrName) : false;
}

/**
 * @param {string} tag
 * @param {HTMLAttribute[]} attrs
 * @param {string} value
 */
function isLinkType(tag, attrs, value) {
  if (tag !== 'link') return false;
  const needle = String(value).toLowerCase();
  for (const attr of attrs) {
    if (attr.name.toLowerCase() === 'rel') {
      const tokens = String(attr.value).toLowerCase().split(/\s+/);
      if (tokens.includes(needle)) return true;
    }
  }
  return false;
}

/**
 * @param {string} tag
 * @param {HTMLAttribute[]} attrs
 * @param {string} attrName
 */
function isMediaQuery(tag, attrs, attrName) {
  return attrName === 'media' && (isLinkType(tag, attrs, 'stylesheet') || isStyleElement(tag, attrs));
}

/**
 * @param {string} attrName
 * @param {string} tag
 */
function isSrcset(attrName, tag) {
  return (attrName === 'srcset' && srcsetElements.has(tag)) ||
    (attrName === 'imagesrcset' && tag === 'link');
}

// Whitespace (as `\s`) and comma for the `srcset` parser, with ASCII checked by code first
/** @param {number} code */
function isWsChar(code) {
  return code === 32 || (code >= 9 && code <= 13) ||
    (code > 127 && RE_WS_CHAR.test(String.fromCharCode(code)));
}

/** @param {number} code */
function isWsOrComma(code) {
  return code === 44 /* , */ || isWsChar(code);
}

/**
 * @param {string} tag
 * @param {HTMLAttribute[]} attrs
 */
function isMetaViewport(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (const attr of attrs) {
    if (attr.name.toLowerCase() === 'name' && (attr.value || '').toLowerCase() === 'viewport') {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} tag
 * @param {HTMLAttribute[]} attrs
 */
function isContentSecurityPolicy(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (const attr of attrs) {
    if (attr.name.toLowerCase() === 'http-equiv' && (attr.value || '').toLowerCase() === 'content-security-policy') {
      return true;
    }
  }
  return false;
}

/**
 * @param {string} tag
 * @param {string} attrName
 * @param {string | undefined} attrValue
 * @param {{removeEmptyAttributes?: boolean | Function}} options
 * @param {string} [tagOut] - The tag name as written, for the hook
 * @param {string} [attrNameOut] - The attribute name as written, for the hook
 */
function canDeleteEmptyAttribute(tag, attrName, attrValue, options, tagOut = tag, attrNameOut = attrName) {
  const isValueEmpty = !attrValue || attrValue.trim() === '';
  if (!isValueEmpty) {
    return false;
  }
  if (typeof options.removeEmptyAttributes === 'function') {
    return options.removeEmptyAttributes(attrNameOut, tagOut);
  }
  return (tag === 'input' && attrName === 'value') || RE_EMPTY_ATTRIBUTE.test(attrName);
}

/**
 * @param {string} name
 * @param {HTMLAttribute[]} attrs
 */
function hasAttrName(name, attrs) {
  for (const attr of attrs) {
    if (attr.name === name) {
      return true;
    }
  }
  return false;
}

// Cleaners

const collapseAttributeWhitespaceExempt = new Set(['pattern', 'placeholder', 'title']);
// `value` whitespace matters only on form-submission and machine-readable elements
const valueWhitespaceExemptElements = new Set(['button', 'data', 'input', 'option', 'param']);

/**
 * Drop repeated names from a whitespace-separated class list, keeping the first of each.
 * @param {string} value
 * @returns {string}
 */
function dedupeClassNames(value) {
  if (!RE_ATTR_WS_CHECK.test(value)) {
    return value;
  }
  const names = value.split(RE_ATTR_WS_COLLAPSE);
  const unique = new Set(names);
  return unique.size === names.length ? value : [...unique].join(' ');
}

// Returns the cleaned attribute value directly (sync) or as a Promise (async);
// callers must handle both cases—use `isThenable()` to distinguish
/**
 * @param {string} tag
 * @param {string} attrName
 * @param {string} attrValue
 * @param {ProcessedOptions} options
 * @param {HTMLAttribute[]} attrs
 * @param {Function} minifyHTMLSelf
 * @param {string[]} [markers] - What custom fragment and `htmlmin:ignore` placeholders hold
 * @param {string} [attrNameOut] - The name as written, for the patterns
 */
function cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTMLSelf, markers = [], attrNameOut = attrName) {
  const isEventAttr = isEventAttribute(attrName, options, attrNameOut);

  // Apply early whitespace normalization if enabled
  // Preserves special spaces (no-break space, hair space, etc.) for consistency with `collapseWhitespace`
  if (options.collapseAttributeWhitespace && !collapseAttributeWhitespaceExempt.has(attrName) && !(attrName === 'value' && valueWhitespaceExemptElements.has(tag)) && !isEventAttr) {
    // Fast path: Only process if whitespace exists (avoids regex overhead on clean values)
    if (RE_ATTR_WS_CHECK.test(attrValue)) {
      // Two-pass approach (faster than single-pass with callback)
      // First: Collapse internal whitespace sequences to single space
      // Second: Trim leading/trailing whitespace
      attrValue = attrValue.replace(RE_ATTR_WS_COLLAPSE, ' ').replace(RE_ATTR_WS_TRIM, '');
    }
  }

  if (isEventAttr) {
    attrValue = trimWhitespace(attrValue).replace(/^javascript:\s*/i, '');
    // Browsers decode attribute values before running event-handler JS—
    // decode first so the minifier gets valid JavaScript
    if (!options.decodeEntities && options.minifyJS !== identity && attrValue.indexOf('&') !== -1) {
      return getDecodeHTMLStrict().then(decode => {
        const decoded = decode(attrValue);
        const result = options.minifyJS(decoded, true);
        const reEncode = (/** @type {string} */ v) => (v && v.indexOf('&') !== -1) ? v.replace(RE_AMP_ENTITY, '&amp;$1') : v;
        if (isThenable(result)) {
          return result.then(reEncode, (/** @type {Error} */ err) => {
            if (!options.continueOnMinifyError) throw err;
            options.log && options.log(err);
            return attrValue;
          });
        }
        return reEncode(result);
      });
    }
    const result = options.minifyJS(attrValue, true);
    if (isThenable(result)) {
      return result.catch((/** @type {Error} */ err) => {
        if (!options.continueOnMinifyError) throw err;
        options.log && options.log(err);
        return attrValue;
      });
    }
    return result;
  }

  if (attrName === 'class') {
    attrValue = trimWhitespace(attrValue);
    // Names around a fragment placeholder (`ignoreCustomFragments`, `htmlmin:ignore`)
    // may not repeat once a template renders
    const holdsFragment = markers.some(marker => attrValue.indexOf(marker) !== -1);
    if (options.sortClassNames) {
      // By the time attributes are processed, `createSortFns` has replaced any truthy non-function value
      attrValue = /** @type {(value: string) => string} */ (options.sortClassNames)(attrValue);
    } else {
      attrValue = collapseWhitespaceAll(attrValue);
    }
    return holdsFragment ? attrValue : dedupeClassNames(attrValue);
  }

  if (isUriTypeAttribute(attrName, tag)) {
    attrValue = trimWhitespace(attrValue);
    if (isLinkType(tag, attrs, 'canonical')) {
      return attrValue;
    }
    const result = options.minifyURLs(attrValue);
    if (isThenable(result)) {
      return result
        .then((/** @type {unknown} */ out) => typeof out === 'string' ? out : attrValue)
        .catch((/** @type {Error} */ err) => {
          if (!options.continueOnMinifyError) throw err;
          options.log && options.log(err);
          return attrValue;
        });
    }
    return typeof result === 'string' ? result : attrValue;
  }

  if (isNumberTypeAttribute(attrName, tag)) {
    return trimWhitespace(attrValue);
  }

  if (attrName === 'style') {
    attrValue = trimWhitespace(attrValue);
    if (attrValue) {
      if (attrValue.endsWith(';') && !/&#?[0-9a-zA-Z]+;$/.test(attrValue)) {
        attrValue = attrValue.replace(/\s*;$/, ';');
      }
      const originalAttrValue = attrValue;
      const cssResult = options.minifyCSS(attrValue, 'inline', options.cssContext);
      if (isThenable(cssResult)) {
        return cssResult
          .then((/** @type {string} */ minified) => {
            // After minification, check if CSS consists entirely of invalid properties (no values)
            // I.e., `color:` or `margin:;padding:` should be treated as empty
            if (minified && /^(?:[a-z-]+:[;\s]*)+$/i.test(minified)) return '';
            return minified;
          })
          .catch((/** @type {Error} */ err) => {
            if (!options.continueOnMinifyError) throw err;
            options.log && options.log(err);
            return originalAttrValue;
          });
      }
      // Sync path (`minifyCSS` disabled—identity function)
      if (cssResult && /^(?:[a-z-]+:[;\s]*)+$/i.test(cssResult)) return '';
      return cssResult ?? attrValue;
    }
    return attrValue;
  }

  if (isSrcset(attrName, tag)) {
    // Split into image candidate strings following the spec parsing algorithm
    // (https://html.spec.whatwg.org/multipage/images.html#parsing-a-srcset-attribute);
    // a naive split on commas would corrupt URLs that contain commas
    const value = trimWhitespace(attrValue);
    /** @type {string[]} */
    const candidates = [];
    let pos = 0;
    while (pos < value.length) {
      // Skip whitespace and separator commas
      while (pos < value.length && isWsOrComma(value.charCodeAt(pos))) pos++;
      if (pos >= value.length) break;
      const start = pos;
      // URL: a run of non-whitespace characters (which may contain commas)
      while (pos < value.length && !isWsChar(value.charCodeAt(pos))) pos++;
      if (value.charAt(pos - 1) === ',') {
        // Trailing comma(s) end the candidate—a URL without descriptor
        candidates.push(value.slice(start, pos).replace(/,+$/, ''));
        continue;
      }
      // Descriptor: everything up to the next comma outside parentheses
      let inParens = false;
      while (pos < value.length) {
        const code = value.charCodeAt(pos);
        if (!inParens && code === 44 /* , */) break;
        if (code === 40 /* ( */) inParens = true;
        else if (code === 41 /* ) */) inParens = false;
        pos++;
      }
      candidates.push(trimWhitespace(value.slice(start, pos)));
    }
    const processed = candidates.map(candidate => {
      let url = candidate;
      let descriptor = '';
      const match = candidate.match(/\s+([1-9][0-9]*w|[0-9]+(?:\.[0-9]+)?x)$/);
      if (match) {
        url = url.slice(0, -match[0].length);
        const group = match[1] ?? '';
        const num = +group.slice(0, -1);
        const suffix = group.slice(-1);
        if (num !== 1 || suffix !== 'x') {
          descriptor = ' ' + num + suffix;
        }
      }
      const out = options.minifyURLs(url);
      if (isThenable(out)) {
        return out
          .then((/** @type {unknown} */ result) => (typeof result === 'string' ? result : url) + descriptor)
          .catch((/** @type {Error} */ err) => {
            if (!options.continueOnMinifyError) throw err;
            options.log && options.log(err);
            return url + descriptor;
          });
      }
      return (typeof out === 'string' ? out : url) + descriptor;
    });
    if (processed.some(isThenable)) {
      return Promise.all(processed).then(results => results.join(', '));
    }
    return processed.join(', ');
  }

  if (attrName === 'content' && isMetaViewport(tag, attrs)) {
    return attrValue.replace(/\s+/g, '').replace(/[0-9]+\.[0-9]+/g, function (numString) {
      // 0.90000 → 0.9
      // 1.0 → 1
      // 1.0001 → 1.0001 (unchanged)
      return (+numString).toString();
    });
  }

  if (attrName.toLowerCase() === 'content' && isContentSecurityPolicy(tag, attrs)) {
    return collapseWhitespaceAll(attrValue);
  }

  if (options.customAttrCollapse && options.customAttrCollapse.test(attrNameOut)) {
    return trimWhitespace(attrValue.replace(/ ?[\n\r]+ ?/g, '').replace(/\s{2,}/g, options.conservativeCollapse ? ' ' : ''));
  }

  if (tag === 'script' && attrName === 'type') {
    return trimWhitespace(attrValue.replace(/\s*;\s*/g, ';'));
  }

  if (isMediaQuery(tag, attrs, attrName)) {
    attrValue = trimWhitespace(attrValue);
    // Only minify actual media queries (those with features in parentheses)
    // Skip simple media types like `all`, `screen`, `print` which are already minimal
    if (!/[()]/.test(attrValue)) {
      return attrValue;
    }
    const originalAttrValue = attrValue;
    const cssResult = options.minifyCSS(attrValue, 'media', options.cssContext);
    if (isThenable(cssResult)) {
      return cssResult.catch((/** @type {Error} */ err) => {
        if (!options.continueOnMinifyError) throw err;
        options.log && options.log(err);
        return originalAttrValue;
      });
    }
    return cssResult ?? attrValue;
  }

  if (tag === 'iframe' && attrName === 'srcdoc') {
    // Fast-path: Skip if nothing would change
    if (!shouldMinifyInnerHTML(options)) {
      return attrValue;
    }
    return minifySrcdoc(attrValue, options, minifyHTMLSelf);
  }

  return attrValue;
}

/**
 * Recursively minify the document an `iframe srcdoc` attribute holds.
 *
 * Browsers resolve character references before parsing `srcdoc`, so an
 * entity-encoded document is decoded first (unless `decodeEntities` already
 * did) and re-encoded afterwards—but only then, so a literal value passes
 * through byte-identical.
 *
 * @param {string} attrValue
 * @param {ProcessedOptions} options
 * @param {Function} minifyHTMLSelf
 * @returns {Promise<string>}
 */
async function minifySrcdoc(attrValue, options, minifyHTMLSelf) {
  let markup = attrValue;
  let wasEncoded = false;
  if (!options.decodeEntities && attrValue.indexOf('&') !== -1) {
    const decode = await getDecodeHTMLStrict();
    markup = decode(attrValue);
    wasEncoded = markup !== attrValue;
  }

  let srcdocOptions = options;
  // The inner document sees none of the parent’s markup, so its style sheets
  // minify against the symbols the `srcdoc` content references itself
  if (options.removeUnusedCSS && RE_STYLE_ELEMENT.test(markup)) {
    const decode = markup.indexOf('&') !== -1 ? await getDecodeHTMLStrict() : undefined;
    srcdocOptions = {
      ...options,
      cssContext: {
        warned: options.cssContext ? options.cssContext.warned : new Set(),
        ...collectUsage(markup, options.removeUnusedCSS.scripts, /** @type {((text: string) => string) | undefined} */ (decode))
      }
    };
  }

  try {
    const minified = await minifyHTMLSelf(markup, srcdocOptions, true);
    return wasEncoded ? (await getEscapeAttribute())(minified) : minified;
  } catch (err) {
    if (!options.continueOnMinifyError) throw err;
    options.log && options.log(/** @type {Error} */ (err));
    return attrValue;
  }
}

/**
 * Choose appropriate quote character for an attribute value
 * @param {string} attrValue - The attribute value
 * @param {{quoteCharacter?: string}} options - Minifier options
 * @returns {string} The chosen quote character (`"` or `'`)
 */
function chooseAttributeQuote(attrValue, options) {
  if (typeof options.quoteCharacter !== 'undefined') {
    return options.quoteCharacter === '\'' ? '\'' : '"';
  }

  // Count quotes in a single pass
  let apos = 0, quot = 0;
  for (let i = 0; i < attrValue.length; i++) {
    if (attrValue[i] === "'") apos++;
    else if (attrValue[i] === '"') quot++;
  }
  return apos < quot ? '\'' : '"';
}

// Returns the normalized attribute object directly (sync) or as a Promise (async);
// callers must handle both cases—use `isThenable()` to distinguish
/**
 * @param {HTMLAttribute} attr
 * @param {HTMLAttribute[]} attrs
 * @param {string} tag
 * @param {string} tagOut - The tag name as written, for hooks
 * @param {ProcessedOptions} options
 * @param {Function} minifyHTML
 * @param {string[]} [markers] - What custom fragment and `htmlmin:ignore` placeholders hold
 */
function normalizeAttr(attr, attrs, tag, tagOut, options, minifyHTML, markers) {
  const attrName = options.name(attr.name);
  // The name to write and to hand to hooks: as in the source for HTML names
  // under `caseSensitive`, as named otherwise (foreign names are named as written anyway)
  const attrNameOut = options.namesAsWritten && options.name === lowercase ? attr.name : attrName;
  const attrValue = attr.value;

  // Entity decoding requires a lazy import—async only when `&` is present
  if (options.decodeEntities && attrValue && attrValue.indexOf('&') !== -1) {
    return getDecodeHTMLStrict().then(decode => {
      return normalizeAttrContinue(attrName, attrNameOut, decode(attrValue), attr, attrs, tag, tagOut, options, minifyHTML, markers);
    });
  }

  return normalizeAttrContinue(attrName, attrNameOut, attrValue, attr, attrs, tag, tagOut, options, minifyHTML, markers);
}

// Internal: Handles attribute normalization after entity decoding (if any)
/**
 * @param {string} attrName
 * @param {string} attrNameOut
 * @param {string | undefined} attrValue
 * @param {HTMLAttribute} attr
 * @param {HTMLAttribute[]} attrs
 * @param {string} tag
 * @param {string} tagOut
 * @param {ProcessedOptions} options
 * @param {Function} minifyHTML
 * @param {string[]} [markers] - What custom fragment and `htmlmin:ignore` placeholders hold
 */
function normalizeAttrContinue(attrName, attrNameOut, attrValue, attr, attrs, tag, tagOut, options, minifyHTML, markers) {
  if ((options.removeRedundantAttributes &&
       isAttributeRedundant(tag, attrName, attrValue ?? '', attrs)) ||
      (options.removeDefaultTypeAttributes && attrName === 'type' && (
        ((tag === 'style' || tag === 'link') && isStyleLinkTypeAttribute(attrValue)) ||
        (tag === 'script' && isScriptTypeAttribute(attrValue) && !keepScriptTypeAttribute(attrValue))
      ))) {
    return;
  }

  if (attrValue) {
    const cleaned = cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTML, markers, attrNameOut);
    if (isThenable(cleaned)) {
      return cleaned.then((/** @type {string | undefined} */ v) => normalizeAttrFinish(attrName, attrNameOut, v, attr, tag, tagOut, options));
    }
    return normalizeAttrFinish(attrName, attrNameOut, cleaned, attr, tag, tagOut, options);
  }

  return normalizeAttrFinish(attrName, attrNameOut, attrValue, attr, tag, tagOut, options);
}

// Internal: Final checks and result assembly after value cleaning
/**
 * @param {string} attrName
 * @param {string} attrNameOut
 * @param {string | undefined} attrValue
 * @param {HTMLAttribute} attr
 * @param {string} tag
 * @param {string} tagOut
 * @param {ProcessedOptions} options
 */
function normalizeAttrFinish(attrName, attrNameOut, attrValue, attr, tag, tagOut, options) {
  if (options.removeEmptyAttributes &&
      canDeleteEmptyAttribute(tag, attrName, attrValue, options, tagOut, attrNameOut)) {
    return;
  }

  if (options.decodeEntities && attrValue && attrValue.indexOf('&') !== -1) {
    attrValue = attrValue.replace(RE_AMP_ENTITY, '&amp;$1');
  }

  return {
    attr,
    name: attrNameOut,
    value: attrValue
  };
}

/**
 * @param {{name: string, value: string | undefined, attr: HTMLAttribute}} normalized
 * @param {string | boolean | undefined} hasUnarySlash
 * @param {ProcessedOptions} options
 * @param {boolean} isLast
 * @param {string | undefined} uidAttr
 */
function buildAttr(normalized, hasUnarySlash, options, isLast, uidAttr) {
  const attrName = normalized.name;
  let attrValue = normalized.value;
  const attr = normalized.attr;
  let attrQuote = attr.quote;
  const readAsXML = Boolean(options.insideSVG) && Boolean(options.minifySVG);

  // SVGO reads the whole SVG block as XML, where every attribute carries a value
  if (readAsXML && typeof attrValue === 'undefined') {
    attrValue = '';
  }

  // An attribute written as its name alone skips the quoting work below
  if (typeof attrValue === 'undefined' ||
      (options.collapseBooleanAttributes && collapsesToBooleanName(attrName, attrValue ?? '')) ||
      (options.collapseEmptyAttributes && attrValue === '' && (attr.customAssign ?? '=') === '=')) {
    return attr.customOpen + attrName + (isLast ? '' : ' ') + attr.customClose;
  }

  // Determine if need to add/keep quotes
  const shouldAddQuotes = typeof attrValue !== 'undefined' && (
    // If `removeAttributeQuotes` is enabled, add quotes only if they can’t be removed
    (options.removeAttributeQuotes && ((uidAttr ? attrValue.indexOf(uidAttr) !== -1 : false) || !canRemoveAttributeQuotes(attrValue))) ||
    // If `removeAttributeQuotes` is not enabled, preserve original quote style or add quotes if value requires them
    (!options.removeAttributeQuotes && (attrQuote !== '' || !canRemoveAttributeQuotes(attrValue) ||
      // XML quotes every attribute value
      readAsXML ||
      // Special case: With `removeTagWhitespace`, unquoted values that aren’t last will have space added,
      // which can create ambiguous/invalid HTML—add quotes to be safe
      (options.removeTagWhitespace && attrQuote === '' && !isLast)))
  );

  let emittedAttrValue;
  if (shouldAddQuotes) {
    attrValue = attrValue ?? '';
    // Determine the appropriate quote character
    if (!options.preventAttributesEscaping) {
      // Normal mode: Choose optimal quote type to minimize escaping
      // unless preserving original quotes and they don’t need escaping
      const needsEscaping = (attrQuote === '"' && attrValue.indexOf('"') !== -1) || (attrQuote === "'" && attrValue.indexOf("'") !== -1);

      if (options.removeAttributeQuotes || typeof options.quoteCharacter !== 'undefined' || needsEscaping || attrQuote === '') {
        attrQuote = chooseAttributeQuote(attrValue, options);
      }

      // `indexOf` first, as values rarely hold the quote and as it’s cheaper than `replace`
      if (attrQuote === '"') {
        if (attrValue.indexOf('"') !== -1) attrValue = attrValue.replace(/"/g, '&#34;');
      } else if (attrValue.indexOf("'") !== -1) {
        attrValue = attrValue.replace(/'/g, '&#39;');
      }
    } else {
      // `preventAttributesEscaping` mode: Choose safe quotes but don’t escape
      // except when both quote types are present—then escape to prevent invalid HTML
      const hasDoubleQuote = attrValue.indexOf('"') !== -1;
      const hasSingleQuote = attrValue.indexOf("'") !== -1;

      // Both quote types present: Escaping is required to guarantee valid HTML delimiter matching
      if (hasDoubleQuote && hasSingleQuote) {
        attrQuote = chooseAttributeQuote(attrValue, options);
        if (attrQuote === '"') {
          attrValue = attrValue.replace(/"/g, '&#34;');
        } else {
          attrValue = attrValue.replace(/'/g, '&#39;');
        }
      // Auto quote selection: Prefer the opposite quote type when value contains one quote type, default to double quotes when none present
      } else if (typeof options.quoteCharacter === 'undefined') {
        if (attrQuote === '"' && hasDoubleQuote && !hasSingleQuote) {
          attrQuote = "'";
        } else if (attrQuote === "'" && hasSingleQuote && !hasDoubleQuote) {
          attrQuote = '"';
        // If no quote character yet (empty string), choose based on content
        } else if (attrQuote === '') {
          if (hasSingleQuote && !hasDoubleQuote) {
            attrQuote = '"';
          } else if (hasDoubleQuote && !hasSingleQuote) {
            attrQuote = "'";
          } else {
            attrQuote = '"';
          }
        // Fallback for invalid/unsupported attrQuote values (not `"`, `'`, or empty string):
        // Choose safe default based on value content
        } else if (attrQuote !== '"' && attrQuote !== "'") {
          if (hasSingleQuote && !hasDoubleQuote) {
            attrQuote = '"';
          } else if (hasDoubleQuote && !hasSingleQuote) {
            attrQuote = "'";
          } else {
            attrQuote = '"';
          }
        }
      } else {
        // `quoteCharacter` is explicitly set
        const preferredQuote = options.quoteCharacter === '\'' ? '\'' : '"';
        // Safety check: If the preferred quote conflicts with value content, switch to the opposite quote
        if ((preferredQuote === '"' && hasDoubleQuote && !hasSingleQuote) || (preferredQuote === "'" && hasSingleQuote && !hasDoubleQuote)) {
          attrQuote = preferredQuote === '"' ? "'" : '"';
        } else if ((preferredQuote === '"' && hasDoubleQuote && hasSingleQuote) || (preferredQuote === "'" && hasSingleQuote && hasDoubleQuote)) {
          // Both quote types present: Fall back to escaping despite `preventAttributesEscaping`
          attrQuote = preferredQuote;
          if (attrQuote === '"') {
            attrValue = attrValue.replace(/"/g, '&#34;');
          } else {
            attrValue = attrValue.replace(/'/g, '&#39;');
          }
        } else {
          attrQuote = preferredQuote;
        }
      }
    }
    emittedAttrValue = attrQuote + attrValue + attrQuote;
    if (!isLast && !options.removeTagWhitespace) {
      emittedAttrValue += ' ';
    }
  } else if (isLast && !hasUnarySlash) {
    // Last attribute in a non-self-closing tag:
    // No space needed
    emittedAttrValue = attrValue;
  } else {
    // Not last attribute, or is a self-closing tag:
    // Unquoted values must have space after them to delimit from next attribute
    emittedAttrValue = attrValue + ' ';
  }

  return attr.customOpen + attrName + attr.customAssign + emittedAttrValue + attr.customClose;
}

// Exports

export {
  // Validators
  isIgnoredComment,
  isEventAttribute,
  canRemoveAttributeQuotes,
  attributesInclude,
  isAttributeRedundant,
  isScriptTypeAttribute,
  keepScriptTypeAttribute,
  isExecutableScript,
  isStyleLinkTypeAttribute,
  isStyleElement,
  isUriTypeAttribute,
  isNumberTypeAttribute,
  isLinkType,
  isMediaQuery,
  isSrcset,
  isMetaViewport,
  isContentSecurityPolicy,
  canDeleteEmptyAttribute,
  hasAttrName,

  // Cleaners
  cleanAttributeValue,
  normalizeAttr,
  buildAttr,
  deduplicateAttributes
};