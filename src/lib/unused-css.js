// Unused-CSS removal

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

const attributePattern = /(?:^|[\s/])([-\w:.]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
const identifierPattern = /[A-Za-z_][\w-]*/g;

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
 * Locate the bodies of a raw-text element (`style`, `script`).
 *
 * Scanning beats one regular expression here: A pattern permissive enough for the
 * end tags browsers accept (`</script\t\n bar>`, `</script/>`) backtracks
 * quadratically over a document full of near-matches, and bounding it would make
 * long start tags go unrecognized.
 *
 * @param {string} html - Raw document markup
 * @param {string} tagName - Lowercase element name
 * @returns {Array<{start: number, bodyStart: number, bodyEnd: number, end: number, closed: boolean}>}
 */
function findRawTextElements(html, tagName) {
  /** @type {Array<{start: number, bodyStart: number, bodyEnd: number, end: number, closed: boolean}>} */
  const found = [];
  const haystack = html.toLowerCase();
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
    const startTagEnd = haystack.indexOf('>', start + openTag.length);
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
        const closeEnd = haystack.indexOf('>', candidate + closeTag.length);
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
      bodyEnd: closed ? bodyEnd : html.length,
      end: closed ? end : html.length,
      closed
    });
    cursor = closed ? end : html.length;
  }

  return found;
}

/**
 * Collect the class names and IDs a document references.
 *
 * `style` element contents are excluded, so that a style sheet never counts as
 * evidence for its own selectors. Over-collecting is safe here (a symbol wrongly
 * considered used is merely kept), under-collecting is not.
 *
 * @param {string} html - Raw document markup
 * @param {boolean} includeScripts - Also treat identifiers inside inline `script` elements as used
 * @param {((text: string) => string)} [decode] - Resolves character references in attribute values
 * @returns {Set<string>} Symbols to keep
 */
function collectUsedSymbols(html, includeScripts, decode) {
  const used = new Set();

  // An unclosed `style` element is left in place: Its contents then read as markup,
  // which can only add symbols, whereas dropping the rest of the document would lose them
  let markup = html;
  const styleElements = findRawTextElements(html, 'style');
  for (let index = styleElements.length - 1; index >= 0; index--) {
    const element = styleElements[index];
    if (element?.closed) {
      markup = markup.slice(0, element.start) + markup.slice(element.end);
    }
  }

  const addIdentifiers = (/** @type {string} */ text) => {
    identifierPattern.lastIndex = 0;
    let identifier;
    while ((identifier = identifierPattern.exec(text))) {
      used.add(identifier[0]);
    }
  };

  attributePattern.lastIndex = 0;
  let match;
  while ((match = attributePattern.exec(markup))) {
    const name = (match[1] ?? '').toLowerCase();
    const raw = match[2] ?? match[3] ?? match[4] ?? '';
    if (!raw) {
      continue;
    }
    // `class="us&#101;d"` names the class `used`, so compare against the decoded value
    const value = (decode && raw.indexOf('&') !== -1) ? decode(raw) : raw;
    if (name === 'class' || name === 'id' || idReferenceAttributes.has(name)) {
      for (const token of value.split(/\s+/)) {
        if (token) {
          used.add(token);
        }
      }
    } else if (name.startsWith('data-')) {
      // Class names are commonly parked in `data-*` attributes for scripts to apply later
      addIdentifiers(value);
    }
  }

  if (includeScripts) {
    // Script contents are raw text, so character references stay literal;
    // an unclosed `script` runs to the end of the document, as it does in a browser
    for (const element of findRawTextElements(markup, 'script')) {
      addIdentifiers(markup.slice(element.bodyStart, element.bodyEnd));
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

/**
 * Normalize the `removeUnusedCSS` option into a settled configuration.
 * @param {boolean | {safelist?: Array<string | RegExp>, scripts?: boolean} | undefined} option
 * @returns {{safelist: Array<string | RegExp>, scripts: boolean} | null} Null when disabled
 */
function normalizeUnusedCSSOptions(option) {
  if (!option) {
    return null;
  }
  const config = typeof option === 'object' ? option : {};
  return {
    safelist: Array.isArray(config.safelist) ? config.safelist : [],
    // Keeping identifiers seen in inline scripts costs a little of the reduction
    // but avoids the most common breakage, so it is the default
    scripts: config.scripts !== false
  };
}

export {
  collectUsedSymbols,
  findUnusedSymbols,
  normalizeUnusedCSSOptions
};