// Imports

import { decodeHTMLStrict } from 'entities';
import {
  RE_CONDITIONAL_COMMENT,
  RE_EVENT_ATTR_DEFAULT,
  RE_CAN_REMOVE_ATTR_QUOTES,
  RE_AMP_ENTITY,
  generalDefaults,
  tagDefaults,
  executableScriptsMimetypes,
  keepScriptsMimetypes,
  isSimpleBoolean,
  isBooleanValue,
  srcsetTags,
  reEmptyAttribute
} from './constants.js';
import { trimWhitespace, collapseWhitespaceAll } from './whitespace.js';
import { shouldMinifyInnerHTML } from './options.js';

// Validators

function isConditionalComment(text) {
  return RE_CONDITIONAL_COMMENT.test(text);
}

function isIgnoredComment(text, options) {
  for (let i = 0, len = options.ignoreCustomComments.length; i < len; i++) {
    if (options.ignoreCustomComments[i].test(text)) {
      return true;
    }
  }
  return false;
}

function isEventAttribute(attrName, options) {
  const patterns = options.customEventAttributes;
  if (patterns) {
    for (let i = patterns.length; i--;) {
      if (patterns[i].test(attrName)) {
        return true;
      }
    }
    return false;
  }
  return RE_EVENT_ATTR_DEFAULT.test(attrName);
}

function canRemoveAttributeQuotes(value) {
  // https://mathiasbynens.be/notes/unquoted-attribute-values
  return RE_CAN_REMOVE_ATTR_QUOTES.test(value);
}

function attributesInclude(attributes, attribute) {
  for (let i = attributes.length; i--;) {
    if (attributes[i].name.toLowerCase() === attribute) {
      return true;
    }
  }
  return false;
}

function isAttributeRedundant(tag, attrName, attrValue, attrs) {
  attrValue = attrValue ? trimWhitespace(attrValue.toLowerCase()) : '';

  // Legacy attributes
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
  if (generalDefaults[attrName] === attrValue) {
    return true;
  }

  // Check tag-specific defaults
  return tagDefaults[tag]?.[attrName] === attrValue;
}

function isScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0]).toLowerCase();
  return attrValue === '' || executableScriptsMimetypes.has(attrValue);
}

function keepScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0]).toLowerCase();
  return keepScriptsMimetypes.has(attrValue);
}

function isExecutableScript(tag, attrs) {
  if (tag !== 'script') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      return isScriptTypeAttribute(attrs[i].value);
    }
  }
  return true;
}

function isStyleLinkTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue).toLowerCase();
  return attrValue === '' || attrValue === 'text/css';
}

function isStyleSheet(tag, attrs) {
  if (tag !== 'style') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      return isStyleLinkTypeAttribute(attrs[i].value);
    }
  }
  return true;
}

function isBooleanAttribute(attrName, attrValue) {
  return isSimpleBoolean.has(attrName) || (attrName === 'draggable' && !isBooleanValue.has(attrValue));
}

function isUriTypeAttribute(attrName, tag) {
  return (
    (/^(?:a|area|link|base)$/.test(tag) && attrName === 'href') ||
    (tag === 'img' && /^(?:src|longdesc|usemap)$/.test(attrName)) ||
    (tag === 'object' && /^(?:classid|codebase|data|usemap)$/.test(attrName)) ||
    (tag === 'q' && attrName === 'cite') ||
    (tag === 'blockquote' && attrName === 'cite') ||
    ((tag === 'ins' || tag === 'del') && attrName === 'cite') ||
    (tag === 'form' && attrName === 'action') ||
    (tag === 'input' && (attrName === 'src' || attrName === 'usemap')) ||
    (tag === 'head' && attrName === 'profile') ||
    (tag === 'script' && (attrName === 'src' || attrName === 'for'))
  );
}

function isNumberTypeAttribute(attrName, tag) {
  return (
    (/^(?:a|area|object|button)$/.test(tag) && attrName === 'tabindex') ||
    (tag === 'input' && (attrName === 'maxlength' || attrName === 'tabindex')) ||
    (tag === 'select' && (attrName === 'size' || attrName === 'tabindex')) ||
    (tag === 'textarea' && /^(?:rows|cols|tabindex)$/.test(attrName)) ||
    (tag === 'colgroup' && attrName === 'span') ||
    (tag === 'col' && attrName === 'span') ||
    ((tag === 'th' || tag === 'td') && (attrName === 'rowspan' || attrName === 'colspan'))
  );
}

function isLinkType(tag, attrs, value) {
  if (tag !== 'link') return false;
  const needle = String(value).toLowerCase();
  for (let i = 0; i < attrs.length; i++) {
    if (attrs[i].name.toLowerCase() === 'rel') {
      const tokens = String(attrs[i].value).toLowerCase().split(/\s+/);
      if (tokens.includes(needle)) return true;
    }
  }
  return false;
}

function isMediaQuery(tag, attrs, attrName) {
  return attrName === 'media' && (isLinkType(tag, attrs, 'stylesheet') || isStyleSheet(tag, attrs));
}

function isSrcset(attrName, tag) {
  return attrName === 'srcset' && srcsetTags.has(tag);
}

function isMetaViewport(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i].name === 'name' && attrs[i].value === 'viewport') {
      return true;
    }
  }
  return false;
}

function isContentSecurityPolicy(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i].name.toLowerCase() === 'http-equiv' && attrs[i].value.toLowerCase() === 'content-security-policy') {
      return true;
    }
  }
  return false;
}

function canDeleteEmptyAttribute(tag, attrName, attrValue, options) {
  const isValueEmpty = !attrValue || /^\s*$/.test(attrValue);
  if (!isValueEmpty) {
    return false;
  }
  if (typeof options.removeEmptyAttributes === 'function') {
    return options.removeEmptyAttributes(attrName, tag);
  }
  return (tag === 'input' && attrName === 'value') || reEmptyAttribute.test(attrName);
}

function hasAttrName(name, attrs) {
  for (let i = attrs.length - 1; i >= 0; i--) {
    if (attrs[i].name === name) {
      return true;
    }
  }
  return false;
}

// Cleaners

async function cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTMLSelf) {
  // Apply early whitespace normalization if enabled
  // Preserves special spaces (non-breaking space, hair space, etc.) for consistency with `collapseWhitespace`
  if (options.collapseAttributeWhitespace) {
    attrValue = attrValue.replace(/[ \n\r\t\f]+/g, ' ').replace(/^[ \n\r\t\f]+|[ \n\r\t\f]+$/g, '');
  }

  if (isEventAttribute(attrName, options)) {
    attrValue = trimWhitespace(attrValue).replace(/^javascript:\s*/i, '');
    return options.minifyJS(attrValue, true);
  } else if (attrName === 'class') {
    attrValue = trimWhitespace(attrValue);
    if (options.sortClassName) {
      attrValue = options.sortClassName(attrValue);
    } else {
      attrValue = collapseWhitespaceAll(attrValue);
    }
    return attrValue;
  } else if (isUriTypeAttribute(attrName, tag)) {
    attrValue = trimWhitespace(attrValue);
    if (isLinkType(tag, attrs, 'canonical')) {
      return attrValue;
    }
    try {
      const out = await options.minifyURLs(attrValue);
      return typeof out === 'string' ? out : attrValue;
    } catch (err) {
      if (!options.continueOnMinifyError) {
        throw err;
      }
      options.log && options.log(err);
      return attrValue;
    }
  } else if (isNumberTypeAttribute(attrName, tag)) {
    return trimWhitespace(attrValue);
  } else if (attrName === 'style') {
    attrValue = trimWhitespace(attrValue);
    if (attrValue) {
      if (attrValue.endsWith(';') && !/&#?[0-9a-zA-Z]+;$/.test(attrValue)) {
        attrValue = attrValue.replace(/\s*;$/, ';');
      }
      attrValue = await options.minifyCSS(attrValue, 'inline');
    }
    return attrValue;
  } else if (isSrcset(attrName, tag)) {
    // https://html.spec.whatwg.org/multipage/embedded-content.html#attr-img-srcset
    attrValue = (await Promise.all(trimWhitespace(attrValue).split(/\s*,\s*/).map(async function (candidate) {
      let url = candidate;
      let descriptor = '';
      const match = candidate.match(/\s+([1-9][0-9]*w|[0-9]+(?:\.[0-9]+)?x)$/);
      if (match) {
        url = url.slice(0, -match[0].length);
        const num = +match[1].slice(0, -1);
        const suffix = match[1].slice(-1);
        if (num !== 1 || suffix !== 'x') {
          descriptor = ' ' + num + suffix;
        }
      }
      try {
        const out = await options.minifyURLs(url);
        return (typeof out === 'string' ? out : url) + descriptor;
      } catch (err) {
        if (!options.continueOnMinifyError) {
          throw err;
        }
        options.log && options.log(err);
        return url + descriptor;
      }
    }))).join(', ');
  } else if (isMetaViewport(tag, attrs) && attrName === 'content') {
    attrValue = attrValue.replace(/\s+/g, '').replace(/[0-9]+\.[0-9]+/g, function (numString) {
      // 0.90000 → 0.9
      // 1.0 → 1
      // 1.0001 → 1.0001 (unchanged)
      return (+numString).toString();
    });
  } else if (isContentSecurityPolicy(tag, attrs) && attrName.toLowerCase() === 'content') {
    return collapseWhitespaceAll(attrValue);
  } else if (options.customAttrCollapse && options.customAttrCollapse.test(attrName)) {
    attrValue = trimWhitespace(attrValue.replace(/ ?[\n\r]+ ?/g, '').replace(/\s{2,}/g, options.conservativeCollapse ? ' ' : ''));
  } else if (tag === 'script' && attrName === 'type') {
    attrValue = trimWhitespace(attrValue.replace(/\s*;\s*/g, ';'));
  } else if (isMediaQuery(tag, attrs, attrName)) {
    attrValue = trimWhitespace(attrValue);
    return options.minifyCSS(attrValue, 'media');
  } else if (tag === 'iframe' && attrName === 'srcdoc') {
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
 * @param {Object} options - Minifier options
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

async function normalizeAttr(attr, attrs, tag, options, minifyHTML) {
  const attrName = options.name(attr.name);
  let attrValue = attr.value;

  if (options.decodeEntities && attrValue) {
    // Fast path: Only decode when entities are present
    if (attrValue.indexOf('&') !== -1) {
      attrValue = decodeHTMLStrict(attrValue);
    }
  }

  if ((options.removeRedundantAttributes &&
      isAttributeRedundant(tag, attrName, attrValue, attrs)) ||
    (options.removeScriptTypeAttributes && tag === 'script' &&
      attrName === 'type' && isScriptTypeAttribute(attrValue) && !keepScriptTypeAttribute(attrValue)) ||
    (options.removeStyleLinkTypeAttributes && (tag === 'style' || tag === 'link') &&
      attrName === 'type' && isStyleLinkTypeAttribute(attrValue))) {
    return;
  }

  if (attrValue) {
    attrValue = await cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTML);
  }

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

function buildAttr(normalized, hasUnarySlash, options, isLast, uidAttr) {
  const attrName = normalized.name;
  let attrValue = normalized.value;
  const attr = normalized.attr;
  let attrQuote = attr.quote;
  let attrFragment;
  let emittedAttrValue;

  if (typeof attrValue !== 'undefined' && (!options.removeAttributeQuotes ||
    ~attrValue.indexOf(uidAttr) || !canRemoveAttributeQuotes(attrValue))) {
    // Determine the appropriate quote character
    if (!options.preventAttributesEscaping) {
      // Normal mode: choose quotes and escape
      attrQuote = chooseAttributeQuote(attrValue, options);
      if (attrQuote === '"') {
        attrValue = attrValue.replace(/"/g, '&#34;');
      } else {
        attrValue = attrValue.replace(/'/g, '&#39;');
      }
    } else {
      // `preventAttributesEscaping` mode: choose safe quotes but don't escape
      // except when both quote types are present—then escape to prevent invalid HTML
      const hasDoubleQuote = attrValue.indexOf('"') !== -1;
      const hasSingleQuote = attrValue.indexOf("'") !== -1;

      if (hasDoubleQuote && hasSingleQuote) {
        // Both quote types present: `preventAttributesEscaping` is ignored to ensure valid HTML
        // Choose the quote type with fewer occurrences and escape the other
        attrQuote = chooseAttributeQuote(attrValue, options);
        if (attrQuote === '"') {
          attrValue = attrValue.replace(/"/g, '&#34;');
        } else {
          attrValue = attrValue.replace(/'/g, '&#39;');
        }
      } else if (typeof options.quoteCharacter === 'undefined') {
        // Single or no quote type: Choose safe quote delimiter
        if (attrQuote === '"' && hasDoubleQuote && !hasSingleQuote) {
          attrQuote = "'";
        } else if (attrQuote === "'" && hasSingleQuote && !hasDoubleQuote) {
          attrQuote = '"';
        } else if (attrQuote !== '"' && attrQuote !== "'" && attrQuote !== '') {
          // `attrQuote` is invalid/undefined (not `"`, `'`, or empty string)
          // Set a safe default based on the value’s content
          if (hasSingleQuote && !hasDoubleQuote) {
            attrQuote = '"'; // Value has single quotes, use double quotes as delimiter
          } else if (hasDoubleQuote && !hasSingleQuote) {
            attrQuote = "'"; // Value has double quotes, use single quotes as delimiter
          } else {
            attrQuote = '"'; // No quotes in value, default to double quotes
          }
        }
      } else {
        attrQuote = options.quoteCharacter === '\'' ? '\'' : '"';
      }
    }
    emittedAttrValue = attrQuote + attrValue + attrQuote;
    if (!isLast && !options.removeTagWhitespace) {
      emittedAttrValue += ' ';
    }
  } else if (isLast && !hasUnarySlash) {
    // Last attribute in a non-self-closing tag: no space needed
    emittedAttrValue = attrValue;
  } else {
    // Not last attribute, or is a self-closing tag: add space
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
  isConditionalComment,
  isIgnoredComment,
  isEventAttribute,
  canRemoveAttributeQuotes,
  attributesInclude,
  isAttributeRedundant,
  isScriptTypeAttribute,
  keepScriptTypeAttribute,
  isExecutableScript,
  isStyleLinkTypeAttribute,
  isStyleSheet,
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
  buildAttr
};