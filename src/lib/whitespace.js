// Imports

import {
  RE_WS_START,
  RE_WS_END,
  RE_ALL_WS_NBSP,
  RE_NBSP_LEADING_GROUP,
  RE_NBSP_LEAD_GROUP,
  RE_NBSP_TRAILING_GROUP,
  RE_NBSP_TRAILING_STRIP,
  inlineElementsToKeepWhitespace,
  inlineElementsToKeepWhitespaceWithin
} from './constants.js';

// Trim whitespace

const trimWhitespace = str => {
  if (!str) return str;
  // Fast path: If no whitespace at start or end, return early
  if (!/^[ \n\r\t\f]/.test(str) && !/[ \n\r\t\f]$/.test(str)) {
    return str;
  }
  return str.replace(RE_WS_START, '').replace(RE_WS_END, '');
};

// Collapse all whitespace

function collapseWhitespaceAll(str) {
  if (!str) return str;
  // Fast path: If there are no common whitespace characters, return early
  if (!/[ \n\r\t\f\xA0]/.test(str)) {
    return str;
  }
  // No-break space is specifically handled inside the replacer function here:
  return str.replace(RE_ALL_WS_NBSP, function (spaces) {
    // Preserve standalone tabs
    if (spaces === '\t') return '\t';
    // Fast path: No no-break space, common case—just collapse to single space
    // This avoids the nested regex for the majority of cases
    if (spaces.indexOf('\xA0') === -1) return ' ';
    // For no-break space handling, use the original regex approach
    return spaces.replace(RE_NBSP_LEADING_GROUP, '$1 ');
  });
}

// Collapse whitespace with options

function collapseWhitespace(str, options, trimLeft, trimRight, collapseAll) {
  let lineBreakBefore = ''; let lineBreakAfter = '';

  if (!str) return str;

  // Fast path: Nothing to do
  if (!trimLeft && !trimRight && !collapseAll && !options.preserveLineBreaks) {
    return str;
  }

  // Fast path: No whitespace at all
  if (!/[ \n\r\t\f\xA0]/.test(str)) {
    return str;
  }

  if (options.preserveLineBreaks) {
    str = str.replace(/^[ \n\r\t\f]*?[\n\r][ \n\r\t\f]*/, function () {
      lineBreakBefore = '\n';
      return '';
    }).replace(/[ \n\r\t\f]*?[\n\r][ \n\r\t\f]*$/, function () {
      lineBreakAfter = '\n';
      return '';
    });
  }

  if (trimLeft) {
    // Non-breaking space is specifically handled inside the replacer function
    str = str.replace(/^[ \n\r\t\f\xA0]+/, function (spaces) {
      const conservative = !lineBreakBefore && options.conservativeCollapse;
      if (conservative && spaces === '\t') {
        return '\t';
      }
      return spaces.replace(/^[^\xA0]+/, '').replace(RE_NBSP_LEAD_GROUP, '$1 ') || (conservative ? ' ' : '');
    });
  }

  if (trimRight) {
    // Non-breaking space is specifically handled inside the replacer function
    str = str.replace(/[ \n\r\t\f\xA0]+$/, function (spaces) {
      const conservative = !lineBreakAfter && options.conservativeCollapse;
      if (conservative && spaces === '\t') {
        return '\t';
      }
      return spaces.replace(RE_NBSP_TRAILING_GROUP, ' $1').replace(RE_NBSP_TRAILING_STRIP, '') || (conservative ? ' ' : '');
    });
  }

  if (collapseAll) {
    // Strip non-space whitespace then compress spaces to one
    str = collapseWhitespaceAll(str);
  }

  // Avoid string concatenation when no line breaks (common case)
  if (!lineBreakBefore && !lineBreakAfter) return str;
  if (!lineBreakBefore) return str + lineBreakAfter;
  if (!lineBreakAfter) return lineBreakBefore + str;
  return lineBreakBefore + str + lineBreakAfter;
}

/**
 * Decide and apply whitespace trimming/collapse based on surrounding tag context.
 *
 * Determines whether to trim whitespace on the left and/or right of `str` using the surrounding
 * `prevTag` and `nextTag`, considers `options.collapseInlineTagWhitespace` and the provided sets
 * of inline elements, then delegates to collapseWhitespace with the computed flags.
 *
 * @param {string} str - Input string whose whitespace should be processed.
 * @param {string|undefined} prevTag - The previous tag token (may start with '/' for a closing tag) or undefined.
 * @param {string|undefined} nextTag - The next tag token (may start with '/' for a closing tag) or undefined.
 * @param {Object} options - Behavior flags that affect trimming and collapsing (reads `collapseInlineTagWhitespace`).
 * @param {Set<string>} inlineElements - Set of inline element tag names used to decide trimming around tags.
 * @param {Set<string>} inlineTextSet - Set of inline text element tag names used to decide trimming around tags.
 * @returns {string} The input string with whitespace collapsed/trimmed according to surrounding tags and options.

function collapseWhitespaceSmart(str, prevTag, nextTag, options, inlineElements, inlineTextSet) {
  let trimLeft = prevTag && !inlineElementsToKeepWhitespace.has(prevTag);
  if (trimLeft && !options.collapseInlineTagWhitespace) {
    trimLeft = prevTag.charAt(0) === '/' ? !inlineElements.has(prevTag.slice(1)) : !inlineTextSet.has(prevTag);
  }
  // When `collapseInlineTagWhitespace` is enabled, still preserve whitespace around inline text elements
  if (trimLeft && options.collapseInlineTagWhitespace) {
    const tagName = prevTag.charAt(0) === '/' ? prevTag.slice(1) : prevTag;
    if (inlineElementsToKeepWhitespaceWithin.has(tagName)) {
      trimLeft = false;
    }
  }
  let trimRight = nextTag && !inlineElementsToKeepWhitespace.has(nextTag);
  if (trimRight && !options.collapseInlineTagWhitespace) {
    trimRight = nextTag.charAt(0) === '/' ? !inlineTextSet.has(nextTag.slice(1)) : !inlineElements.has(nextTag);
  }
  // When `collapseInlineTagWhitespace` is enabled, still preserve whitespace around inline text elements
  if (trimRight && options.collapseInlineTagWhitespace) {
    const tagName = nextTag.charAt(0) === '/' ? nextTag.slice(1) : nextTag;
    if (inlineElementsToKeepWhitespaceWithin.has(tagName)) {
      trimRight = false;
    }
  }
  return collapseWhitespace(str, options, trimLeft, trimRight, prevTag && nextTag);
}

// Collapse/trim whitespace for given tag

function canCollapseWhitespace(tag) {
  return !/^(?:script|style|pre|textarea)$/.test(tag);
}

function canTrimWhitespace(tag) {
  return !/^(?:pre|textarea)$/.test(tag);
}

// Exports

export {
  trimWhitespace,
  collapseWhitespaceAll,
  collapseWhitespace,
  collapseWhitespaceSmart,
  canCollapseWhitespace,
  canTrimWhitespace
};