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

// Unique ID generator

function uniqueId(value) {
  let id;
  do {
    id = Math.random().toString(36).replace(/^0\.[0-9]*/, '');
  } while (~value.indexOf(id));
  return id;
}

// Identity functions

function identity(value) {
  return value;
}

function identityAsync(value) {
  return Promise.resolve(value);
}

// Replace async helper

/**
 * Asynchronously replace matches in a string
 * @param {string} str - Input string
 * @param {RegExp} regex - Regular expression with global flag
 * @param {Function} asyncFn - Async function to process each match
 * @returns {Promise<string>} Processed string
 */
export async function replaceAsync(str, regex, asyncFn) {
  const promises = [];

  str.replace(regex, (match, ...args) => {
    const promise = asyncFn(match, ...args);
    promises.push(promise);
  });

  const data = await Promise.all(promises);
  return str.replace(regex, () => data.shift());
}

// Exports

export { stableStringify };
export { LRU };
export { uniqueId };
export { identity };
export { identityAsync };