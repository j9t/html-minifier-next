import { escapeHtml } from './utils.js';

// Mark characters that carry meaning but show nothing—or no more than a gap—so that
// the demo shows what options like `decodeEntities` and whitespace collapsing do to them,
// kept apart from the page so that it can be read without one
//
// The characters are written as escapes: spelled out, they would be as invisible in this
// file as they are in the demo

// Characters that take up room of their own, where a tint alone shows them
const SPACES = new Map([
  ['\u00A0', 'NO-BREAK SPACE'],
  ['\u1680', 'OGHAM SPACE MARK'],
  ['\u2000', 'EN QUAD'],
  ['\u2001', 'EM QUAD'],
  ['\u2002', 'EN SPACE'],
  ['\u2003', 'EM SPACE'],
  ['\u2004', 'THREE-PER-EM SPACE'],
  ['\u2005', 'FOUR-PER-EM SPACE'],
  ['\u2006', 'SIX-PER-EM SPACE'],
  ['\u2007', 'FIGURE SPACE'],
  ['\u2008', 'PUNCTUATION SPACE'],
  ['\u2009', 'THIN SPACE'],
  ['\u200A', 'HAIR SPACE'],
  ['\u202F', 'NARROW NO-BREAK SPACE'],
  ['\u205F', 'MEDIUM MATHEMATICAL SPACE'],
  ['\u3000', 'IDEOGRAPHIC SPACE']
]);

// Characters of no width at all, which need a marker to show up
const ZERO_WIDTH = new Map([
  ['\u00AD', ['SOFT HYPHEN', 'SHY']],
  ['\u0085', ['NEXT LINE', 'NEL']],
  ['\u180E', ['MONGOLIAN VOWEL SEPARATOR', 'MVS']],
  ['\u200B', ['ZERO WIDTH SPACE', 'ZWSP']],
  ['\u200C', ['ZERO WIDTH NON-JOINER', 'ZWNJ']],
  ['\u200D', ['ZERO WIDTH JOINER', 'ZWJ']],
  ['\u200E', ['LEFT-TO-RIGHT MARK', 'LRM']],
  ['\u200F', ['RIGHT-TO-LEFT MARK', 'RLM']],
  ['\u2028', ['LINE SEPARATOR', 'LS']],
  ['\u2029', ['PARAGRAPH SEPARATOR', 'PS']],
  ['\u2060', ['WORD JOINER', 'WJ']],
  ['\uFEFF', ['ZERO WIDTH NO-BREAK SPACE', 'BOM']]
]);

// Control characters, but for the tab, line feed, and carriage return that text is made of
const CONTROLS = '\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F';

/** @param {string} char */
const codePoint = (char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

/** @param {Iterable<string>} chars */
const classOf = (chars) => [...chars].map(char => `\\u${(char.codePointAt(0) ?? 0).toString(16).padStart(4, '0')}`).join('');

const RE_INVISIBLE = new RegExp(`[${CONTROLS}${classOf(SPACES.keys())}${classOf(ZERO_WIDTH.keys())}]`, 'g');

/**
 * Wrap every invisible character in a span that names it, keeping the character itself so
 * that the marked-up text still copies as what it is
 *
 * @param {unknown} str
 * @returns {string}
 */
export const annotateInvisibles = (str) => {
  if (typeof str !== 'string') return '';

  return escapeHtml(str).replace(RE_INVISIBLE, (char) => {
    const space = SPACES.get(char);
    if (space) {
      return `<span class="invisible" title="${codePoint(char)} ${space}">${char}</span>`;
    }

    const [name, marker] = ZERO_WIDTH.get(char) ?? ['CONTROL CHARACTER', codePoint(char)];
    return `<span class="invisible zero-width" title="${codePoint(char)} ${name}" data-marker="${marker}">${char}</span>`;
  });
};