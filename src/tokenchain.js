class Sorter {
  sort(tokens, fromIndex = 0) {
    for (let i = 0, len = this.keys.length; i < len; i++) {
      const token = this.keys[i];

      // Build position map for this token to avoid repeated `indexOf`
      const positions = [];
      for (let j = fromIndex; j < tokens.length; j++) {
        if (tokens[j] === token) {
          positions.push(j);
        }
      }

      if (positions.length > 0) {
        // Build new array with tokens in sorted order instead of splicing
        const result = [];

        // Add all instances of the current token first
        for (let j = 0; j < positions.length; j++) {
          result.push(token);
        }

        // Add other tokens, skipping positions where current token was
        const posSet = new Set(positions);
        for (let j = fromIndex; j < tokens.length; j++) {
          if (!posSet.has(j)) {
            result.push(tokens[j]);
          }
        }

        // Copy sorted portion back to tokens array
        for (let j = 0; j < result.length; j++) {
          tokens[fromIndex + j] = result[j];
        }

        const newFromIndex = fromIndex + positions.length;
        return this.sorterMap.get(token).sort(tokens, newFromIndex);
      }
    }
    return tokens;
  }
}

class TokenChain {
  constructor() {
    // Use Map instead of object properties for better performance
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

    // Convert Map entries to array and sort
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