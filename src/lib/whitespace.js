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
  inlineElementsToKeepWhitespaceAround,
  inlineElementsToKeepWhitespaceWithin,
  inlineElementsToKeepWhitespaceBetween,
  inlineElementsToKeepWhitespaceBetweenEnd,
  inlineElementsTransparent,
  inlineElementsTransparentAfter,
  formControlElementsEither,
  toEndTags
} from './constants.js';

const RE_ANY_WS_NBSP = /[ \n\r\t\f\xA0]/;
const RE_TAB_NBSP = /[\t\xA0]/;
const RE_ASCII_WS_RUN = /[ \n\r\f]+/g;
// Every reason `collapseWhitespaceAllKnown` has to do any work at all, in one scan
const RE_COLLAPSIBLE = /[\t\xA0\n\r\f]| {2}/;
const RE_NON_WS = /\S/;
// Any no-break space character (the `collapseNoBreakSpaces` early-exit scan)
const RE_NO_BREAK_SPACE_CHARS = /[\xA0\u202F\u2007]/;

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

// Whether the last character is whitespace, no-break space included
/** @param {string} str */
function endsWithWhitespace(str) {
  return str.length > 0 && isWsOrNbsp(str.charCodeAt(str.length - 1));
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
  // Most text reaching here is already collapsed, so settle that in one scan rather
  // than two—single spaces with no tab and no no-break space leave nothing to do
  if (!RE_COLLAPSIBLE.test(str)) {
    return str;
  }
  // Only a tab or a no-break space makes the replacement depend on the run itself;
  // without either, every run becomes one space and no per-match callback is needed
  if (!RE_TAB_NBSP.test(str)) {
    return str.replace(RE_ASCII_WS_RUN, ' ');
  }
  return str.replace(RE_ALL_WS_NBSP, collapseRun);
}

// Collapse whitespace into adjacent no-break spaces

// A no-break space (`U+00A0`), narrow no-break space (`U+202F`), or figure space (`U+2007`),
// literal or as a character reference; numeric references and `&nbsp` also work without
// the semicolon in text
const RE_NO_BREAK_SPACE_WS = /([ \n\r\t\f]*)(\xA0|\u202F|\u2007|&(?:nbsp;?|NonBreakingSpace;|numsp;|#0*(?:160|8239|8199)(?![0-9]);?|#[xX]0*(?:[aA]0|202[fF]|2007)(?![0-9a-fA-F]);?))([ \n\r\t\f]*)/g;
// Decoded text holds references only as text, so there the characters alone count
const RE_NO_BREAK_SPACE_CHAR_WS = /([ \n\r\t\f]*)([\xA0\u202F\u2007])([ \n\r\t\f]*)/g;
const RE_LINE_BREAK = /[\n\r]/;

/**
 * @param {string} _match
 * @param {string} before
 * @param {string} noBreakSpace
 * @param {string} after
 */
function keepLineBreaks(_match, before, noBreakSpace, after) {
  return (RE_LINE_BREAK.test(before) ? before : '') + noBreakSpace + (RE_LINE_BREAK.test(after) ? after : '');
}

// Callers pass text whose whitespace runs are already collapsed, as each match
// rescans the run in front of it
/**
 * @param {string} str
 * @param {{decodeEntities?: boolean | undefined, preserveLineBreaks?: boolean | undefined}} options
 */
function collapseNoBreakSpaces(str, options) {
  const decoded = Boolean(options.decodeEntities);
  // One scan for all three no-break space characters, rather than an `indexOf` per character
  if (!str || (!RE_NO_BREAK_SPACE_CHARS.test(str) && (decoded || str.indexOf('&') === -1))) {
    return str;
  }
  const pattern = decoded ? RE_NO_BREAK_SPACE_CHAR_WS : RE_NO_BREAK_SPACE_WS;
  if (options.preserveLineBreaks) {
    return str.replace(pattern, keepLineBreaks);
  }
  return str.replace(pattern, '$2');
}

// Collapse whitespace with options

/**
 * @param {string} str
 * @param {{preserveLineBreaks?: boolean | undefined, conservativeCollapse?: boolean | undefined}} options
 * @param {boolean} trimLeft
 * @param {boolean} trimRight
 * @param {boolean} [collapseAll]
 * @param {boolean} [keepUntrimmed] - Whether a side not trimmed keeps its line breaks as written
 */
function collapseWhitespace(str, options, trimLeft, trimRight, collapseAll = false, keepUntrimmed = false) {
  if (!str) return str;

  // Fast path: Nothing to do
  if (!trimLeft && !trimRight && !collapseAll && (!options.preserveLineBreaks || keepUntrimmed)) {
    return str;
  }

  // Fast path: No whitespace at all
  if (!RE_ANY_WS_NBSP.test(str)) {
    return str;
  }

  return collapseWhitespaceKnown(str, options, trimLeft, trimRight, collapseAll, keepUntrimmed);
}

// As `collapseWhitespace`, for callers that already know `str` is non-empty, holds
// whitespace, and has something to do
/**
 * @param {string} str
 * @param {{preserveLineBreaks?: boolean | undefined, conservativeCollapse?: boolean | undefined}} options
 * @param {boolean} trimLeft
 * @param {boolean} trimRight
 * @param {boolean} collapseAll
 * @param {boolean} [keepUntrimmed] - Whether a side not trimmed keeps its line breaks as written
 */
function collapseWhitespaceKnown(str, options, trimLeft, trimRight, collapseAll, keepUntrimmed = false) {
  let lineBreakBefore = ''; let lineBreakAfter = '';

  if (options.preserveLineBreaks) {
    // Find leading/trailing whitespace containing line breaks manually
    // (avoids polynomial backtracking with end-anchored lazy quantifiers);
    // the line-break check scans the run’s char codes directly rather than
    // testing a sliced copy, so the common case allocates nothing
    if (trimLeft || !keepUntrimmed) {
      let leadEnd = 0;
      let hasLineBreak = false;
      for (; leadEnd < str.length; leadEnd++) {
        const code = str.charCodeAt(leadEnd);
        if (!isAsciiWs(code)) break;
        // Settling the line break in the same pass keeps the run from being walked twice
        if (code === 10 || code === 13) hasLineBreak = true;
      }
      if (hasLineBreak) {
        lineBreakBefore = '\n';
        str = str.slice(leadEnd);
      }
    }
    if (trimRight || !keepUntrimmed) {
      let trailStart = str.length;
      let hasLineBreak = false;
      for (; trailStart > 0; trailStart--) {
        const code = str.charCodeAt(trailStart - 1);
        if (!isAsciiWs(code)) break;
        if (code === 10 || code === 13) hasLineBreak = true;
      }
      if (hasLineBreak) {
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

/**
 * @typedef {object} InlineSets
 * @prop {Set<string>} around - Elements whose surrounding whitespace is kept
 * @prop {Set<string>} aroundEnd - The same, spelled as end tags
 * @prop {Set<string>} within - Elements whose inner whitespace is kept
 * @prop {Set<string>} withinEnd - The same, spelled as end tags
 * @prop {Set<string>} withinEither - `within` under both spellings
 */

/**
 * Inline-element membership for the whitespace pass, each set paired with its end-tag
 * spelling so a lookup takes the tag as it comes rather than slicing off the slash
 * @param {Set<string>} around
 * @param {Set<string>} within
 * @returns {InlineSets}
 */
function buildInlineSets(around, within) {
  const withinEnd = toEndTags(within);
  return {
    around,
    aroundEnd: toEndTags(around),
    within,
    withinEnd,
    withinEither: new Set([...within, ...withinEnd])
  };
}

// The sets for a document without custom inline elements, built once
const defaultInlineSets = buildInlineSets(inlineElementsToKeepWhitespaceAround, inlineElementsToKeepWhitespaceWithin);

// Check if an input element has `type="hidden"`; module-scope so the hot path
// doesn’t allocate a closure per text node
/**
 * @param {Array<{name: string, value?: string}>} attrs
 */
function isHiddenInput(attrs) {
  if (!attrs || !attrs.length) return false;
  for (const attr of attrs) {
    // Attribute names and the `type` keyword are both ASCII case-insensitive
    if (attr.name.toLowerCase() === 'type') {
      return attr.value?.toLowerCase() === 'hidden';
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
 * @param {InlineSets} inlineSets
 * @param {boolean} [collapseInside] - False where `canCollapseWhitespace` keeps runs inside the text as they are
 */
function collapseWhitespaceSmart(str, prevTag, nextTag, prevAttrs, nextAttrs, options, inlineSets, collapseInside = true) {
  if (!str) return str;

  // Fast path: No whitespace at all—every decision below would leave `str`
  // untouched (`collapseWhitespace` returns such strings unchanged)
  if (!RE_ANY_WS_NBSP.test(str)) {
    return str;
  }

  let trimLeft = Boolean(prevTag) && !inlineElementsToKeepWhitespace.has(prevTag);
  let trimRight = Boolean(nextTag) && !inlineElementsToKeepWhitespace.has(nextTag);

  const prevTransparent = inlineElementsTransparentAfter.has(prevTag);
  const nextTransparent = inlineElementsTransparent.has(nextTag);

  // Every branch below that consults the text’s content needs a side left untrimmed, an element that
  // doesn’t render, or `collapseInlineTagWhitespace`, so the scan for a non-whitespace character is only worth making then
  const isPureWhitespace = (!trimLeft || !trimRight || prevTransparent || nextTransparent || Boolean(options.collapseInlineTagWhitespace)) && !RE_NON_WS.test(str);

  // Next to text, spacing is part of the text, so aggressive collapsing only applies between tags
  const inlineOption = Boolean(options.collapseInlineTagWhitespace) && isPureWhitespace;

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
        formControlElementsEither.has(prevTag) && formControlElementsEither.has(nextTag)) {
      trimLeft = true;
      trimRight = true;
    }
  }

  // Aggressive mode keeps whitespace around standard text-level elements only, not around all inline elements
  if (trimLeft) {
    trimLeft = prevTag.charCodeAt(0) === 47 /* / */ ? !(inlineOption ? inlineElementsToKeepWhitespaceBetweenEnd : inlineSets.aroundEnd).has(prevTag) : !inlineSets.within.has(prevTag);
  }

  if (trimRight) {
    trimRight = nextTag.charCodeAt(0) === 47 /* / */ ? !inlineSets.withinEnd.has(nextTag) : !(inlineOption ? inlineElementsToKeepWhitespaceBetween : inlineSets.around).has(nextTag);
  }

  // Next to an element that doesn’t render, whitespace may separate what lies beyond it, so the
  // element leaves the decision to the text or to a tag on the other side that renders
  if (prevTransparent && (!isPureWhitespace || (Boolean(nextTag) && !nextTransparent))) {
    trimLeft = false;
  }
  if (nextTransparent && (!isPureWhitespace || (Boolean(prevTag) && !prevTransparent))) {
    trimRight = false;
  }

  const collapseAll = collapseInside && Boolean(prevTag && nextTag);
  if (!trimLeft && !trimRight && !collapseAll && (!options.preserveLineBreaks || !collapseInside)) {
    return str;
  }
  return collapseWhitespaceKnown(str, options, trimLeft, trimRight, collapseAll, !collapseInside);
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
  buildInlineSets,
  defaultInlineSets,
  endsWithWhitespace,
  trimWhitespace,
  collapseWhitespaceAll,
  collapseNoBreakSpaces,
  collapseWhitespace,
  collapseWhitespaceSmart,
  canCollapseWhitespace,
  canTrimWhitespace
};