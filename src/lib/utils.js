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
    /** @type {Map<string, unknown>} */
    this.map = new Map();
  }
  /** @param {string} key */
  get(key) {
    if (this.map.has(key)) {
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
}

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

/** @param {unknown} value */
function isThenable(value) {
  return value != null && typeof value === 'object' && typeof /** @type {any} */ (value).then === 'function';
}

/** @param {string} value */
function lowercase(value) {
  return value.toLowerCase();
}

// Replace async helper

/**
 * Asynchronously replace matches in a string
 * @param {string} str - Input string
 * @param {RegExp} regex - Regular expression with global flag
 * @param {Function} asyncFn - Async function to process each match
 * @returns {Promise<string>} Processed string
 */
/**
 * @param {string} str
 * @param {RegExp} regex
 * @param {Function} asyncFn
 * @returns {Promise<string>}
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

// Exports

export { stableStringify };
export { LRU };
export { hashContent };
export { uniqueId };
export { identity };
export { isThenable };
export { lowercase };
export { replaceAsync };
export { parseRegExp };