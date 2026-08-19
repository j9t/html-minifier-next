// Unused-CSS removal

import { findTagEnd } from './utils.js';

// Attributes whose values name elements by ID or hold space-separated ID lists
const idReferenceAttributes = new Set([
  'aria-activedescendant',
  'aria-controls',
  'aria-describedby',
  'aria-details',
  'aria-errormessage',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
  'commandfor',
  'contextmenu',
  'for',
  'form',
  'headers',
  'itemref',
  'list',
  'popovertarget'
]);

// Attributes whose value may be a same-document fragment URL (`#main`). `:target`
// rules and SVG sprite references (`<use href="#icon">`) rest on these, so the ID
// they name counts as used.
const fragmentReferenceAttributes = new Set([
  'action',
  'cite',
  'data',
  'formaction',
  'href',
  'poster',
  'src',
  'usemap',
  'xlink:href'
]);

const attributePattern = /(?:^|[\s/])([-\w:.]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const identifierPattern = /--[\w-]*|-?[A-Za-z_][\w-]*/g;
// SVG paints and filters reach elements by ID through `url(#gradient)`, in
// presentation attributes as well as in `style`
const fragmentURLPattern = /url\(\s*['"]?#([^)'"\s]+)/gi;
// Class names routinely carry characters that end a CSS identifier (`md:flex`,
// `w-1/2`, `p-[3px]`), so scripts and `data-*` values contribute whole tokens
// besides identifiers; quoted strings are where scripts keep such names
const stringLiteralPattern = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;

// CSS identifiers may contain escapes (`.md\:flex`, `.w-1\/2`), which have to be
// resolved before comparing them against the plain tokens found in the markup
const cssIdentifierPattern = /(?<![\w\\-])[.#]((?:[-_a-zA-Z]|\\[0-9a-fA-F]{1,6}[ \t\n]?|\\[^\n0-9a-fA-F])(?:[-\w]|\\[0-9a-fA-F]{1,6}[ \t\n]?|\\[^\n0-9a-fA-F])*)/g;
// `unusedSymbols` also drops `@keyframes` and `@counter-style` rules by name, so any
// name used there is off limits even when no element carries it as a class or ID
const reservedAtRulePattern = /@(?:-\w+-)?(?:keyframes|counter-style)\s+(-?[_a-zA-Z][\w-]*)/gi;
const escapePattern = /\\(?:([0-9a-fA-F]{1,6})[ \t\n]?|(.))/g;

/**
 * Resolve CSS escape sequences in an identifier.
 * @param {string} identifier
 * @returns {string}
 */
function unescapeIdentifier(identifier) {
  if (identifier.indexOf('\\') === -1) {
    return identifier;
  }
  return identifier.replace(escapePattern, (_match, hex, literal) => {
    if (!hex) {
      return literal;
    }
    // Per CSS Syntax spec, a null, surrogate, or out-of-range escape becomes U+FFFD
    const code = parseInt(hex, 16);
    return (code === 0 || code > 0x10FFFF || (code >= 0xD800 && code <= 0xDFFF))
      ? '\uFFFD'
      : String.fromCodePoint(code);
  });
}

/**
 * Lowercase for matching without disturbing offsets.
 *
 * `toLowerCase()` can change a string's length—U+0130 becomes two code units—which
 * would misalign every offset taken from the result. Folding just ASCII preserves
 * length, and tag names are ASCII anyway.
 *
 * @param {string} text
 * @returns {string} Same length as `text`
 */
function foldCase(text) {
  const lowercased = text.toLowerCase();
  return lowercased.length === text.length
    ? lowercased
    : text.replace(/[A-Z]+/g, uppercase => uppercase.toLowerCase());
}

/**
 * Locate the bodies of a raw-text element (`style`, `script`).
 *
 * Scanning beats one regular expression here: A pattern permissive enough for the
 * end tags browsers accept (`</script\t\n bar>`, `</script/>`) backtracks
 * quadratically over a document full of near-matches, and bounding it would make
 * long start tags go unrecognized.
 *
 * @param {string} haystack - Case-folded markup, as returned by `foldCase`
 * @param {string} tagName - Lowercase element name
 * @returns {Array<{start: number, bodyStart: number, bodyEnd: number, end: number, closed: boolean}>}
 */
function findRawTextElements(haystack, tagName) {
  /** @type {Array<{start: number, bodyStart: number, bodyEnd: number, end: number, closed: boolean}>} */
  const found = [];
  const openTag = '<' + tagName;
  const closeTag = '</' + tagName;
  // A tag name ends at whitespace, a slash, or the closing bracket—so `<styles>`
  // and `</scriptfoo>` name different elements and must not match
  const endsName = (/** @type {string} */ character) =>
    character === '' || character === '/' || character === '>' || /\s/.test(character);

  let cursor = 0;
  for (;;) {
    const start = haystack.indexOf(openTag, cursor);
    if (start === -1) {
      break;
    }
    if (!endsName(haystack.charAt(start + openTag.length))) {
      cursor = start + openTag.length;
      continue;
    }
    // A quoted attribute value may hold a `>`, so the tag ends where the parser
    // says it does, not at the next bracket
    const startTagEnd = findTagEnd(haystack, start + openTag.length);
    if (startTagEnd === -1) {
      break;
    }

    const bodyStart = startTagEnd + 1;
    let search = bodyStart;
    let bodyEnd = -1;
    let end = -1;
    for (;;) {
      const candidate = haystack.indexOf(closeTag, search);
      if (candidate === -1) {
        break;
      }
      if (endsName(haystack.charAt(candidate + closeTag.length))) {
        const closeEnd = findTagEnd(haystack, candidate + closeTag.length);
        if (closeEnd !== -1) {
          bodyEnd = candidate;
          end = closeEnd + 1;
        }
        break;
      }
      search = candidate + closeTag.length;
    }

    const closed = bodyEnd !== -1;
    found.push({
      start,
      bodyStart,
      bodyEnd: closed ? bodyEnd : haystack.length,
      end: closed ? end : haystack.length,
      closed
    });
    cursor = closed ? end : haystack.length;
  }

  return found;
}

/**
 * Collect the class names and IDs a document references.
 *
 * Style sheet contents are excluded, so that a style sheet never counts as
 * evidence for its own selectors. An `iframe srcdoc` value is not scanned,
 * either: It holds a document of its own, minified against its own symbol set.
 * Over-collecting is safe here (a symbol wrongly considered used is merely
 * kept), under-collecting is not.
 *
 * @param {string} html - Raw document markup
 * @param {boolean} includeScripts - Also treat identifiers inside inline `script` elements as used
 * @param {((text: string) => string)} [decode] - Resolves character references in attribute values
 * @returns {Set<string>} Symbols to keep
 */
function collectUsedSymbols(html, includeScripts, decode) {
  const used = new Set();
  const haystack = foldCase(html);

  // Style sheets are skipped rather than cut out, so both scans share one folded
  // copy and offsets keep pointing into `html`. Only the body is skipped—the start
  // tag carries ordinary attributes, and `<style id="theme">` could be what
  // `#theme` refers to. An unclosed element is not skipped: Reading its contents
  // as markup can only add symbols, whereas ignoring the rest of the document
  // would lose them.
  const skipped = findRawTextElements(haystack, 'style')
    .filter(element => element.closed)
    .map(element => ({ start: element.bodyStart, end: element.bodyEnd }));

  const addIdentifiers = (/** @type {string} */ text) => {
    identifierPattern.lastIndex = 0;
    let identifier;
    while ((identifier = identifierPattern.exec(text))) {
      used.add(identifier[0]);
    }
  };

  const addTokens = (/** @type {string} */ text) => {
    for (const token of text.split(/\s+/)) {
      if (token) {
        used.add(token);
      }
    }
  };

  // Both loops below walk forward, so one cursor over the skipped ranges suffices
  let skipCursor = 0;
  const isSkipped = (/** @type {number} */ index) => {
    while (skipCursor < skipped.length && (skipped[skipCursor]?.end ?? 0) <= index) {
      skipCursor++;
    }
    const element = skipped[skipCursor];
    return element !== undefined && index >= element.start;
  };

  attributePattern.lastIndex = 0;
  let match;
  while ((match = attributePattern.exec(html))) {
    const raw = match[2] ?? match[3] ?? match[4] ?? '';
    if (!raw || isSkipped(match.index)) {
      continue;
    }
    const name = (match[1] ?? '').toLowerCase();
    // `class="us&#101;d"` names the class `used`, so compare against the decoded value
    const value = (decode && raw.indexOf('&') !== -1) ? decode(raw) : raw;
    if (name === 'class' || name === 'id' || idReferenceAttributes.has(name)) {
      addTokens(value);
    } else if (name.startsWith('data-')) {
      // Class names are commonly parked in `data-*` attributes for scripts to apply later
      addIdentifiers(value);
      addTokens(value);
    } else if (fragmentReferenceAttributes.has(name) && value.charAt(0) === '#') {
      // Only a leading `#`: `href="/page#sec"` names a section of another document
      addTokens(value.slice(1));
    }
    if (value.indexOf('(') !== -1) {
      fragmentURLPattern.lastIndex = 0;
      let reference;
      while ((reference = fragmentURLPattern.exec(value))) {
        addTokens(reference[1] ?? '');
      }
    }
  }

  if (includeScripts) {
    // Script contents are raw text, so character references stay literal;
    // an unclosed `script` runs to the end of the document, as it does in a browser
    skipCursor = 0;
    for (const element of findRawTextElements(haystack, 'script')) {
      if (isSkipped(element.start)) {
        continue;
      }
      const body = html.slice(element.bodyStart, element.bodyEnd);
      addIdentifiers(body);
      stringLiteralPattern.lastIndex = 0;
      let literal;
      while ((literal = stringLiteralPattern.exec(body))) {
        addTokens(literal[1] ?? literal[2] ?? literal[3] ?? '');
      }
    }
  }

  return used;
}

/**
 * Determine which class/ID symbols a style sheet defines but the document never references.
 * @param {string} css - Style sheet contents
 * @param {Set<string>} used - Symbols the document references
 * @param {Array<string | RegExp>} safelist - Symbols to keep regardless
 * @returns {string[]} Symbols safe to remove
 */
function findUnusedSymbols(css, used, safelist) {
  const reserved = new Set();
  reservedAtRulePattern.lastIndex = 0;
  let match;
  while ((match = reservedAtRulePattern.exec(css))) {
    if (match[1]) {
      reserved.add(match[1]);
    }
  }

  const unused = [];
  const seen = new Set();
  cssIdentifierPattern.lastIndex = 0;
  while ((match = cssIdentifierPattern.exec(css))) {
    const symbol = unescapeIdentifier(match[1] ?? '');
    if (seen.has(symbol)) {
      continue;
    }
    seen.add(symbol);
    if (used.has(symbol) || reserved.has(symbol)) {
      continue;
    }
    if (safelist.some(entry => {
      if (!(entry instanceof RegExp)) {
        return entry === symbol;
      }
      // `test()` advances `lastIndex` on global and sticky patterns, which would
      // make a safelist entry match only every other symbol
      entry.lastIndex = 0;
      return entry.test(symbol);
    })) {
      continue;
    }
    unused.push(symbol);
  }

  return unused;
}

const unusedCSSKeys = new Set(['safelist', 'scripts']);

/**
 * Normalize the `removeUnusedCSS` option into a settled configuration.
 *
 * A misspelled key or a safelist that is not an array would otherwise protect
 * nothing, and that only surfaces as a missing rule much later—so every value
 * that gets dropped is reported.
 *
 * @param {boolean | {safelist?: Array<string | RegExp>, scripts?: boolean} | undefined} option
 * @param {(message: string) => unknown} [warn] - Receives one message per ignored value
 * @returns {{safelist: Array<string | RegExp>, scripts: boolean} | null} Null when disabled
 */
function normalizeUnusedCSSOptions(option, warn) {
  if (!option) {
    return null;
  }
  const report = warn ?? (() => {});
  const config = /** @type {Record<string, any>} */ (typeof option === 'object' ? option : {});

  for (const key of Object.keys(config)) {
    if (!unusedCSSKeys.has(key)) {
      report(`Ignoring unknown \`removeUnusedCSS\` key \`${key}\`—expected \`safelist\` or \`scripts\``);
    }
  }

  /** @type {Array<string | RegExp>} */
  let safelist = [];
  if (config.safelist !== undefined) {
    if (!Array.isArray(config.safelist)) {
      report('Ignoring `removeUnusedCSS.safelist`—it takes an array of strings and regular expressions');
    } else {
      safelist = config.safelist.filter((/** @type {unknown} */ entry) => {
        if (typeof entry === 'string' || entry instanceof RegExp) {
          return true;
        }
        report(`Ignoring \`removeUnusedCSS.safelist\` entry of type ${typeof entry}—entries must be strings or regular expressions`);
        return false;
      });
    }
  }

  if (config.scripts !== undefined && typeof config.scripts !== 'boolean') {
    report('Ignoring `removeUnusedCSS.scripts`—it takes a boolean');
  }

  return {
    safelist,
    // Keeping identifiers seen in inline scripts costs a little of the reduction
    // but avoids the most common breakage, so it is the default
    scripts: typeof config.scripts === 'boolean' ? config.scripts : true
  };
}

export {
  collectUsedSymbols,
  findUnusedSymbols,
  normalizeUnusedCSSOptions
};