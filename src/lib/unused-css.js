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

const styleElementPattern = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const scriptElementPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
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
  return identifier.replace(escapePattern, (_match, hex, literal) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : literal
  );
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
 * @returns {Set<string>} Symbols to keep
 */
function collectUsedSymbols(html, includeScripts) {
  const used = new Set();
  const markup = html.replace(styleElementPattern, '');

  attributePattern.lastIndex = 0;
  let match;
  while ((match = attributePattern.exec(markup))) {
    const name = (match[1] ?? '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (!value) {
      continue;
    }
    if (name === 'class' || name === 'id' || idReferenceAttributes.has(name)) {
      for (const token of value.split(/\s+/)) {
        if (token) {
          used.add(token);
        }
      }
    } else if (name.startsWith('data-')) {
      // Class names are commonly parked in `data-*` attributes for scripts to apply later
      identifierPattern.lastIndex = 0;
      let identifier;
      while ((identifier = identifierPattern.exec(value))) {
        used.add(identifier[0]);
      }
    }
  }

  if (includeScripts) {
    scriptElementPattern.lastIndex = 0;
    while ((match = scriptElementPattern.exec(markup))) {
      const body = match[2];
      if (!body) {
        continue;
      }
      identifierPattern.lastIndex = 0;
      let identifier;
      while ((identifier = identifierPattern.exec(body))) {
        used.add(identifier[0]);
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
    if (safelist.some(entry => entry instanceof RegExp ? entry.test(symbol) : entry === symbol)) {
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