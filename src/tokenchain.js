class Sorter {
  constructor() {
    // Rank per token, in the order the keys were added—looked up per token, so a
    // token list sorts in one pass instead of one scan per known key
    /** @type {Map<string, number>} */
    this.rank = new Map();
    /** @type {Map<string, Sorter>} */
    this.sorterMap = new Map();
  }

  /**
   * @param {string[]} tokens
   * @param {number} fromIndex
   * @returns {string[]}
   */
  sort(tokens, fromIndex = 0) {
    // The present token with the lowest rank comes first—the same choice scanning
    // the keys in order would make
    let best = null;
    let bestRank = Infinity;
    for (let j = fromIndex; j < tokens.length; j++) {
      const rank = this.rank.get(/** @type {string} */ (tokens[j]));
      if (rank !== undefined && rank < bestRank) {
        bestRank = rank;
        best = /** @type {string} */ (tokens[j]);
      }
    }
    if (best === null) return tokens;

    // Single pass: Count matches and collect non-matches
    let matchCount = 0;
    const others = [];
    for (let j = fromIndex; j < tokens.length; j++) {
      const t = /** @type {string} */ (tokens[j]);
      if (t === best) {
        matchCount++;
      } else {
        others.push(t);
      }
    }

    // Rebuild: `matchCount` instances of the best token first, then others
    let writeIdx = fromIndex;
    for (let j = 0; j < matchCount; j++) {
      tokens[writeIdx++] = best;
    }
    for (const other of others) {
      tokens[writeIdx++] = other;
    }

    return this.sorterMap.get(best)?.sort(tokens, fromIndex + matchCount) ?? tokens;
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
      let entry = this.map.get(token);
      if (!entry) {
        entry = { arrays: [], processed: 0 };
        this.map.set(token, entry);
      }
      entry.arrays.push(tokens);
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

        sorter.rank.set(token, sorter.rank.size);
        sorter.sorterMap.set(token, chain.createSorter());
      }
    });

    return sorter;
  }
}

export default TokenChain;