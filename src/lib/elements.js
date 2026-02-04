// Imports

import {
  headerElements,
  descriptionElements,
  pBlockElements,
  rubyEndTagOmission,
  rubyRtcEndTagOmission,
  optionElements,
  tableContentElements,
  tableSectionElements,
  cellElements
} from './constants.js';
import { hasAttrName } from './attributes.js';

// Tag omission rules

function canRemoveParentTag(optionalStartTag, tag) {
  switch (optionalStartTag) {
    case 'html':
    case 'head':
      return true;
    case 'body':
      return !headerElements.has(tag);
    case 'colgroup':
      return tag === 'col';
    case 'tbody':
      return tag === 'tr';
  }
  return false;
}

function isStartTagMandatory(optionalEndTag, tag) {
  switch (tag) {
    case 'colgroup':
      return optionalEndTag === 'colgroup';
    case 'tbody':
      return tableSectionElements.has(optionalEndTag);
  }
  return false;
}

function canRemovePrecedingTag(optionalEndTag, tag) {
  switch (optionalEndTag) {
    case 'html':
    case 'head':
    case 'body':
    case 'colgroup':
    case 'caption':
      return true;
    case 'li':
    case 'optgroup':
    case 'tr':
      return tag === optionalEndTag;
    case 'dt':
    case 'dd':
      return descriptionElements.has(tag);
    case 'p':
      return pBlockElements.has(tag);
    case 'rb':
    case 'rt':
    case 'rp':
      return rubyEndTagOmission.has(tag);
    case 'rtc':
      return rubyRtcEndTagOmission.has(tag);
    case 'option':
      return optionElements.has(tag);
    case 'thead':
    case 'tbody':
      return tableContentElements.has(tag);
    case 'tfoot':
      return tag === 'tbody';
    case 'td':
    case 'th':
      return cellElements.has(tag);
  }
  return false;
}

// Element removal logic

function canRemoveElement(tag, attrs) {
  // Elements with `id` attribute must never be removed—they serve as:
  // - Navigation targets (skip links, URL fragments)
  // - JavaScript selector targets (`getElementById`, `querySelector`)
  // - CSS targets (`:target` pseudo-class, ID selectors)
  // - Accessibility landmarks (ARIA references)
  // - Portal mount points (React portals, etc.)
  if (hasAttrName('id', attrs)) {
    return false;
  }

  switch (tag) {
    case 'textarea':
      return false;
    case 'audio':
    case 'script':
    case 'video':
      if (hasAttrName('src', attrs)) {
        return false;
      }
      break;
    case 'iframe':
      if (hasAttrName('src', attrs) || hasAttrName('srcdoc', attrs)) {
        return false;
      }
      break;
    case 'object':
      if (hasAttrName('data', attrs)) {
        return false;
      }
      break;
    case 'applet':
      if (hasAttrName('code', attrs)) {
        return false;
      }
      break;
  }
  return true;
}

/**
 * @param {string} str - Tag name or HTML-like element spec (e.g., “td” or “<span aria-hidden='true'>”)
 * @param {MinifierOptions} options - Options object for name normalization
 * @returns {{tag: string, attrs: Object.<string, string|undefined>|null}|null} Parsed spec or null if invalid
 */
function parseElementSpec(str, options) {
  if (typeof str !== 'string') {
    return null;
  }

  const trimmed = str.trim();
  if (!trimmed) {
    return null;
  }

  // Simple tag name: `td`
  if (!/[<>]/.test(trimmed)) {
    return { tag: options.name(trimmed), attrs: null };
  }

  // HTML-like markup: `<span aria-hidden='true'>` or `<td></td>`
  // Extract opening tag using regex
  const match = trimmed.match(/^<([a-zA-Z][\w:-]*)((?:\s+[^>]*)?)>/);
  if (!match) {
    return null;
  }

  const tag = options.name(match[1]);
  const attrString = match[2];

  if (!attrString.trim()) {
    return { tag, attrs: null };
  }

  // Parse attributes from string
  const attrs = {};
  const attrRegex = /([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>/]+)))?/g;
  let attrMatch;

  while ((attrMatch = attrRegex.exec(attrString))) {
    const attrName = options.name(attrMatch[1]);
    const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4];
    // Boolean attributes have no value (undefined)
    attrs[attrName] = attrValue;
  }

  return {
    tag,
    attrs: Object.keys(attrs).length > 0 ? attrs : null
  };
}

/**
 * @param {string[]} input - Array of element specifications from `removeEmptyElementsExcept` option
 * @param {MinifierOptions} options - Options object for parsing
 * @returns {Array<{tag: string, attrs: Object.<string, string|undefined>|null}>} Array of parsed element specs
 */
function parseRemoveEmptyElementsExcept(input, options) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map(item => {
    if (typeof item === 'string') {
      const spec = parseElementSpec(item, options);
      if (!spec && options.log) {
        options.log('Warning: Unable to parse “removeEmptyElementsExcept” specification: “' + item + '”');
      }
      return spec;
    }
    if (options.log) {
      options.log('Warning: “removeEmptyElementsExcept” specification must be a string, received: ' + typeof item);
    }
    return null;
  }).filter(Boolean);
}

/**
 * @param {string} tag - Element tag name
 * @param {HTMLAttribute[]} attrs - Array of element attributes
 * @param {Array<{tag: string, attrs: Object.<string, string|undefined>|null}>} preserveList - Parsed preserve specs
 * @returns {boolean} True if the empty element should be preserved
 */
function shouldPreserveEmptyElement(tag, attrs, preserveList) {
  for (const spec of preserveList) {
    // Tag name must match
    if (spec.tag !== tag) {
      continue;
    }

    // If no attributes specified in spec, tag match is enough
    if (!spec.attrs) {
      return true;
    }

    // Check if all specified attributes match
    const allAttrsMatch = Object.entries(spec.attrs).every(([name, value]) => {
      const attr = attrs.find(a => a.name === name);
      if (!attr) {
        return false; // Attribute not present
      }
      // Boolean attribute in spec (undefined value) matches if attribute is present
      if (value === undefined) {
        return true;
      }
      // Valued attribute must match exactly
      return attr.value === value;
    });

    if (allAttrsMatch) {
      return true;
    }
  }

  return false;
}

// Exports

export {
  // Tag omission
  canRemoveParentTag,
  isStartTagMandatory,
  canRemovePrecedingTag,

  // Element removal
  canRemoveElement,
  parseElementSpec,
  parseRemoveEmptyElementsExcept,
  shouldPreserveEmptyElement
};