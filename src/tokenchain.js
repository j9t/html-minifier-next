class Sorter {
  constructor() {
    /** @type {string[]} */
    this.keys = [];
    /** @type {Map<string, Sorter>} */
    this.sorterMap = new Map();
  }

  /**
   * @param {string[]} tokens
   * @param {number} fromIndex
   * @returns {string[]}
   */
  sort(tokens, fromIndex = 0) {
    for (const token of this.keys) {

      // Single pass: Count matches and collect non-matches
      let matchCount = 0;
      const others = [];

      for (let j = fromIndex; j < tokens.length; j++) {
        const t = /** @type {string} */ (tokens[j]);
        if (t === token) {
          matchCount++;
        } else {
          others.push(t);
        }
      }

      if (matchCount > 0) {
        // Rebuild: `matchCount` instances of token first, then others
        let writeIdx = fromIndex;
        for (let j = 0; j < matchCount; j++) {
          tokens[writeIdx++] = token;
        }
        for (const other of others) {
          tokens[writeIdx++] = other;
        }

        const newFromIndex = fromIndex + matchCount;
        return this.sorterMap.get(token)?.sort(tokens, newFromIndex) ?? tokens;
      }
    }
    return tokens;
  }
}

class TokenChain {
  constructor() {
    /** @type {Map<string, {arrays: string[][], processed: number}>} */
    this.map = new Map();
  }

  /** @param {string[]} tokens */
  add(tokens) {
    tokens.forEach((token) => {
      if (!this.map.has(token)) {
        this.map.set(token, { arrays: [], processed: 0 });
      }
      this.map.get(token)?.arrays.push(tokens);
    });
  }

  createSorter() {
    const sorter = new Sorter();

    // Convert map entries to array and sort by frequency (descending), then alphabetically
    const entries = Array.from(this.map.entries()).sort((a, b) => {
      const m = a[1].arrays.length;
      const n = b[1].arrays.length;
      // Sort by length descending (larger first)
      const lengthDiff = n - m;
      if (lengthDiff !== 0) return lengthDiff;
      // If lengths equal, sort by key ascending
      return a[0].localeCompare(b[0]);
    });

    entries.forEach(([token, data]) => {
      if (data.processed < data.arrays.length) {
        const chain = new TokenChain();

        data.arrays.forEach((tokens) => {
          // Build new array without the current token instead of splicing
          /** @type {string[]} */
          const filtered = [];
          for (const t of tokens) {
            if (t !== token) {
              filtered.push(t);
            }
          }

          // Mark remaining tokens as processed
          filtered.forEach((t) => {
            const tData = this.map.get(t);
            if (tData) {
              tData.processed++;
            }
          });

          if (filtered.length > 0) {
            chain.add(filtered);
          }
        });

        sorter.keys.push(token);
        sorter.sorterMap.set(token, chain.createSorter());
      }
    });

    return sorter;
  }
}

export default TokenChain;