import { escapeHtml } from './utils.js';

// Mark characters that carry meaning but show nothing—or no more than a gap—so that
// the demo shows what options like `decodeEntities` and whitespace collapsing do to them,
// kept apart from the page so that it can be read without one. These are Unicode’s
// whitespace and default-ignorable characters, plus control characters.
//
// Ordinary spaces and tabs are marked only within a line, and spaces only where they run,
// where one cannot tell how many there are; elsewhere they would mark every gap in the
// markup. Variation selectors are left alone, as they would mark every emoji.
//
// The characters are written as escapes: spelled out, they would be as invisible in this
// file as they are in the demo.

// Characters that take up room of their own, where a tint alone shows them
const SPACES = new Map([
  ['\u0009', 'CHARACTER TABULATION'],
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

// Characters of no width at all, which need a marker to show up (others take their code point)
const ZERO_WIDTH = new Map([
  ['\u0085', ['NEXT LINE', 'NEL']],
  ['\u00AD', ['SOFT HYPHEN', 'SHY']],
  ['\u034F', ['COMBINING GRAPHEME JOINER', 'CGJ']],
  ['\u061C', ['ARABIC LETTER MARK', 'ALM']],
  ['\u180E', ['MONGOLIAN VOWEL SEPARATOR', 'MVS']],
  ['\u200B', ['ZERO WIDTH SPACE', 'ZWSP']],
  ['\u200C', ['ZERO WIDTH NON-JOINER', 'ZWNJ']],
  ['\u200D', ['ZERO WIDTH JOINER', 'ZWJ']],
  ['\u200E', ['LEFT-TO-RIGHT MARK', 'LRM']],
  ['\u200F', ['RIGHT-TO-LEFT MARK', 'RLM']],
  ['\u2028', ['LINE SEPARATOR', 'LS']],
  ['\u2029', ['PARAGRAPH SEPARATOR', 'PS']],
  ['\u202A', ['LEFT-TO-RIGHT EMBEDDING', 'LRE']],
  ['\u202B', ['RIGHT-TO-LEFT EMBEDDING', 'RLE']],
  ['\u202C', ['POP DIRECTIONAL FORMATTING', 'PDF']],
  ['\u202D', ['LEFT-TO-RIGHT OVERRIDE', 'LRO']],
  ['\u202E', ['RIGHT-TO-LEFT OVERRIDE', 'RLO']],
  ['\u2060', ['WORD JOINER', 'WJ']],
  ['\u2066', ['LEFT-TO-RIGHT ISOLATE', 'LRI']],
  ['\u2067', ['RIGHT-TO-LEFT ISOLATE', 'RLI']],
  ['\u2068', ['FIRST STRONG ISOLATE', 'FSI']],
  ['\u2069', ['POP DIRECTIONAL ISOLATE', 'PDI']],
  ['\uFEFF', ['ZERO WIDTH NO-BREAK SPACE', 'BOM']]
]);

/** @param {string} char */
const codePoint = (char) => `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

// Indentation is matched first so that the runs of spaces and the tabs left are those within a line
const RE_INVISIBLE = /((?<![^\n\r\u2028\u2029])[\t ]+)| {2,}|(?![ \n\r\p{Variation_Selector}])[\p{White_Space}\p{Default_Ignorable_Code_Point}\p{Cc}]/gu;

const RE_CONTROL = /\p{Cc}/u;

/**
 * Wrap every invisible character in a span that names it, keeping the character itself so
 * that offsets in the marked-up text match those in the original
 *
 * @param {unknown} str
 * @returns {string}
 */
export const annotateInvisibles = (str) => {
  if (typeof str !== 'string') return '';

  return escapeHtml(str).replace(RE_INVISIBLE, (char, indentation) => {
    if (indentation) return char;

    if (char[0] === ' ') {
      return '<span class="invisible space" title="U+0020 SPACE"> </span>'.repeat(char.length);
    }

    const space = SPACES.get(char);
    if (space) {
      return `<span class="invisible" title="${codePoint(char)} ${space}">${char}</span>`;
    }

    const [name, marker] = ZERO_WIDTH.get(char) ??
      [RE_CONTROL.test(char) ? 'CONTROL CHARACTER' : 'INVISIBLE CHARACTER', codePoint(char)];
    // HTML parsing drops `U+0000`, so a zero-width space holds its place to keep offsets in view
    const content = char === '\u0000' ? '\u200B' : char;
    return `<span class="invisible zero-width" title="${codePoint(char)} ${name}" data-marker="${marker}">${content}</span>`;
  });
};