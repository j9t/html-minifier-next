/**
 * Lightweight SVG optimizations:
 *
 * - Numeric precision reduction for coordinates and path data
 * - Whitespace removal in attribute values (numeric sequences)
 * - Default attribute removal (safe, well-documented defaults)
 * - Color minification (hex shortening, rgb() to hex)
 */

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
  overflow: value => value === 'visible'
};

/**
 * Minify numeric value by removing trailing zeros and unnecessary decimals
 * @param {string} num - Numeric string to minify
 * @param {number} precision - Maximum decimal places to keep
 * @returns {string} Minified numeric string
 */
function minifyNumber(num, precision = 3) {
  const parsed = parseFloat(num);

  // Handle special cases
  if (isNaN(parsed)) return num;
  if (parsed === 0) return '0';
  if (!isFinite(parsed)) return num;

  // Convert to fixed precision, then remove trailing zeros
  const fixed = parsed.toFixed(precision);
  const trimmed = fixed.replace(/\.?0+$/, '');

  return trimmed || '0';
}

/**
 * Minify SVG path data by reducing numeric precision
 * @param {string} pathData - SVG path data string
 * @param {number} precision - Decimal precision for coordinates
 * @returns {string} Minified path data
 */
function minifyPathData(pathData, precision = 3) {
  if (!pathData || typeof pathData !== 'string') return pathData;

  // Match numbers (including scientific notation and negative values)
  // Regex: optional minus, digits, optional decimal point and more digits, optional exponent
  return pathData.replace(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, (match) => {
    return minifyNumber(match, precision);
  });
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
 * Minify color values (hex shortening, rgb to hex conversion)
 * @param {string} color - Color value to minify
 * @returns {string} Minified color value
 */
function minifyColor(color) {
  if (!color || typeof color !== 'string') return color;

  const trimmed = color.trim().toLowerCase();

  // Shorten 6-digit hex to 3-digit when possible
  // #aabbcc → #abc, #000000 → #000
  const hexMatch = trimmed.match(/^#([0-9a-f]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5]) {
      return '#' + hex[0] + hex[2] + hex[4];
    }
  }

  // Convert rgb(255,255,255) to hex
  const rgbMatch = trimmed.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
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
        return '#' + hexColor[1] + hexColor[3] + hexColor[5];
      }
      return hexColor;
    }
  }

  return color;
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

/**
 * Check if an attribute should be removed based on default value
 * @param {string} name - Attribute name
 * @param {string} value - Attribute value
 * @returns {boolean} True if attribute can be removed
 */
function isDefaultAttribute(name, value) {
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
    const minified = value.replace(/-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, (match) => {
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
 * @param {string} name - Attribute name
 * @param {string} value - Attribute value
 * @param {Object} options - Minification options
 * @returns {boolean} True if attribute should be removed
 */
export function shouldRemoveSVGAttribute(name, value, options = {}) {
  const { removeDefaults = true } = options;

  if (!removeDefaults) return false;

  return isDefaultAttribute(name, value);
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