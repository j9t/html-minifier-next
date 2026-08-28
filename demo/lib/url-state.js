// Read and write the state the demo carries in the URL hash,
// kept apart from the page so that it can be read without one

// Option migration map for backward compatibility;
// when renaming options, add entries here to preserve old URLs
//
// Example: `{ 'oldOptionName': 'newOptionName' }`
const OPTION_MIGRATIONS = {
  customFragmentQuantifierLimit: null, // Removed in 8.0.0; discard from old URLs
  html5: null, // Removed in 5.0.0; discard from old URLs
  processConditionalComments: null, // Removed in 6.0.0; discard from old URLs
  removeScriptTypeAttributes: 'removeDefaultTypeAttributes', // Merged in 7.0.0
  removeStyleLinkTypeAttributes: 'removeDefaultTypeAttributes', // Merged in 7.0.0
  sortClassName: 'sortClassNames'
};

/**
 * @param {{input: string, options: object[], defaultOptions: object[], showInvisibles: boolean}} state
 * @returns {string}
 */
export const encodeState = ({ input, options, defaultOptions, showInvisibles }) => {
  const state = {
    i: input || '',
    o: {},
    // Carried only when on, so that URLs written before the view existed read the same
    ...(showInvisibles && { s: 1 })
  };

  // Only store non-default options
  options.forEach((option) => {
    const defaultOption = defaultOptions.find(d => d.id === option.id);
    if (!defaultOption) return;

    if (option.type === 'checkbox') {
      if (Boolean(option.checked) !== Boolean(defaultOption.checked)) {
        state.o[option.id] = option.checked;
      }
    } else if (option.type === 'number') {
      if (option.value !== defaultOption.value) {
        state.o[option.id] = option.value;
      }
    } else if (option.type === 'text') {
      if (option.value !== defaultOption.value) {
        state.o[option.id] = option.value;
      }
    }
  });

  return LZString.compressToEncodedURIComponent(JSON.stringify(state));
};

/**
 * @param {string} hash
 * @returns {{i?: string, o?: Record<string, unknown>, s?: number} | null}
 */
export const decodeState = (hash) => {
  try {
    const decompressed = LZString.decompressFromEncodedURIComponent(hash);
    if (!decompressed) return null;
    const state = JSON.parse(decompressed);

    // Apply option migrations for backward compatibility
    if (state.o) {
      const migratedOptions = {};
      for (const [key, value] of Object.entries(state.o)) {
        if (key in OPTION_MIGRATIONS) {
          // `null` means the option was removed; skip it
          if (OPTION_MIGRATIONS[key]) {
            const target = OPTION_MIGRATIONS[key];
            migratedOptions[target] = migratedOptions[target] || value;
          }
        } else {
          migratedOptions[key] = value;
        }
      }
      state.o = migratedOptions;
    }

    return state;
  } catch {
    // Silently fail for invalid/corrupted URLs
    // console.warn('Failed to decode URL state');
    return null;
  }
};