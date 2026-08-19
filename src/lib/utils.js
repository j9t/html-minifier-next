// Stringify for options signatures (sorted keys, shallow, nested objects)

/**
 * @param {unknown} obj
 * @returns {string}
 */
function stableStringify(obj) {
  if (obj == null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i] ?? '';
    out += JSON.stringify(k) + ':' + stableStringify(/** @type {Record<string, unknown>} */ (obj)[k]) + (i < keys.length - 1 ? ',' : '');
  }
  return out + '}';
}

// LRU cache for strings and promises

class LRU {
  constructor(limit = 200) {
    this.limit = limit;
    this.gets = 0;
    this.hits = 0;
    /** @type {Map<string, unknown>} */
    this.map = new Map();
  }
  /** @param {string} key */
  get(key) {
    this.gets++;
    if (this.map.has(key)) {
      this.hits++;
      const v = this.map.get(key);
      this.map.delete(key);
      this.map.set(key, v);
      return v;
    }
    return undefined;
  }
  /**
   * @param {string} key
   * @param {unknown} value
   */
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
  }
  /** @param {string} key */
  delete(key) { this.map.delete(key); }
  /** @returns {{ gets: number, hits: number, size: number, limit: number }} */
  stats() {
    return { gets: this.gets, hits: this.hits, size: this.map.size, limit: this.limit };
  }
}

// Content longer than this (in UTF-16 code units, roughly bytes for typical CSS/JS/SVG) is
// minified normally but never stored in a minification cache—caps worst-case cache memory
// (entry count × this size) without affecting realistically sized inline content
const MAX_CACHE_ENTRY_SIZE = 1024 * 1024; // 1 MB

// FNV-1a 32-bit hash for large-input cache keys

/** @param {string} str */
function hashContent(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Unique ID generator

/** @param {string} value */
function uniqueId(value) {
  let id;
  do {
    id = 'u' + crypto.randomUUID().replace(/-/g, '');
  } while (~value.indexOf(id));
  return id;
}

// Identity and transform functions

/** @param {string} value */
function identity(value) {
  return value;
}

/**
 * @param {unknown} value
 * @returns {value is PromiseLike<any>}
 */
function isThenable(value) {
  return value != null && typeof value === 'object' && typeof /** @type {any} */ (value).then === 'function';
}

/** @param {string} value */
function lowercase(value) {
  return value.toLowerCase();
}

// Replace async helper

/**
 * Asynchronously replace matches in a string.
 * @param {string} str - Input string
 * @param {RegExp} regex - Regular expression with global flag
 * @param {Function} asyncFn - Async function to process each match
 * @returns {Promise<string>} Processed string
 */
async function replaceAsync(str, regex, asyncFn) {
  /** @type {Promise<string>[]} */
  const promises = [];

  str.replace(regex, /** @returns {string} */ (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
    return match;
  });

  const data = await Promise.all(promises);
  let next = 0;
  return str.replace(regex, () => data[next++] ?? '');
}

// String patterns to RegExp conversion (for JSON config support)

/** @param {string | RegExp} value */
function parseRegExp(value) {
  if (typeof value === 'string') {
    if (!value) return undefined; // Empty string = not configured
    const match = value.match(/^\/(.+)\/([dgimsuvy]*)$/);
    if (match) {
      return new RegExp(match[1] ?? '', match[2] ?? '');
    }
    return new RegExp(value);
  }
  return value;
}

// Regex source reading, shared by the analysis and the rewriting below

const RE_ASCII_LETTER = /^[a-zA-Z]$/;
const RE_HEX_PAIR = /^[0-9a-fA-F]{2}$/;
const RE_HEX_QUAD = /^[0-9a-fA-F]{4}$/;

/**
 * @param {string} source @param {number} index - Index of the opening `[`
 * @param {boolean} [nested] - Whether the pattern carries `v`, where a class nests
 *   inside a class and the first `]` need not be the one that closes it
 * @returns {number} Index just past the closing `]`
 */
function skipCharacterClass(source, index, nested = false) {
  let i = index + 1;
  let open = 1;
  while (i < source.length && open > 0) {
    const char = source[i];
    if (char === '\\') i += tokenLength(source, i);
    else {
      if (nested && char === '[') open++;
      else if (char === ']') open--;
      i++;
    }
  }
  return i;
}

/**
 * Length of the token at `index`, so that a multi-character escape is read whole
 * rather than leaving its tail to be mistaken for literals.
 * @param {string} source @param {number} index
 */
function tokenLength(source, index) {
  if (source[index] !== '\\') return 1;
  const next = source[index + 1];
  if (next === 'x' && RE_HEX_PAIR.test(source.slice(index + 2, index + 4))) return 4;
  if (next === 'u') {
    if (source[index + 2] === '{') {
      const close = source.indexOf('}', index + 3);
      if (close !== -1) return close - index + 1;
    }
    if (RE_HEX_QUAD.test(source.slice(index + 2, index + 6))) return 6;
  }
  if (next === 'c' && RE_ASCII_LETTER.test(source[index + 2] ?? '')) return 3;
  // A `v` class holds string literals, which fold as strings or not at all
  if (next === 'q' && source[index + 2] === '{') {
    const close = source.indexOf('}', index + 3);
    if (close !== -1) return close - index + 1;
  }
  // A property name or a group name is syntax, not text to fold
  if ((next === 'p' || next === 'P') && source[index + 2] === '{') {
    const close = source.indexOf('}', index + 3);
    if (close !== -1) return close - index + 1;
  }
  if (next === 'k' && source[index + 2] === '<') {
    const close = source.indexOf('>', index + 3);
    if (close !== -1) return close - index + 1;
  }
  return 2;
}

// ReDoS risk detection for user-supplied patterns

// Quantifier following an atom, with its optional lazy `?`; the captures hold
// the bounds of a `{n,m}` form, the upper one empty when the form is `{n,}`
const RE_QUANTIFIER = /(?:[*+?]|\{(\d+)(?:,(\d*))?\})\??/y;

// Bounds for the walk below: Patterns beyond either are judged risky unread,
// which keeps a pathological source from nesting the analysis into a stack
// overflow or making it rescan its groups once per level
const MAX_PATTERN_LENGTH = 10000;
const MAX_PATTERN_DEPTH = 50;

// A group that only wraps its body backtracks the way that body does, so
// `(?:a)` and `a` count as the same atom; lookarounds are left alone
const RE_TRANSPARENT_GROUP = /^\((?:\?:|\?<[^>=!][^>]*>)?([\s\S]*)\)$/;

// A quantifier of exactly one repetition, which is notation rather than shape
const RE_EXACT_ONE = /\{1(?:,1)?\}\??$/;

/** @param {string} atom - Atom as it reads in the source */
function unwrapAtom(atom) {
  let inner = atom;
  for (let level = 0; level < MAX_PATTERN_DEPTH; level++) {
    const next = inner.replace(RE_EXACT_ONE, '').replace(RE_TRANSPARENT_GROUP, '$1');
    if (next === inner) break;
    inner = next;
  }
  return inner;
}

// Two atoms that repeat unboundedly side by side split a run between them in as
// many ways as the run is long, whenever both can consume the same character.
// Comparing what they match, rather than how they are spelled, is what catches
// `[a]*a*` and `\w*\d*` alongside `a*a*`.

const MAX_CODE_POINT = 0x10FFFF;

/** @type {Record<string, [number, number][]>} */
const CLASS_ESCAPE_RANGES = {
  d: [[0x30, 0x39]],
  w: [[0x30, 0x39], [0x41, 0x5A], [0x5F, 0x5F], [0x61, 0x7A]],
  s: [[0x09, 0x0D], [0x20, 0x20], [0xA0, 0xA0], [0x1680, 0x1680], [0x2000, 0x200A],
    [0x2028, 0x2029], [0x202F, 0x202F], [0x205F, 0x205F], [0x3000, 0x3000], [0xFEFF, 0xFEFF]]
};

/** @type {Record<string, number>} */
const CONTROL_ESCAPE_CODES = { 0: 0x00, f: 0x0C, n: 0x0A, r: 0x0D, t: 0x09, v: 0x0B };

// An escape that stands for something other than one character of text
const RE_NON_CHARACTER_ESCAPE = /[bBdDkpPsSwW1-9]/;

/** @param {[number, number][]} ranges */
function complement(ranges) {
  const sorted = [...ranges].sort((one, other) => one[0] - other[0]);
  /** @type {[number, number][]} */
  const out = [];
  let next = 0;
  for (const [low, high] of sorted) {
    if (low > next) out.push([next, low - 1]);
    next = Math.max(next, high + 1);
  }
  if (next <= MAX_CODE_POINT) out.push([next, MAX_CODE_POINT]);
  return out;
}

// `.` as a bare source reads it, without the `s` flag the source cannot carry
const DOT_RANGES = complement([[0x0A, 0x0A], [0x0D, 0x0D], [0x2028, 0x2029]]);

/**
 * @param {string} token - One token, as `tokenLength` measures it
 * @param {boolean} [inClass] - Whether the token sits inside a character class
 * @returns {[number, number][] | null} What it matches, or `null` where it is not
 *   one character of text
 */
function tokenRanges(token, inClass = false) {
  if (token[0] !== '\\') {
    const code = token.codePointAt(0) ?? 0;
    return String.fromCodePoint(code) === token ? [[code, code]] : null;
  }

  const kind = token[1] ?? '';
  const named = CLASS_ESCAPE_RANGES[kind.toLowerCase()];
  if (named) return kind === kind.toLowerCase() ? named : complement(named);

  const control = CONTROL_ESCAPE_CODES[kind];
  if (control !== undefined) return [[control, control]];

  if (kind === 'x' || kind === 'u') {
    const code = Number.parseInt(token[2] === '{' ? token.slice(3, -1) : token.slice(2), 16);
    return Number.isNaN(code) || code > MAX_CODE_POINT ? null : [[code, code]];
  }
  if (kind === 'c') {
    const code = token.charCodeAt(2) % 32;
    return [[code, code]];
  }
  // `\b` asserts a word boundary on its own, and is a backspace inside a class
  if (kind === 'b' && inClass) return [[0x08, 0x08]];
  // `\q{…}` stands for whole strings, not for a character
  if (token.startsWith('\\q{')) return null;
  if (RE_NON_CHARACTER_ESCAPE.test(kind)) return null;

  // The rest is punctuation escaped to be read as itself
  const code = token.codePointAt(1) ?? 0;
  return String.fromCodePoint(code) === token.slice(1) ? [[code, code]] : null;
}

/** @param {[number, number][] | null} ranges @returns {number | null} The one code point it holds */
function singleCode(ranges) {
  const [range] = ranges ?? [];
  return ranges?.length === 1 && range && range[0] === range[1] ? range[0] : null;
}

/**
 * @param {string} atom - Atom as it reads in the source, already unwrapped
 * @param {boolean} [nested] - Whether the pattern carries `v`
 * @param {number} [depth] - Class nesting level of this call
 * @returns {[number, number][] | null} What it matches, or `null` where it is not
 *   one character of text, or one this does not read
 */
function atomRanges(atom, nested = false, depth = 0) {
  if (depth > MAX_PATTERN_DEPTH) return null;
  if (atom === '.') return DOT_RANGES;
  if (atom[0] !== '[') return tokenRanges(atom);
  if (!atom.endsWith(']')) return null;

  let i = atom[1] === '^' ? 2 : 1;
  const negated = i === 2;
  const end = atom.length - 1;
  /** @type {[number, number][]} */
  const members = [];

  while (i < end) {
    // A `v` class nests, and nesting alone is a union to read through
    if (nested && atom[i] === '[') {
      const close = skipCharacterClass(atom, i, true);
      const inner = atomRanges(atom.slice(i, close), true, depth + 1);
      if (!inner) return null;
      members.push(...inner);
      i = close;
      continue;
    }
    // Subtraction and intersection are not unions, and are left unread
    if (nested && (atom.startsWith('--', i) || atom.startsWith('&&', i))) return null;

    const fromLength = tokenLength(atom, i);
    const from = tokenRanges(atom.slice(i, i + fromLength), true);
    if (!from) return null;
    i += fromLength;

    // A dash right before the closing `]` is a member, not the start of a range
    if (atom[i] !== '-' || i + 1 >= end) {
      members.push(...from);
      continue;
    }
    const toLength = tokenLength(atom, i + 1);
    // Only single characters bound a range; `\d-z` is not a range at all
    const low = singleCode(from);
    const high = singleCode(tokenRanges(atom.slice(i + 1, i + 1 + toLength), true));
    if (low === null || high === null) return null;
    members.push([low, high]);
    i += 1 + toLength;
  }

  return negated ? complement(members) : members;
}

/** @param {[number, number][]} ranges @param {[number, number][]} other */
function rangesIntersect(ranges, other) {
  return ranges.some(([low, high]) => other.some(([otherLow, otherHigh]) =>
    low <= otherHigh && otherLow <= high));
}

// Embedding a pattern in a larger regex drops the flags it carried, so the two
// a source can carry on its own are rewritten into it
//
// @@ Replace with inline `(?i:…)` and `(?s:…)` modifiers once Node floor reaches 24

/** @param {string} char @returns {boolean} Whether the character has a single-character counterpart */
function foldsCase(char) {
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  return lower !== upper && lower.length === 1 && upper.length === 1;
}

/** @param {string} char */
function isLower(char) {
  return char === char.toLowerCase();
}

/**
 * @param {string} source - Regex source, assumed syntactically valid
 * @param {boolean} [nested] - Whether the pattern carries `v`
 */
function expandDotAll(source, nested = false) {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const char = source[i];
    if (char === '\\') {
      const length = tokenLength(source, i);
      out += source.slice(i, i + length);
      i += length;
    } else if (char === '[') {
      const end = skipCharacterClass(source, i, nested);
      out += source.slice(i, end);
      i = end;
    } else if (char === '.') {
      out += '[\\s\\S]';
      i++;
    } else {
      out += char;
      i++;
    }
  }
  return out;
}

/**
 * @param {string} source - Regex source, assumed syntactically valid
 * @param {boolean} [nested] - Whether the pattern carries `v`
 */
function foldCase(source, nested = false) {
  let out = '';
  let i = 0;
  let open = 0;

  while (i < source.length) {
    const char = source[i] ?? '';

    if (open === 0) {
      if (char === '\\') {
        const length = tokenLength(source, i);
        out += source.slice(i, i + length);
        i += length;
      } else if (char === '[') {
        open = 1;
        out += char;
        i++;
      } else if (char === '(' && source.startsWith('(?<', i) &&
                 source[i + 3] !== '=' && source[i + 3] !== '!') {
        // A capture group’s name is syntax, and folding it is a syntax error
        const close = source.indexOf('>', i + 3);
        const end = close === -1 ? i + 3 : close + 1;
        out += source.slice(i, end);
        i = end;
      } else {
        out += foldsCase(char) ? '[' + char.toLowerCase() + char.toUpperCase() + ']' : char;
        i++;
      }
      continue;
    }

    if (nested && char === '[') {
      open++;
      out += char;
      i++;
      continue;
    }

    if (char === ']') {
      open--;
      out += char;
      i++;
      continue;
    }

    const fromLength = tokenLength(source, i);
    const from = source.slice(i, i + fromLength);
    const afterFrom = i + fromLength;

    // A range needs the other case’s range beside it—only where both ends are
    // ASCII letters, the one span whose two cases are contiguous and parallel
    // (`ÿ` uppercases to `Ÿ`, 150 code points past where its range ends)
    if (source[afterFrom] === '-' && afterFrom + 1 < source.length && source[afterFrom + 1] !== ']') {
      const toLength = tokenLength(source, afterFrom + 1);
      const to = source.slice(afterFrom + 1, afterFrom + 1 + toLength);
      out += RE_ASCII_LETTER.test(from) && RE_ASCII_LETTER.test(to) && isLower(from) === isLower(to)
        ? from + '-' + to + (isLower(from)
          ? from.toUpperCase() + '-' + to.toUpperCase()
          : from.toLowerCase() + '-' + to.toLowerCase())
        : from + '-' + to;
      i = afterFrom + 1 + toLength;
      continue;
    }

    out += fromLength === 1 && foldsCase(from) ? from.toLowerCase() + from.toUpperCase() : from;
    i = afterFrom;
  }

  return out;
}

/**
 * A pattern’s source, rewritten to match the way its own flags make it match, for
 * embedding in a larger regex that cannot carry them. `i` and `s` fit into a
 * source; `m`, `u`, and `v` do not, and are left to the pattern it joins. Where
 * `i` cannot be written in—a backreference, a range outside ASCII, a range that
 * spans letters without being one—the source stands as it is, matching less than
 * the pattern would rather than more.
 * @param {RegExp} pattern
 * @returns {string}
 */
function embedSource(pattern) {
  let source = pattern.source;
  if (pattern.dotAll) source = expandDotAll(source, pattern.unicodeSets);
  if (pattern.ignoreCase) source = foldCase(source, pattern.unicodeSets);
  return source;
}

/**
 * Walk a regex source for the shapes whose backtracking blows up: an unlimited
 * quantifier over a group that itself contains a variable quantifier (`(a+)+`,
 * `(a?)+`) or alternates, and two unbounded repeats in a row that can consume
 * the same character (`.*.*`, `[a]*a*`, `\w*\d*`). A lone unlimited quantifier
 * stays linear, so `[\s\S]*?` up to a literal terminator passes.
 * @param {string} source - Regex source, assumed syntactically valid
 * @param {number} [depth] - Group nesting level of this call
 * @param {boolean} [nested] - Whether the pattern carries `v`
 * @returns {{risky: boolean, varies: boolean, alternates: boolean, deep: boolean}}
 */
function analyzeQuantifiers(source, depth = 0, nested = false) {
  if (depth > MAX_PATTERN_DEPTH) return { risky: true, varies: true, alternates: true, deep: true };

  let risky = false;
  let varies = false;
  let alternates = false;
  let deep = false;
  /** @type {{text: string, repeats: boolean, ranges: [number, number][] | null} | null} */
  let previous = null;
  let i = 0;

  while (i < source.length) {
    const start = i;
    const char = source[i];
    /** @type {ReturnType<typeof analyzeQuantifiers> | null} */
    let group = null;

    if (char === '|') {
      // Alternatives are separate expressions, so nothing carries across
      alternates = true;
      previous = null;
      i++;
      continue;
    } else if (char === '\\') {
      i += tokenLength(source, i);
    } else if (char === '[') {
      i = skipCharacterClass(source, i, nested);
    } else if (char === '(') {
      let open = 1;
      i++;
      while (i < source.length && open > 0) {
        const inner = source[i];
        if (inner === '\\') {
          i += tokenLength(source, i);
        } else if (inner === '[') {
          i = skipCharacterClass(source, i, nested);
        } else {
          if (inner === '(') open++;
          else if (inner === ')') open--;
          i++;
        }
      }
      // Drop the group prefix (`?:`, `?=`, `?<name>`, …) before reading the body
      group = analyzeQuantifiers(source.slice(start + 1, i - 1).replace(/^\?(?:[:=!]|<[=!]|<[^>]*>)/, ''), depth + 1, nested);
    } else {
      i++;
    }

    const atom = source.slice(start, i);
    RE_QUANTIFIER.lastIndex = i;
    const quantifier = RE_QUANTIFIER.exec(source);
    const upper = quantifier?.[2];
    const repeats = !!quantifier && (quantifier[0][0] === '*' || quantifier[0][0] === '+' || upper === '');
    // A count that can vary—anything but `{n}` and its `{n,n}` spelling—makes
    // the group ambiguous about how much it consumes, which multiplies under an
    // unlimited repeat
    const exact = !!quantifier && quantifier[0][0] === '{' &&
      (upper === undefined || (upper !== '' && Number(upper) === Number(quantifier[1])));
    const variable = !!quantifier && !exact;
    if (quantifier) i = RE_QUANTIFIER.lastIndex;

    if (group) {
      if (group.risky || (repeats && (group.varies || group.alternates))) risky = true;
      if (group.varies) varies = true;
      // A group alternates whether the `|` sits at its top level or deeper
      if (group.alternates) alternates = true;
      if (group.deep) deep = true;
    }
    if (variable) varies = true;
    const text = unwrapAtom(atom);
    const ranges = atomRanges(text, nested);
    const overlaps = !!ranges && !!previous?.ranges && rangesIntersect(ranges, previous.ranges);
    if (repeats && previous?.repeats && (previous.text === text || overlaps)) risky = true;
    previous = { text, repeats, ranges };
  }

  return { risky, varies, alternates, deep };
}

/**
 * @param {RegExp | string} pattern - Pattern to judge, or a bare source to read
 *   as it stands
 * @returns {string | null} What makes the pattern a backtracking risk, phrased
 *   to follow the pattern itself, or `null` where it is none
 */
function describeQuantifierRisk(pattern) {
  const source = typeof pattern === 'string' ? pattern : pattern.source;
  // A pattern too big to read is refused for that, not for a shape nobody saw;
  // its own length is what counts, not the length folding case inflates it to
  if (source.length > MAX_PATTERN_LENGTH) {
    return `runs past ${MAX_PATTERN_LENGTH.toLocaleString()} characters, too long to analyze for catastrophic backtracking—shorten it, or split it into several patterns`;
  }
  // `i` and `s` change what the source matches, so they are written into it
  // before the shapes are read
  const analysis = typeof pattern === 'string'
    ? analyzeQuantifiers(source)
    : analyzeQuantifiers(embedSource(pattern), 0, pattern.unicodeSets);
  if (analysis.deep) {
    return `nests groups more than ${MAX_PATTERN_DEPTH.toLocaleString()} deep, too deep to analyze for catastrophic backtracking—flatten it, or split it into several patterns`;
  }
  return analysis.risky
    ? 'compounds quantifiers or alternation in a way that may cause ReDoS—bound the repetition (e.g., `{0,1000}`) instead'
    : null;
}

/**
 * Find the index of the `>` that closes an opening tag, correctly skipping
 * over quoted attribute values (which may contain `>`).
 * @param {string} html
 * @param {number} pos - Start position (just after the tag name)
 * @returns {number} Index of the closing `>`, or -1 if not found
 */
function findTagEnd(html, pos) {
  let i = pos;
  while (i < html.length) {
    const ch = html[i];
    if (ch === '>') return i;
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      while (i < html.length && html[i] !== q) i++;
    }
    i++;
  }
  return -1;
}

// Exports

export {
  stableStringify,
  findTagEnd,
  LRU,
  MAX_CACHE_ENTRY_SIZE,
  hashContent,
  uniqueId,
  identity,
  isThenable,
  lowercase,
  replaceAsync,
  parseRegExp,
  embedSource,
  describeQuantifierRisk
};