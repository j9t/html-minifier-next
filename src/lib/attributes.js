import {
  RE_EVENT_ATTR_DEFAULT,
  RE_CAN_REMOVE_ATTR_QUOTES,
  RE_AMP_ENTITY,
  RE_ATTR_WS_CHECK,
  RE_ATTR_WS_COLLAPSE,
  RE_ATTR_WS_TRIM,
  generalDefaults,
  tagDefaults,
  executableScriptsMimetypes,
  keepScriptsMimetypes,
  isSimpleBoolean,
  isBooleanValue,
  collapsibleValues,
  srcsetElements,
  reEmptyAttribute
} from './constants.js';
import { trimWhitespace, collapseWhitespaceAll } from './whitespace.js';
import { shouldMinifyInnerHTML } from './options.js';
import { identity, isThenable } from './utils.js';

// Type definitions

/**
 * @typedef {{ name: string, value?: string | undefined, quote?: string, customAssign?: string, customOpen?: string, customClose?: string }} HTMLAttribute
 *  Internal counterpart of the public typedef in `htmlminifier.js`—keep in sync.
 */

// Lazy-load entities (used for `decodeEntities` and event-handler attribute decode before `minifyJS`)

/** @type {Promise<Function> | undefined} */
let decodeHTMLStrictPromise;
async function getDecodeHTMLStrict() {
  if (!decodeHTMLStrictPromise) {
    decodeHTMLStrictPromise = import('entities').then(m => m.decodeHTMLStrict);
  }
  return decodeHTMLStrictPromise;
}

// Validators

/**
 * @param {string} text
 * @param {{ignoreCustomComments: RegExp[]}} options
 */
function isIgnoredComment(text, options) {
  // @@ Optimize: `Array.isArray(options.ignoreCustomComments)` runs on every comment node; it could be eliminated once `parseRegExpArray` is tightened to coerce non-arrays to `[]` at setup time
  if (!Array.isArray(options.ignoreCustomComments)) return false;
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
 */
function isEventAttribute(attrName, options) {
  const patterns = options.customEventAttributes;
  if (patterns) {
    for (const pattern of patterns) {
      if (pattern.test(attrName)) {
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
  // before doing expensive string operations

  // Check if attribute name is in general defaults
  const hasGeneralDefault = attrName in generalDefaults;

  // Check if element has any default attributes
  const tagHasDefaults = tag in tagDefaults;

  // Check for legacy attribute rules (element- and attribute-specific)
  const isLegacyAttr = (tag === 'script' && (attrName === 'language' || attrName === 'charset')) || (tag === 'a' && attrName === 'name');

  // If none of these conditions apply, attribute cannot be redundant
  if (!hasGeneralDefault && !tagHasDefaults && !isLegacyAttr) {
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

  // Check general defaults
  if (hasGeneralDefault && /** @type {Record<string, string>} */ (generalDefaults)[attrName] === attrValue) {
    return true;
  }

  // Check tag-specific defaults
  return tagHasDefaults && /** @type {Record<string, string>} */ (/** @type {Record<string, unknown>} */ (tagDefaults)[tag])[attrName] === attrValue;
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
 * @param {string} attrName
 * @param {string} attrValue
 */
function isBooleanAttribute(attrName, attrValue) {
  return isSimpleBoolean.has(attrName) ||
    (attrName === 'draggable' && !isBooleanValue.has(attrValue)) ||
    (collapsibleValues.has(attrName) && collapsibleValues.get(attrName)?.has(attrValue));
}

const uriTypeAttributes = new Map([
  ['a', new Set(['href'])],
  ['area', new Set(['href'])],
  ['link', new Set(['href'])],
  ['base', new Set(['href'])],
  ['img', new Set(['src', 'longdesc', 'usemap'])],
  ['object', new Set(['classid', 'codebase', 'data', 'usemap'])],
  ['q', new Set(['cite'])],
  ['blockquote', new Set(['cite'])],
  ['ins', new Set(['cite'])],
  ['del', new Set(['cite'])],
  ['form', new Set(['action'])],
  ['input', new Set(['src', 'usemap'])],
  ['head', new Set(['profile'])],
  ['script', new Set(['src', 'for'])]
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
  ['object', new Set(['tabindex'])],
  ['button', new Set(['tabindex'])],
  ['input', new Set(['maxlength', 'tabindex'])],
  ['select', new Set(['size', 'tabindex'])],
  ['textarea', new Set(['rows', 'cols', 'tabindex'])],
  ['colgroup', new Set(['span'])],
  ['col', new Set(['span'])],
  ['th', new Set(['rowspan', 'colspan'])],
  ['td', new Set(['rowspan', 'colspan'])]
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
  return attrName === 'srcset' && srcsetElements.has(tag);
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
 */
function canDeleteEmptyAttribute(tag, attrName, attrValue, options) {
  const isValueEmpty = !attrValue || attrValue.trim() === '';
  if (!isValueEmpty) {
    return false;
  }
  if (typeof options.removeEmptyAttributes === 'function') {
    return options.removeEmptyAttributes(attrName, tag);
  }
  return (tag === 'input' && attrName === 'value') || reEmptyAttribute.test(attrName);
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

// Returns the cleaned attribute value directly (sync) or as a Promise (async);
// callers must handle both cases—use `isThenable()` to distinguish
/**
 * @param {string} tag
 * @param {string} attrName
 * @param {string} attrValue
 * @param {Record<string, any>} options
 * @param {HTMLAttribute[]} attrs
 * @param {Function} minifyHTMLSelf
 */
function cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTMLSelf) {
  const isEventAttr = isEventAttribute(attrName, options);

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
    if (options.sortClassNames) {
      attrValue = options.sortClassNames(attrValue);
    } else {
      attrValue = collapseWhitespaceAll(attrValue);
    }
    return attrValue;
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
      const cssResult = options.minifyCSS(attrValue, 'inline');
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
      return cssResult != null ? cssResult : attrValue;
    }
    return attrValue;
  }

  if (isSrcset(attrName, tag)) {
    // https://html.spec.whatwg.org/multipage/embedded-content.html#attr-img-srcset
    const candidates = trimWhitespace(attrValue).split(/\s*,\s*/);
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

  if (isMetaViewport(tag, attrs) && attrName === 'content') {
    return attrValue.replace(/\s+/g, '').replace(/[0-9]+\.[0-9]+/g, function (numString) {
      // 0.90000 → 0.9
      // 1.0 → 1
      // 1.0001 → 1.0001 (unchanged)
      return (+numString).toString();
    });
  }

  if (isContentSecurityPolicy(tag, attrs) && attrName.toLowerCase() === 'content') {
    return collapseWhitespaceAll(attrValue);
  }

  if (options.customAttrCollapse && options.customAttrCollapse.test(attrName)) {
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
    const cssResult = options.minifyCSS(attrValue, 'media');
    if (isThenable(cssResult)) {
      return cssResult.catch((/** @type {Error} */ err) => {
        if (!options.continueOnMinifyError) throw err;
        options.log && options.log(err);
        return originalAttrValue;
      });
    }
    return cssResult != null ? cssResult : attrValue;
  }

  if (tag === 'iframe' && attrName === 'srcdoc') {
    // Recursively minify HTML content within `srcdoc` attribute
    // Fast-path: Skip if nothing would change
    if (!shouldMinifyInnerHTML(options)) {
      return attrValue;
    }
    return minifyHTMLSelf(attrValue, options, true);
  }

  return attrValue;
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
 * @param {Record<string, any>} options
 * @param {Function} minifyHTML
 */
function normalizeAttr(attr, attrs, tag, options, minifyHTML) {
  const attrName = options.name(attr.name);
  let attrValue = attr.value;

  // Entity decoding requires a lazy import—async only when `&` is present
  if (options.decodeEntities && attrValue && attrValue.indexOf('&') !== -1) {
    return getDecodeHTMLStrict().then(decode => {
      return normalizeAttrContinue(attrName, decode(attrValue), attr, attrs, tag, options, minifyHTML);
    });
  }

  return normalizeAttrContinue(attrName, attrValue, attr, attrs, tag, options, minifyHTML);
}

// Internal: Handles attribute normalization after entity decoding (if any)
/**
 * @param {string} attrName
 * @param {string | undefined} attrValue
 * @param {HTMLAttribute} attr
 * @param {HTMLAttribute[]} attrs
 * @param {string} tag
 * @param {Record<string, any>} options
 * @param {Function} minifyHTML
 */
function normalizeAttrContinue(attrName, attrValue, attr, attrs, tag, options, minifyHTML) {
  if ((options.removeRedundantAttributes &&
       isAttributeRedundant(tag, attrName, attrValue ?? '', attrs)) ||
      (options.removeDefaultTypeAttributes && attrName === 'type' && (
        ((tag === 'style' || tag === 'link') && isStyleLinkTypeAttribute(attrValue)) ||
        (tag === 'script' && isScriptTypeAttribute(attrValue) && !keepScriptTypeAttribute(attrValue))
      ))) {
    return;
  }

  if (attrValue) {
    const cleaned = cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTML);
    if (isThenable(cleaned)) {
      return cleaned.then((/** @type {string | undefined} */ v) => normalizeAttrFinish(attrName, v, attr, tag, options));
    }
    return normalizeAttrFinish(attrName, cleaned, attr, tag, options);
  }

  return normalizeAttrFinish(attrName, attrValue, attr, tag, options);
}

// Internal: Final checks and result assembly after value cleaning
/**
 * @param {string} attrName
 * @param {string | undefined} attrValue
 * @param {HTMLAttribute} attr
 * @param {string} tag
 * @param {Record<string, any>} options
 */
function normalizeAttrFinish(attrName, attrValue, attr, tag, options) {
  if (options.removeEmptyAttributes &&
      canDeleteEmptyAttribute(tag, attrName, attrValue, options)) {
    return;
  }

  if (options.decodeEntities && attrValue && attrValue.indexOf('&') !== -1) {
    attrValue = attrValue.replace(RE_AMP_ENTITY, '&amp;$1');
  }

  return {
    attr,
    name: attrName,
    value: attrValue
  };
}

/**
 * @param {{name: string, value?: string, attr: HTMLAttribute}} normalized
 * @param {string | boolean | undefined} hasUnarySlash
 * @param {Record<string, any>} options
 * @param {boolean} isLast
 * @param {string | undefined} uidAttr
 */
function buildAttr(normalized, hasUnarySlash, options, isLast, uidAttr) {
  const attrName = normalized.name;
  let attrValue = normalized.value;
  const attr = normalized.attr;
  let attrQuote = attr.quote;
  let attrFragment;
  let emittedAttrValue;

  // Determine if need to add/keep quotes
  const shouldAddQuotes = typeof attrValue !== 'undefined' && (
    // If `removeAttributeQuotes` is enabled, add quotes only if they can’t be removed
    (options.removeAttributeQuotes && ((uidAttr ? attrValue.indexOf(uidAttr) !== -1 : false) || !canRemoveAttributeQuotes(attrValue))) ||
    // If `removeAttributeQuotes` is not enabled, preserve original quote style or add quotes if value requires them
    (!options.removeAttributeQuotes && (attrQuote !== '' || !canRemoveAttributeQuotes(attrValue) ||
      // Special case: With `removeTagWhitespace`, unquoted values that aren’t last will have space added,
      // which can create ambiguous/invalid HTML—add quotes to be safe
      (options.removeTagWhitespace && attrQuote === '' && !isLast)))
  );

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

      if (attrQuote === '"') {
        attrValue = attrValue.replace(/"/g, '&#34;');
      } else {
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

  if (typeof attrValue === 'undefined' || (options.collapseBooleanAttributes &&
      isBooleanAttribute(attrName.toLowerCase(), (attrValue || '').toLowerCase()))) {
    attrFragment = attrName;
    if (!isLast) {
      attrFragment += ' ';
    }
  } else {
    attrFragment = attrName + attr.customAssign + emittedAttrValue;
  }

  return attr.customOpen + attrFragment + attr.customClose;
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
  isBooleanAttribute,
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