/**
 * Preset configurations for HTML Minifier Next
 *
 * Presets provide curated option sets for common use cases:
 * - conservative: Safe minification suitable for most projects
 * - comprehensive: Aggressive minification for maximum file size reduction
 */

export const presets = {
  conservative: {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    conservativeCollapse: true,
    continueOnParseError: true,
    decodeEntities: true,
    minifyURLs: true,
    noNewlinesBeforeTagClose: true,
    preserveLineBreaks: true,
    removeComments: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true
  },
  comprehensive: {
    // @@ Add `collapseAttributeWhitespace: true` (also add to preset in demo)
    caseSensitive: true,
    collapseBooleanAttributes: true,
    collapseInlineTagWhitespace: true,
    collapseWhitespace: true,
    continueOnParseError: true,
    decodeEntities: true,
    minifyCSS: true,
    minifyJS: true,
    minifyURLs: true,
    noNewlinesBeforeTagClose: true,
    processConditionalComments: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    sortAttributes: true,
    sortClassName: true,
    useShortDoctype: true
  }
};

/**
 * Get preset configuration by name
 * @param {string} name - Preset name ('conservative' or 'comprehensive')
 * @returns {object|null} Preset options object or null if not found
 */
export function getPreset(name) {
  if (!name) return null;
  const normalizedName = name.toLowerCase();
  return presets[normalizedName] || null;
}

/**
 * Get list of available preset names
 * @returns {string[]} Array of preset names
 */
export function getPresetNames() {
  return Object.keys(presets);
}