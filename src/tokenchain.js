class Sorter {
  constructor() {
    // Rank per token, in the order the keys were added—looked up per token, so a
    // token list sorts in one pass instead of one scan per known key
    /** @type {Map<string, number>} */
    this.rank = new Map();
    /** @type {Map<string, Sorter | (() => Sorter)>} */
    this.sorterMap = new Map();
  }

  /** @param {string} token */
  child(token) {
    let child = this.sorterMap.get(token);
    // Nested sorters are built on first use, as most are never reached
    if (typeof child === 'function') {
      child = child();
      this.sorterMap.set(token, child);
    }
    return child;
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

    return this.child(best)?.sort(tokens, fromIndex + matchCount) ?? tokens;
  }
}

const compareLocale = new Intl.Collator().compare;

class TokenChain {
  constructor() {
    // Identical token lists are kept once, with how often they occurred
    /** @type {Map<string, {lists: Map<string, {tokens: string[], weight: number}>, count: number, processed: number}>} */
    this.map = new Map();
  }

  /**
   * @param {string[]} tokens
   * @param {number} [weight]
   */
  add(tokens, weight = 1) {
    // Tokens hold no whitespace, so a space-joined key is unique
    const key = tokens.join(' ');
    for (const token of tokens) {
      let entry = this.map.get(token);
      if (!entry) {
        entry = { lists: new Map(), count: 0, processed: 0 };
        this.map.set(token, entry);
      }
      const list = entry.lists.get(key);
      if (list) {
        list.weight += weight;
      } else {
        entry.lists.set(key, { tokens, weight });
      }
      entry.count += weight;
    }
  }

  /** @param {Map<string, number>} [localeRanks] */
  createSorter(localeRanks) {
    const sorter = new Sorter();

    // Rank all tokens in locale order once, so nested chains break ties on numbers;
    // tokens the collator deems equal share a rank and keep the stable sort’s order
    if (!localeRanks) {
      localeRanks = new Map();
      const tokens = Array.from(this.map.keys()).sort(compareLocale);
      let rank = 0;
      for (let i = 0; i < tokens.length; i++) {
        const token = /** @type {string} */ (tokens[i]);
        if (i && compareLocale(/** @type {string} */ (tokens[i - 1]), token) !== 0) {
          rank++;
        }
        localeRanks.set(token, rank);
      }
    }
    const ranks = localeRanks;

    // Sort tokens by usage frequency (descending), then alphabetically
    const entries = Array.from(this.map.entries()).sort((a, b) => {
      const countDiff = b[1].count - a[1].count;
      if (countDiff !== 0) return countDiff;
      return /** @type {number} */ (ranks.get(a[0])) - /** @type {number} */ (ranks.get(b[0]));
    });

    for (const [token, data] of entries) {
      if (data.processed < data.count) {
        const lists = data.lists;
        for (const { tokens, weight } of lists.values()) {
          for (const t of tokens) {
            if (t !== token) {
              const tData = this.map.get(t);
              if (tData) {
                tData.processed += weight;
              }
            }
          }
        }

        sorter.rank.set(token, sorter.rank.size);
        sorter.sorterMap.set(token, () => {
          const chain = new TokenChain();
          for (const { tokens, weight } of lists.values()) {
            const filtered = tokens.filter(t => t !== token);
            if (filtered.length > 0) {
              chain.add(filtered, weight);
            }
          }
          return chain.createSorter(ranks);
        });
      }
    }

    return sorter;
  }
}

export default TokenChain;