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
  return str.replace(regex, () => data.shift() ?? '');
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

// ReDoS risk detection for user-supplied patterns

// Quantifier following an atom, with its optional lazy `?`; the capture holds
// the upper bound of a `{n,m}` form, which is empty when the form is `{n,}`
const RE_QUANTIFIER = /(?:[*+?]|\{\d+(?:,(\d*))?\})\??/y;

/** @param {string} source @param {number} index - Index of the opening `[` */
function skipCharacterClass(source, index) {
  let i = index + 1;
  while (i < source.length && source[i] !== ']') {
    i += source[i] === '\\' ? 2 : 1;
  }
  return i + 1;
}

/**
 * Walk a regex source for the shapes whose backtracking blows up: an unlimited
 * quantifier over a group that itself contains a variable quantifier (`(a+)+`,
 * `(a?)+`) or alternates, and the same atom repeated unboundedly twice in a
 * row. A lone unlimited quantifier stays linear, so `[\s\S]*?` up to a literal
 * terminator passes
 * @param {string} source - Regex source, assumed syntactically valid
 * @returns {{risky: boolean, varies: boolean, alternates: boolean}}
 */
function analyzeQuantifiers(source) {
  let risky = false;
  let varies = false;
  let alternates = false;
  /** @type {{text: string, repeats: boolean} | null} */
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
      i += 2;
    } else if (char === '[') {
      i = skipCharacterClass(source, i);
    } else if (char === '(') {
      let depth = 1;
      i++;
      while (i < source.length && depth > 0) {
        const inner = source[i];
        if (inner === '\\') {
          i += 2;
        } else if (inner === '[') {
          i = skipCharacterClass(source, i);
        } else {
          if (inner === '(') depth++;
          else if (inner === ')') depth--;
          i++;
        }
      }
      // Drop the group prefix (`?:`, `?=`, `?<name>`, …) before reading the body
      group = analyzeQuantifiers(source.slice(start + 1, i - 1).replace(/^\?(?:[:=!]|<[=!]|<[^>]*>)/, ''));
    } else {
      i++;
    }

    const atom = source.slice(start, i);
    RE_QUANTIFIER.lastIndex = i;
    const quantifier = RE_QUANTIFIER.exec(source);
    const repeats = !!quantifier && (quantifier[0][0] === '*' || quantifier[0][0] === '+' || quantifier[1] === '');
    // A count that can vary—anything but `{n}`—makes the group ambiguous about
    // how much it consumes, which multiplies under an unlimited repeat
    const variable = !!quantifier && (quantifier[0][0] !== '{' || quantifier[1] !== undefined);
    if (quantifier) i = RE_QUANTIFIER.lastIndex;

    if (group) {
      if (group.risky || (repeats && (group.varies || group.alternates))) risky = true;
      if (group.varies) varies = true;
    }
    if (variable) varies = true;
    if (repeats && previous?.repeats && previous.text === atom) risky = true;
    previous = { text: atom, repeats };
  }

  return { risky, varies, alternates };
}

/**
 * @param {string} source - Regex source to judge
 * @returns {boolean} Whether the pattern can backtrack catastrophically
 */
function hasRiskyQuantifiers(source) {
  return analyzeQuantifiers(source).risky;
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
  hasRiskyQuantifiers
};