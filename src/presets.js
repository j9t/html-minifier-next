/**
 * Preset configurations
 *
 * Presets provide curated option sets for common use cases:
 * - `conservative`: Safe minification suitable for most projects
 * - `comprehensive`: Aggressive minification for maximum file size reduction
 */

export const presets = {
  conservative: {
    caseSensitive: true,
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    conservativeCollapse: true,
    preserveLineBreaks: true,
    processConditionalComments: true,
    removeComments: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true
  },
  comprehensive: {
    collapseAttributeWhitespace: true,
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    continueOnParseError: true,
    decodeEntities: true,
    mergeScripts: true,
    minifyCSS: true,
    minifyJS: true,
    minifySVG: true,
    minifyURLs: true,
    processConditionalComments: true,
    removeAttributeQuotes: true,
    removeComments: true,
    removeEmptyAttributes: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    removeScriptTypeAttributes: true,
    removeStyleLinkTypeAttributes: true,
    useShortDoctype: true
  }
};

/**
 * Get preset configuration by name
 * @param {string} name - Preset name (“conservative” or “comprehensive”)
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