class Sorter {
  sort(tokens, fromIndex = 0) {
    for (let i = 0, len = this.keys.length; i < len; i++) {
      const token = this.keys[i];

      // Single pass: Count matches and collect non-matches
      let matchCount = 0;
      const others = [];

      for (let j = fromIndex; j < tokens.length; j++) {
        if (tokens[j] === token) {
          matchCount++;
        } else {
          others.push(tokens[j]);
        }
      }

      if (matchCount > 0) {
        // Rebuild: `matchCount` instances of token first, then others
        let writeIdx = fromIndex;
        for (let j = 0; j < matchCount; j++) {
          tokens[writeIdx++] = token;
        }
        for (let j = 0; j < others.length; j++) {
          tokens[writeIdx++] = others[j];
        }

        const newFromIndex = fromIndex + matchCount;
        return this.sorterMap.get(token).sort(tokens, newFromIndex);
      }
    }
    return tokens;
  }
}

class TokenChain {
  constructor() {
    // Use map instead of object properties for better performance
    this.map = new Map();
  }

  add(tokens) {
    tokens.forEach((token) => {
      if (!this.map.has(token)) {
        this.map.set(token, { arrays: [], processed: 0 });
      }
      this.map.get(token).arrays.push(tokens);
    });
  }

  createSorter() {
    const sorter = new Sorter();
    sorter.sorterMap = new Map();

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

    sorter.keys = [];

    entries.forEach(([token, data]) => {
      if (data.processed < data.arrays.length) {
        const chain = new TokenChain();

        data.arrays.forEach((tokens) => {
          // Build new array without the current token instead of splicing
          const filtered = [];
          for (let i = 0; i < tokens.length; i++) {
            if (tokens[i] !== token) {
              filtered.push(tokens[i]);
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