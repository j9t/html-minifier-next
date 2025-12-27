/**
 * Lightweight SVG optimizations:
 *
 * - Numeric precision reduction for coordinates and path data
 * - Whitespace removal in attribute values (numeric sequences)
 * - Default attribute removal (safe, well-documented defaults)
 * - Color minification (hex shortening, rgb() to hex, named colors)
 * - Identity transform removal
 * - Path data space optimization
 */

import { LRU } from './utils.js';
import { RE_NUMERIC_VALUE } from './constants.js';

// Cache for minified numbers
const numberCache = new LRU(100);

/**
 * Named colors that are shorter than their hex equivalents
 * Only includes cases where using the name saves bytes
 */
const NAMED_COLORS = {
  '#f00': 'red',        // #f00 (4) → red (3), saves 1
  '#c0c0c0': 'silver',  // #c0c0c0 (7) → silver (6), saves 1
  '#808080': 'gray',    // #808080 (7) → gray (4), saves 3
  '#800000': 'maroon',  // #800000 (7) → maroon (6), saves 1
  '#808000': 'olive',   // #808000 (7) → olive (5), saves 2
  '#008000': 'green',   // #008000 (7) → green (5), saves 2
  '#800080': 'purple',  // #800080 (7) → purple (6), saves 1
  '#008080': 'teal',    // #008080 (7) → teal (4), saves 3
  '#000080': 'navy',    // #000080 (7) → navy (4), saves 3
  '#ffa500': 'orange'   // #ffa500 (7) → orange (6), saves 1
};

/**
 * Default SVG attribute values that can be safely removed
 * Only includes well-documented, widely-supported defaults
 */
const SVG_DEFAULT_ATTRS = {
  // Fill and stroke defaults
  fill: value => value === 'black' || value === '#000' || value === '#000000',
  'fill-opacity': value => value === '1',
  'fill-rule': value => value === 'nonzero',
  stroke: value => value === 'none',
  'stroke-dasharray': value => value === 'none',
  'stroke-dashoffset': value => value === '0',
  'stroke-linecap': value => value === 'butt',
  'stroke-linejoin': value => value === 'miter',
  'stroke-miterlimit': value => value === '4',
  'stroke-opacity': value => value === '1',
  'stroke-width': value => value === '1',

  // Text and font defaults
  'font-family': value => value === 'inherit',
  'font-size': value => value === 'medium',
  'font-style': value => value === 'normal',
  'font-variant': value => value === 'normal',
  'font-weight': value => value === 'normal',
  'letter-spacing': value => value === 'normal',
  'text-decoration': value => value === 'none',
  'text-anchor': value => value === 'start',

  // Other common defaults
  opacity: value => value === '1',
  visibility: value => value === 'visible',
  display: value => value === 'inline',
  // Note: Overflow handled especially in `isDefaultAttribute` (not safe for root `<svg>`)

  // Clipping and masking defaults
  'clip-rule': value => value === 'nonzero',
  'clip-path': value => value === 'none',
  mask: value => value === 'none',

  // Marker defaults
  'marker-start': value => value === 'none',
  'marker-mid': value => value === 'none',
  'marker-end': value => value === 'none',

  // Filter and color defaults
  filter: value => value === 'none',
  'color-interpolation': value => value === 'sRGB',
  'color-interpolation-filters': value => value === 'linearRGB'
};

/**
 * Minify numeric value by removing trailing zeros and unnecessary decimals
 * @param {string} num - Numeric string to minify
 * @param {number} precision - Maximum decimal places to keep
 * @returns {string} Minified numeric string
 */
function minifyNumber(num, precision = 3) {
  // Fast path for common values (avoids parsing and caching)
  if (num === '0' || num === '1') return num;
  // Common decimal variants that tools export
  if (num === '0.0' || num === '0.00' || num === '0.000') return '0';
  if (num === '1.0' || num === '1.00' || num === '1.000') return '1';

  // Check cache
  // (Note: uses input string as key, so “0.0000” and “0.00000” create separate entries.
  // This is intentional to avoid parsing overhead.
  // Real-world SVG files from export tools typically use consistent formats.)
  const cacheKey = `${num}:${precision}`;
  const cached = numberCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const parsed = parseFloat(num);

  // Handle special cases
  if (isNaN(parsed)) return num;
  if (parsed === 0) return '0';
  if (!isFinite(parsed)) return num;

  // Convert to fixed precision, then remove trailing zeros
  const fixed = parsed.toFixed(precision);
  const trimmed = fixed.replace(/\.?0+$/, '');

  const result = trimmed || '0';
  numberCache.set(cacheKey, result);
  return result;
}

/**
 * Minify SVG path data by reducing numeric precision and removing unnecessary spaces
 * @param {string} pathData - SVG path data string
 * @param {number} precision - Decimal precision for coordinates
 * @returns {string} Minified path data
 */
function minifyPathData(pathData, precision = 3) {
  if (!pathData || typeof pathData !== 'string') return pathData;

  // First, minify all numbers
  let result = pathData.replace(RE_NUMERIC_VALUE, (match) => {
    return minifyNumber(match, precision);
  });

  // Remove unnecessary spaces around path commands
  // Safe to remove space after a command letter when it’s followed by a number (which may be negative)
  // M 10 20 → M10 20, L -5 -3 → L-5-3
  result = result.replace(/([MLHVCSQTAZmlhvcsqtaz])\s+(?=-?\d)/g, '$1');

  // Safe to remove space before command letter when preceded by a number
  // 0 L → 0L, 20 M → 20M
  result = result.replace(/(\d)\s+([MLHVCSQTAZmlhvcsqtaz])/g, '$1$2');

  // Safe to remove space before negative number when preceded by a number
  // 10 -20 → 10-20 (numbers are separated by the minus sign)
  result = result.replace(/(\d)\s+(-\d)/g, '$1$2');

  return result;
}

/**
 * Minify whitespace in numeric attribute values
 * Examples:
 *   "10 , 20" → "10,20"
 *   "translate( 10 20 )" → "translate(10 20)"
 *   "100, 10  40,  198" → "100,10 40,198"
 *
 * @param {string} value - Attribute value to minify
 * @returns {string} Minified value
 */
function minifyAttributeWhitespace(value) {
  if (!value || typeof value !== 'string') return value;

  return value
    // Remove spaces around commas
    .replace(/\s*,\s*/g, ',')
    // Remove spaces around parentheses
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    // Collapse multiple spaces to single space
    .replace(/\s+/g, ' ')
    // Trim leading/trailing whitespace
    .trim();
}

/**
 * Minify color values (hex shortening, rgb to hex conversion, named colors)
 * Only processes simple color values; preserves case-sensitive references like `url(#id)`
 * @param {string} color - Color value to minify
 * @returns {string} Minified color value
 */
function minifyColor(color) {
  if (!color || typeof color !== 'string') return color;

  const trimmed = color.trim();

  // Don’t process values that aren’t simple colors (preserve case-sensitive references)
  // `url(#id)`, `var(--name)`, `inherit`, `currentColor`, etc.
  if (trimmed.includes('url(') || trimmed.includes('var(') ||
      trimmed === 'inherit' || trimmed === 'currentColor') {
    return trimmed;
  }

  // Now safe to lowercase for color matching
  const lower = trimmed.toLowerCase();

  // Shorten 6-digit hex to 3-digit when possible
  // #aabbcc → #abc, #000000 → #000
  const hexMatch = lower.match(/^#([0-9a-f]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) {
      const shortened = '#' + hex[0] + hex[2] + hex[4];
      // Try to use named color if shorter
      return NAMED_COLORS[shortened] || shortened;
    }
    // Can’t shorten, but check for named color
    return NAMED_COLORS[lower] || lower;
  }

  // Match 3-digit hex colors
  const hex3Match = lower.match(/^#[0-9a-f]{3}$/);
  if (hex3Match) {
    // Check if there’s a shorter named color
    return NAMED_COLORS[lower] || lower;
  }

  // Convert rgb(255,255,255) to hex
  const rgbMatch = lower.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10);
    const g = parseInt(rgbMatch[2], 10);
    const b = parseInt(rgbMatch[3], 10);

    if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
      const toHex = (n) => {
        const h = n.toString(16);
        return h.length === 1 ? '0' + h : h;
      };
      const hexColor = '#' + toHex(r) + toHex(g) + toHex(b);

      // Try to shorten if possible
      if (hexColor[1] === hexColor[2] && hexColor[3] === hexColor[4] && hexColor[5] === hexColor[6]) {
        const shortened = '#' + hexColor[1] + hexColor[3] + hexColor[5];
        return NAMED_COLORS[shortened] || shortened;
      }
      return NAMED_COLORS[hexColor] || hexColor;
    }
  }

  // Not a recognized color format, return as-is (preserves case)
  return trimmed;
}

// Attributes that contain numeric sequences or path data
const NUMERIC_ATTRS = new Set([
  'd', // Path data
  'points', // Polygon/polyline points
  'viewBox', // viewBox coordinates
  'transform', // Transform functions
  'x', 'y', 'x1', 'y1', 'x2', 'y2', // Coordinates
  'cx', 'cy', 'r', 'rx', 'ry', // Circle/ellipse
  'width', 'height', // Dimensions
  'dx', 'dy', // Text offsets
  'offset', // Gradient offset
  'startOffset', // textPath
  'pathLength', // Path length
  'stdDeviation', // Filter params
  'baseFrequency', // Turbulence
  'k1', 'k2', 'k3', 'k4' // Composite filter
]);

// Attributes that contain color values
const COLOR_ATTRS = new Set([
  'fill',
  'stroke',
  'stop-color',
  'flood-color',
  'lighting-color'
]);

// Pre-compiled regexes for identity transform detection (compiled once at module load)
// Separator pattern: Accepts comma with optional spaces or one or more spaces
const SEP = '(?:\\s*,\\s*|\\s+)';

// `translate(0)`, `translate(0,0)`, `translate(0 0)` (matches 0, 0.0, 0.00, etc.)
const IDENTITY_TRANSLATE_RE = new RegExp(`^translate\\s*\\(\\s*0(?:\\.0+)?\\s*(?:${SEP}0(?:\\.0+)?\\s*)?\\)$`, 'i');

// `scale(1)`, `scale(1,1)`, `scale(1 1)` (matches 1, 1.0, 1.00, etc.)
const IDENTITY_SCALE_RE = new RegExp(`^scale\\s*\\(\\s*1(?:\\.0+)?\\s*(?:${SEP}1(?:\\.0+)?\\s*)?\\)$`, 'i');

// `rotate(0)`, `rotate(0 cx cy)`, `rotate(0, cx, cy)` (matches 0, 0.0, 0.00, etc.)
// Note: `cx` and `cy` must be valid numbers if present
const IDENTITY_ROTATE_RE = new RegExp(`^rotate\\s*\\(\\s*0(?:\\.0+)?\\s*(?:${SEP}-?\\d+(?:\\.\\d+)?${SEP}-?\\d+(?:\\.\\d+)?)?\\s*\\)$`, 'i');

// `skewX(0)`, `skewY(0)` (matches 0, 0.0, 0.00, etc.)
const IDENTITY_SKEW_RE = /^skew[XY]\s*\(\s*0(?:\.0+)?\s*\)$/i;

// `matrix(1,0,0,1,0,0)`, `matrix(1 0 0 1 0 0)`—identity matrix (matches 1.0/0.0 variants)
const IDENTITY_MATRIX_RE = new RegExp(`^matrix\\s*\\(\\s*1(?:\\.0+)?\\s*${SEP}0(?:\\.0+)?\\s*${SEP}0(?:\\.0+)?\\s*${SEP}1(?:\\.0+)?\\s*${SEP}0(?:\\.0+)?\\s*${SEP}0(?:\\.0+)?\\s*\\)$`, 'i');

/**
 * Check if a transform attribute has no effect (identity transform)
 * @param {string} transform - Transform attribute value
 * @returns {boolean} True if transform is an identity (has no effect)
 */
function isIdentityTransform(transform) {
  if (!transform || typeof transform !== 'string') return false;

  const trimmed = transform.trim();

  // Check for common identity transforms using pre-compiled regexes
  return IDENTITY_TRANSLATE_RE.test(trimmed) ||
         IDENTITY_SCALE_RE.test(trimmed) ||
         IDENTITY_ROTATE_RE.test(trimmed) ||
         IDENTITY_SKEW_RE.test(trimmed) ||
         IDENTITY_MATRIX_RE.test(trimmed);
}

/**
 * Check if an attribute should be removed based on default value
 * @param {string} tag - Element tag name (e.g., `svg`, `rect`, `path`)
 * @param {string} name - Attribute name
 * @param {string} value - Attribute value
 * @returns {boolean} True if attribute can be removed
 */
function isDefaultAttribute(tag, name, value) {
  // Special case: `overflow="visible"` is unsafe for root `<svg>` element
  // Root SVG may need explicit `overflow="visible"` to show clipped content
  if (name === 'overflow' && value === 'visible') {
    return tag !== 'svg'; // Only remove for non-root SVG elements
  }

  const checker = SVG_DEFAULT_ATTRS[name];
  if (!checker) return false;

  // Special case: Don’t remove `fill="black"` if stroke exists without fill
  // This would change the rendering (stroke-only shapes would gain black fill)
  if (name === 'fill' && checker(value)) {
    // This check would require looking at other attributes on the same element
    // For safety, we’ll keep this conservative and not remove `fill="black"`
    // in the initial implementation. Can be refined later.
    return false;
  }

  return checker(value);
}

/**
 * Minify SVG attribute value based on attribute name
 * @param {string} name - Attribute name
 * @param {string} value - Attribute value
 * @param {Object} options - Minification options
 * @returns {string} Minified attribute value
 */
export function minifySVGAttributeValue(name, value, options = {}) {
  if (!value || typeof value !== 'string') return value;

  const { precision = 3, minifyColors = true } = options;

  // Path data gets special treatment
  if (name === 'd') {
    return minifyPathData(value, precision);
  }

  // Numeric attributes get precision reduction and whitespace minification
  if (NUMERIC_ATTRS.has(name)) {
    const minified = value.replace(RE_NUMERIC_VALUE, (match) => {
      return minifyNumber(match, precision);
    });
    return minifyAttributeWhitespace(minified);
  }

  // Color attributes get color minification
  if (minifyColors && COLOR_ATTRS.has(name)) {
    return minifyColor(value);
  }

  return value;
}

/**
 * Check if an SVG attribute can be removed
 * @param {string} tag - Element tag name (e.g., `svg`, `rect`, `path`)
 * @param {string} name - Attribute name
 * @param {string} value - Attribute value
 * @param {Object} options - Minification options
 * @returns {boolean} True if attribute should be removed
 */
export function shouldRemoveSVGAttribute(tag, name, value, options = {}) {
  const { removeDefaults = true } = options;

  if (!removeDefaults) return false;

  // Check for identity transforms
  if (name === 'transform' && isIdentityTransform(value)) {
    return true;
  }

  return isDefaultAttribute(tag, name, value);
}

/**
 * Get default SVG minification options
 * @param {Object} userOptions - User-provided options
 * @returns {Object} Complete options object with defaults
 */
export function getSVGMinifierOptions(userOptions) {
  if (typeof userOptions === 'boolean') {
    return userOptions ? {
      precision: 3,
      removeDefaults: true,
      minifyColors: true
    } : null;
  }

  if (typeof userOptions === 'object' && userOptions !== null) {
    return {
      precision: userOptions.precision ?? 3,
      removeDefaults: userOptions.removeDefaults ?? true,
      minifyColors: userOptions.minifyColors ?? true
    };
  }

  return null;
}