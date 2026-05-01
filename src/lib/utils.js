// Stringify for options signatures (sorted keys, shallow, nested objects)

function stableStringify(obj) {
  if (obj == null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    out += JSON.stringify(k) + ':' + stableStringify(obj[k]) + (i < keys.length - 1 ? ',' : '');
  }
  return out + '}';
}

// LRU cache for strings and promises

class LRU {
  constructor(limit = 200) {
    this.limit = limit;
    this.map = new Map();
  }
  get(key) {
    if (this.map.has(key)) {
      const v = this.map.get(key);
      this.map.delete(key);
      this.map.set(key, v);
      return v;
    }
    return undefined;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
  delete(key) { this.map.delete(key); }
}

// FNV-1a 32-bit hash—collision-resistant key for large-input caches

function hashContent(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

// Unique ID generator

function uniqueId(value) {
  let id;
  do {
    id = 'u' + crypto.randomUUID().replace(/-/g, '');
  } while (~value.indexOf(id));
  return id;
}

// Identity and transform functions

function identity(value) {
  return value;
}

function isThenable(value) {
  return value != null && typeof value === 'object' && typeof value.then === 'function';
}

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
async function replaceAsync(str, regex, asyncFn) {
  const promises = [];

  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });

  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

// String patterns to RegExp conversion (for JSON config support)

function parseRegExp(value) {
  if (typeof value === 'string') {
    if (!value) return undefined; // Empty string = not configured
    const match = value.match(/^\/(.+)\/([dgimsuvy]*)$/);
    if (match) {
      return new RegExp(match[1], match[2]);
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