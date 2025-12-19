// Imports

import {
  RE_WS_START,
  RE_WS_END,
  RE_ALL_WS_NBSP,
  RE_NBSP_LEADING_GROUP,
  RE_NBSP_LEAD_GROUP,
  RE_NBSP_TRAILING_GROUP,
  RE_NBSP_TRAILING_STRIP,
  inlineElementsToKeepWhitespace
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
  // Non-breaking space is specifically handled inside the replacer function here:
  return str.replace(RE_ALL_WS_NBSP, function (spaces) {
    return spaces === '\t' ? '\t' : spaces.replace(RE_NBSP_LEADING_GROUP, '$1 ');
  });
}

// Collapse whitespace with options

function collapseWhitespace(str, options, trimLeft, trimRight, collapseAll) {
  let lineBreakBefore = ''; let lineBreakAfter = '';

  if (!str) return str;

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

  return lineBreakBefore + str + lineBreakAfter;
}

// Collapse whitespace smartly based on surrounding tags

function collapseWhitespaceSmart(str, prevTag, nextTag, options, inlineElements, inlineTextSet) {
  let trimLeft = prevTag && !inlineElementsToKeepWhitespace.has(prevTag);
  if (trimLeft && !options.collapseInlineTagWhitespace) {
    trimLeft = prevTag.charAt(0) === '/' ? !inlineElements.has(prevTag.slice(1)) : !inlineTextSet.has(prevTag);
  }
  let trimRight = nextTag && !inlineElementsToKeepWhitespace.has(nextTag);
  if (trimRight && !options.collapseInlineTagWhitespace) {
    trimRight = nextTag.charAt(0) === '/' ? !inlineTextSet.has(nextTag.slice(1)) : !inlineElements.has(nextTag);
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