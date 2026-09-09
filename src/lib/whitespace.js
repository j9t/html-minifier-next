/**
 * Whitespace trimming and collapsing
 */

import {
  RE_ALL_WS_NBSP,
  RE_NBSP_LEADING_GROUP,
  RE_NBSP_LEAD_GROUP,
  RE_NBSP_TRAILING_GROUP,
  RE_NBSP_TRAILING_STRIP,
  inlineElementsToKeepWhitespace,
  inlineElementsToKeepWhitespaceWithin,
  formControlElements
} from './constants.js';

const RE_ANY_WS_NBSP = /[ \n\r\t\f\xA0]/;
const RE_TAB_NBSP = /[\t\xA0]/;
const RE_ASCII_WS_RUN = /[ \n\r\f]+/g;
const RE_NEEDS_COLLAPSE = /[\n\r\f]| {2}/;
const RE_NON_WS = /\S/;

// Trim whitespace

/** @param {string} str */
const trimWhitespace = str => {
  if (!str) return str;
  let start = 0;
  let end = str.length;
  while (start < end && isAsciiWs(str.charCodeAt(start))) start++;
  while (end > start && isAsciiWs(str.charCodeAt(end - 1))) end--;
  return start === 0 && end === str.length ? str : str.slice(start, end);
};

/** @param {number} code */
function isAsciiWs(code) {
  return code === 32 || code === 10 || code === 13 || code === 9 || code === 12;
}

/** @param {number} code */
function isWsOrNbsp(code) {
  return code === 32 || code === 10 || code === 13 || code === 9 || code === 12 || code === 160;
}

// Collapse all whitespace

// Module scope so the hot path doesn’t allocate a closure per call
/** @param {string} spaces */
function collapseRun(spaces) {
  // Preserve standalone tabs
  if (spaces === '\t') return '\t';
  if (spaces.indexOf('\xA0') === -1) return ' ';
  return spaces.replace(RE_NBSP_LEADING_GROUP, '$1 ');
}

/** @param {string} str */
function collapseWhitespaceAll(str) {
  if (!str) return str;
  // Fast path: If there are no common whitespace characters, return early
  if (!RE_ANY_WS_NBSP.test(str)) {
    return str;
  }
  return collapseWhitespaceAllKnown(str);
}

// As `collapseWhitespaceAll`, for callers that already know `str` holds whitespace
/** @param {string} str */
function collapseWhitespaceAllKnown(str) {
  // Only a tab or a no-break space makes the replacement depend on the run itself;
  // without either, every run becomes one space and no per-match callback is needed
  if (!RE_TAB_NBSP.test(str)) {
    return RE_NEEDS_COLLAPSE.test(str) ? str.replace(RE_ASCII_WS_RUN, ' ') : str;
  }
  return str.replace(RE_ALL_WS_NBSP, collapseRun);
}

// Collapse whitespace with options

/**
 * @param {string} str
 * @param {{preserveLineBreaks?: boolean | undefined, conservativeCollapse?: boolean | undefined}} options
 * @param {boolean} trimLeft
 * @param {boolean} trimRight
 * @param {boolean} [collapseAll]
 */
function collapseWhitespace(str, options, trimLeft, trimRight, collapseAll = false) {
  if (!str) return str;

  // Fast path: Nothing to do
  if (!trimLeft && !trimRight && !collapseAll && !options.preserveLineBreaks) {
    return str;
  }

  // Fast path: No whitespace at all
  if (!RE_ANY_WS_NBSP.test(str)) {
    return str;
  }

  return collapseWhitespaceKnown(str, options, trimLeft, trimRight, collapseAll);
}

// As `collapseWhitespace`, for callers that already know `str` is non-empty, holds
// whitespace, and has something to do
/**
 * @param {string} str
 * @param {{preserveLineBreaks?: boolean | undefined, conservativeCollapse?: boolean | undefined}} options
 * @param {boolean} trimLeft
 * @param {boolean} trimRight
 * @param {boolean} collapseAll
 */
function collapseWhitespaceKnown(str, options, trimLeft, trimRight, collapseAll) {
  let lineBreakBefore = ''; let lineBreakAfter = '';

  if (options.preserveLineBreaks) {
    // Find leading/trailing whitespace containing line breaks manually
    // (avoids polynomial backtracking with end-anchored lazy quantifiers)
    let leadEnd = 0;
    while (leadEnd < str.length && isAsciiWs(str.charCodeAt(leadEnd))) {
      leadEnd++;
    }
    if (leadEnd > 0) {
      const leading = str.slice(0, leadEnd);
      if (/[\n\r]/.test(leading)) {
        lineBreakBefore = '\n';
        str = str.slice(leadEnd);
      }
    }
    let trailStart = str.length;
    while (trailStart > 0 && isAsciiWs(str.charCodeAt(trailStart - 1))) {
      trailStart--;
    }
    if (trailStart < str.length) {
      const trailing = str.slice(trailStart);
      if (/[\n\r]/.test(trailing)) {
        lineBreakAfter = '\n';
        str = str.slice(0, trailStart);
      }
    }
  }

  if (trimLeft) {
    // Find the leading whitespace boundary with a loop, so the common case neither
    // allocates a replacer closure nor runs the regex machinery
    let start = 0;
    while (start < str.length && isWsOrNbsp(str.charCodeAt(start))) {
      start++;
    }
    if (start > 0) {
      const spaces = str.slice(0, start);
      const conservative = !lineBreakBefore && options.conservativeCollapse;
      let replacement;
      if (conservative && spaces === '\t') {
        replacement = '\t';
      } else if (spaces.indexOf('\xA0') === -1) {
        // No no-break space: The whole run goes
        replacement = conservative ? ' ' : '';
      } else {
        // No-break space is specifically handled via the nested regexes
        replacement = spaces.replace(/^[^\xA0]+/, '').replace(RE_NBSP_LEAD_GROUP, '$1 ') || (conservative ? ' ' : '');
      }
      str = replacement + str.slice(start);
    }
  }

  if (trimRight) {
    // Find trailing whitespace boundary manually (avoids polynomial backtracking
    // with `/[ \n\r\t\f\xA0]+$/` on strings with long internal whitespace runs)
    let end = str.length;
    while (end > 0 && isWsOrNbsp(str.charCodeAt(end - 1))) {
      end--;
    }
    if (end < str.length) {
      const spaces = str.slice(end);
      const conservative = !lineBreakAfter && options.conservativeCollapse;
      let replacement;
      if (conservative && spaces === '\t') {
        replacement = '\t';
      } else if (spaces.indexOf('\xA0') === -1) {
        // No no-break space: The whole run goes
        replacement = conservative ? ' ' : '';
      } else {
        // No-break space is specifically handled via the nested regexes
        replacement = spaces.replace(RE_NBSP_TRAILING_GROUP, ' $1').replace(RE_NBSP_TRAILING_STRIP, '') || (conservative ? ' ' : '');
      }
      str = str.slice(0, end) + replacement;
    }
  }

  if (collapseAll && str) {
    // Strip non-space whitespace then compress spaces to one
    str = collapseWhitespaceAllKnown(str);
  }

  // Avoid string concatenation when no line breaks (common case)
  if (!lineBreakBefore && !lineBreakAfter) return str;
  if (!lineBreakBefore) return str + lineBreakAfter;
  if (!lineBreakAfter) return lineBreakBefore + str;
  return lineBreakBefore + str + lineBreakAfter;
}

// Collapse whitespace smartly based on surrounding tags

// Check if an input element has `type="hidden"`; module-scope so the hot path
// doesn’t allocate a closure per text node
/**
 * @param {Array<{name: string, value?: string}>} attrs
 */
function isHiddenInput(attrs) {
  if (!attrs || !attrs.length) return false;
  for (const attr of attrs) {
    if (attr.name === 'type') {
      return attr.value === 'hidden';
    }
  }
  return false;
}

/**
 * @param {string} str
 * @param {string} prevTag
 * @param {string} nextTag
 * @param {Array<{name: string, value?: string}>} prevAttrs
 * @param {Array<{name: string, value?: string}>} nextAttrs
 * @param {{preserveLineBreaks?: boolean, conservativeCollapse?: boolean, collapseInlineTagWhitespace?: boolean}} options
 * @param {Set<string>} inlineElements
 * @param {Set<string>} inlineTextSet
 */
function collapseWhitespaceSmart(str, prevTag, nextTag, prevAttrs, nextAttrs, options, inlineElements, inlineTextSet) {
  if (!str) return str;

  // Fast path: No whitespace at all—every decision below would leave `str`
  // untouched (`collapseWhitespace` returns such strings unchanged)
  if (!RE_ANY_WS_NBSP.test(str)) {
    return str;
  }

  const inlineOption = Boolean(options.collapseInlineTagWhitespace);

  let trimLeft = Boolean(prevTag) && !inlineElementsToKeepWhitespace.has(prevTag);
  let trimRight = Boolean(nextTag) && !inlineElementsToKeepWhitespace.has(nextTag);

  // Every branch below that consults the text’s content needs a side left untrimmed,
  // so the scan for a non-whitespace character is only worth making then
  const isPureWhitespace = (!trimLeft || !trimRight) && !RE_NON_WS.test(str);

  if (isPureWhitespace) {
    // Smart default behavior: Collapse space around non-rendering elements
    // (`type="hidden"`); this happens even in basic `collapseWhitespace` mode
    if (!trimLeft && prevTag === 'input' && isHiddenInput(prevAttrs)) {
      trimLeft = true;
    }
    if (!trimRight && nextTag === 'input' && isHiddenInput(nextAttrs)) {
      trimRight = true;
    }
    // Aggressive mode: Collapse between all form controls
    if (inlineOption && (!trimLeft || !trimRight) &&
        formControlElements.has(stripSlash(prevTag)) && formControlElements.has(stripSlash(nextTag))) {
      trimLeft = true;
      trimRight = true;
    }
  }

  if (trimLeft) {
    if (inlineOption) {
      // Still preserve whitespace around inline text elements
      if (inlineElementsToKeepWhitespaceWithin.has(stripSlash(prevTag))) {
        trimLeft = false;
      }
    } else {
      trimLeft = prevTag.charCodeAt(0) === 47 /* / */ ? !inlineElements.has(prevTag.slice(1)) : !inlineTextSet.has(prevTag);
    }
  }

  if (trimRight) {
    if (inlineOption) {
      if (inlineElementsToKeepWhitespaceWithin.has(stripSlash(nextTag))) {
        trimRight = false;
      }
    } else {
      trimRight = nextTag.charCodeAt(0) === 47 /* / */ ? !inlineTextSet.has(nextTag.slice(1)) : !inlineElements.has(nextTag);
    }
  }

  const collapseAll = Boolean(prevTag && nextTag);
  if (!trimLeft && !trimRight && !collapseAll && !options.preserveLineBreaks) {
    return str;
  }
  return collapseWhitespaceKnown(str, options, trimLeft, trimRight, collapseAll);
}

/** @param {string} tag */
function stripSlash(tag) {
  return tag && tag.charCodeAt(0) === 47 /* / */ ? tag.slice(1) : tag;
}

// Collapse/trim whitespace for given tag

// `xmp`, `listing`, and `plaintext` render preformatted, as `pre` does
// https://html.spec.whatwg.org/multipage/rendering.html#the-page
const noCollapseWhitespaceTags = new Set(['script', 'style', 'pre', 'textarea', 'xmp', 'listing', 'plaintext']);
const noTrimWhitespaceTags = new Set(['pre', 'textarea', 'xmp', 'listing', 'plaintext']);

/** @param {string} tag */
function canCollapseWhitespace(tag) {
  return !noCollapseWhitespaceTags.has(tag);
}

/** @param {string} tag */
function canTrimWhitespace(tag) {
  return !noTrimWhitespaceTags.has(tag);
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