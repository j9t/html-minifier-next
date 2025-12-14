import { decodeHTMLStrict, decodeHTML } from 'entities';
import RelateURL from 'relateurl';
import { HTMLParser, endTag } from './htmlparser.js';
import TokenChain from './tokenchain.js';
import { replaceAsync } from './utils.js';
import { presets, getPreset, getPresetNames } from './presets.js';

// Lazy-load heavy dependencies only when needed

let lightningCSSPromise;
async function getLightningCSS() {
  if (!lightningCSSPromise) {
    lightningCSSPromise = import('lightningcss').then(m => m.transform);
  }
  return lightningCSSPromise;
}

let terserPromise;
async function getTerser() {
  if (!terserPromise) {
    terserPromise = import('terser').then(m => m.minify);
  }
  return terserPromise;
}

// Type definitions

/**
 * @typedef {Object} HTMLAttribute
 *  Representation of an attribute from the HTML parser.
 *
 * @prop {string} name
 * @prop {string} [value]
 * @prop {string} [quote]
 * @prop {string} [customAssign]
 * @prop {string} [customOpen]
 * @prop {string} [customClose]
 */

/**
 * @typedef {Object} MinifierOptions
 *  Options that control how HTML is minified. All of these are optional
 *  and usually default to a disabled/safe value unless noted.
 *
 * @prop {(tag: string, attrs: HTMLAttribute[], canCollapseWhitespace: (tag: string) => boolean) => boolean} [canCollapseWhitespace]
 *  Predicate that determines whether whitespace inside a given element
 *  can be collapsed.
 *
 *  Default: Built-in `canCollapseWhitespace` function
 *
 * @prop {(tag: string | null, attrs: HTMLAttribute[] | undefined, canTrimWhitespace: (tag: string) => boolean) => boolean} [canTrimWhitespace]
 *  Predicate that determines whether leading/trailing whitespace around
 *  the element may be trimmed.
 *
 *  Default: Built-in `canTrimWhitespace` function
 *
 * @prop {boolean} [caseSensitive]
 *  When true, tag and attribute names are treated as case-sensitive.
 *  Useful for custom HTML tags.
 *  If false (default) names are lower-cased via the `name` function.
 *
 *  Default: `false`
 *
 * @prop {boolean} [collapseBooleanAttributes]
 *  Collapse boolean attributes to their name only (for example
 *  `disabled="disabled"` → `disabled`).
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#collapse_boolean_attributes
 *
 *  Default: `false`
 *
 * @prop {boolean} [collapseInlineTagWhitespace]
 *  When false (default) whitespace around `inline` tags is preserved in
 *  more cases. When true, whitespace around inline tags may be collapsed.
 *  Must also enable `collapseWhitespace` to have effect.
 *
 *  Default: `false`
 *
 * @prop {boolean} [collapseWhitespace]
 *  Collapse multiple whitespace characters into one where allowed. Also
 *  controls trimming behaviour in several code paths.
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#collapse_whitespace
 *
 *  Default: `false`
 *
 * @prop {boolean} [conservativeCollapse]
 *  If true, be conservative when collapsing whitespace (preserve more
 *  whitespace in edge cases). Affects collapse algorithms.
 *  Must also enable `collapseWhitespace` to have effect.
 *
 *  Default: `false`
 *
 * @prop {boolean} [continueOnMinifyError]
 *  When set to `false`, minification errors may throw.
 *  By default, the minifier will attempt to recover from minification
 *  errors, or ignore them and preserve the original content.
 *
 *  Default: `true`
 *
 * @prop {boolean} [continueOnParseError]
 *  When true, the parser will attempt to continue on recoverable parse
 *  errors. Otherwise, parsing errors may throw.
 *
 *  Default: `false`
 *
 * @prop {RegExp[]} [customAttrAssign]
 *  Array of regexes used to recognise custom attribute assignment
 *  operators (e.g. `'<div flex?="{{mode != cover}}"></div>'`).
 *  These are concatenated with the built-in assignment patterns.
 *
 *  Default: `[]`
 *
 * @prop {RegExp} [customAttrCollapse]
 *  Regex matching attribute names whose values should be collapsed.
 *  Basically used to remove newlines and excess spaces inside attribute values,
 *  e.g. `/ng-class/`.
 *
 * @prop {[RegExp, RegExp][]} [customAttrSurround]
 *  Array of `[openRegExp, closeRegExp]` pairs used by the parser to
 *  detect custom attribute surround patterns (for non-standard syntaxes,
 *  e.g. `<input {{#if value}}checked="checked"{{/if}}>`).
 *
 * @prop {RegExp[]} [customEventAttributes]
 *  Array of regexes used to detect event handler attributes for `minifyJS`
 *  (e.g. `ng-click`). The default matches standard `on…` event attributes.
 *
 *  Default: `[/^on[a-z]{3,}$/]`
 *
 * @prop {number} [customFragmentQuantifierLimit]
 *  Limits the quantifier used when building a safe regex for custom
 *  fragments to avoid ReDoS. See source use for details.
 *
 *  Default: `200`
 *
 * @prop {boolean} [decodeEntities]
 *  When true, decodes HTML entities in text and attributes before
 *  processing, and re-encodes ambiguous ampersands when outputting.
 *
 *  Default: `false`
 *
 * @prop {boolean} [html5]
 *  Parse and emit using HTML5 rules. Set to `false` to use non-HTML5
 *  parsing behavior.
 *
 *  Default: `true`
 *
 * @prop {RegExp[]} [ignoreCustomComments]
 *  Comments matching any pattern in this array of regexes will be
 *  preserved when `removeComments` is enabled. The default preserves
 *  “bang” comments and comments starting with `#`.
 *
 *  Default: `[/^!/, /^\s*#/]`
 *
 * @prop {RegExp[]} [ignoreCustomFragments]
 *  Array of regexes used to identify fragments that should be
 *  preserved (for example server templates). These fragments are temporarily
 *  replaced during minification to avoid corrupting template code.
 *  The default preserves ASP/PHP-style tags.
 *
 *  Default: `[/<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/]`
 *
 * @prop {boolean} [includeAutoGeneratedTags]
 *  If false, tags marked as auto-generated by the parser will be omitted
 *  from output. Useful to skip injected tags.
 *
 *  Default: `true`
 *
 * @prop {ArrayLike<string>} [inlineCustomElements]
 *  Collection of custom element tag names that should be treated as inline
 *  elements for white-space handling, alongside the built-in inline elements.
 *
 *  Default: `[]`
 *
 * @prop {boolean} [keepClosingSlash]
 *  Preserve the trailing slash in self-closing tags when present.
 *
 *  Default: `false`
 *
 * @prop {(message: unknown) => void} [log]
 *  Logging function used by the minifier for warnings/errors/info.
 *  You can directly provide `console.log`, but `message` may also be an `Error`
 *  object or other non-string value.
 *
 *  Default: `() => {}` (no-op function)
 *
 * @prop {number} [maxInputLength]
 *  The maximum allowed input length. Used as a guard against ReDoS via
 *  pathological inputs. If the input exceeds this length an error is
 *  thrown.
 *
 *  Default: No limit
 *
 * @prop {number} [maxLineLength]
 *  Maximum line length for the output. When set the minifier will wrap
 *  output to the given number of characters where possible.
 *
 *  Default: No limit
 *
 * @prop {boolean | Partial<import("lightningcss").TransformOptions<import("lightningcss").CustomAtRules>> | ((text: string, type?: string) => Promise<string> | string)} [minifyCSS]
 *  When true, enables CSS minification for inline `<style>` tags or
 *  `style` attributes. If an object is provided, it is passed to
 *  [Lightning CSS](https://www.npmjs.com/package/lightningcss)
 *  as transform options. If a function is provided, it will be used to perform
 *  custom CSS minification. If disabled, CSS is not minified.
 *
 *  Default: `false`
 *
 * @prop {boolean | import("terser").MinifyOptions | ((text: string, inline?: boolean) => Promise<string> | string)} [minifyJS]
 *  When true, enables JS minification for `<script>` contents and
 *  event handler attributes. If an object is provided, it is passed to
 *  [terser](https://www.npmjs.com/package/terser) as minify options.
 *  If a function is provided, it will be used to perform
 *  custom JS minification. If disabled, JS is not minified.
 *
 *  Default: `false`
 *
 * @prop {boolean | string | import("relateurl").Options | ((text: string) => Promise<string> | string)} [minifyURLs]
 *  When true, enables URL rewriting/minification. If an object is provided,
 *  it is passed to [relateurl](https://www.npmjs.com/package/relateurl)
 *  as options. If a string is provided, it is treated as an `{ site: string }`
 *  options object. If a function is provided, it will be used to perform
 *  custom URL minification. If disabled, URLs are not minified.
 *
 *  Default: `false`
 *
 * @prop {(name: string) => string} [name]
 *  Function used to normalise tag/attribute names. By default, this lowercases
 *  names, unless `caseSensitive` is enabled.
 *
 *  Default: `(name) => name.toLowerCase()`,
 *  or `(name) => name` (no-op function) if `caseSensitive` is enabled.
 *
 * @prop {boolean} [noNewlinesBeforeTagClose]
 *  When wrapping lines, prevent inserting a newline directly before a
 *  closing tag (useful to keep tags like `</a>` on the same line).
 *
 *  Default: `false`
 *
 * @prop {boolean} [partialMarkup]
 *  When true, treat input as a partial HTML fragment rather than a complete
 *  document. This preserves stray end tags (closing tags without corresponding
 *  opening tags) and prevents auto-closing of unclosed tags at the end of input.
 *  Useful for minifying template fragments, SSI includes, or other partial HTML
 *  that will be combined with other fragments.
 *
 *  Default: `false`
 *
 * @prop {boolean} [preserveLineBreaks]
 *  Preserve a single line break at the start/end of text nodes when
 *  collapsing/trimming whitespace.
 *  Must also enable `collapseWhitespace` to have effect.
 *
 *  Default: `false`
 *
 * @prop {boolean} [preventAttributesEscaping]
 *  When true, attribute values will not be HTML-escaped (dangerous for
 *  untrusted input). By default, attributes are escaped.
 *
 *  Default: `false`
 *
 * @prop {boolean} [processConditionalComments]
 *  When true, conditional comments (for example `<!--[if IE]> … <![endif]-->`)
 *  will have their inner content processed by the minifier.
 *  Useful to minify HTML that appears inside conditional comments.
 *
 *  Default: `false`
 *
 * @prop {string[]} [processScripts]
 *  Array of `type` attribute values for `<script>` elements whose contents
 *  should be processed as HTML
 *  (e.g. `text/ng-template`, `text/x-handlebars-template`, etc.).
 *  When present, the contents of matching script tags are recursively minified,
 *  like normal HTML content.
 *
 *  Default: `[]`
 *
 * @prop {"\"" | "'"} [quoteCharacter]
 *  Preferred quote character for attribute values. If unspecified the
 *  minifier picks the safest quote based on the attribute value.
 *
 *  Default: Auto-detected
 *
 * @prop {boolean} [removeAttributeQuotes]
 *  Remove quotes around attribute values where it is safe to do so.
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#remove_attribute_quotes
 *
 *  Default: `false`
 *
 * @prop {boolean} [removeComments]
 *  Remove HTML comments. Comments that match `ignoreCustomComments` will
 *  still be preserved.
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#remove_comments
 *
 *  Default: `false`
 *
 * @prop {boolean | ((attrName: string, tag: string) => boolean)} [removeEmptyAttributes]
 *  If true, removes attributes whose values are empty (some attributes
 *  are excluded by name). Can also be a function to customise which empty
 *  attributes are removed.
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#remove_empty_or_blank_attributes
 *
 *  Default: `false`
 *
 * @prop {boolean} [removeEmptyElements]
 *  Remove elements that are empty and safe to remove (for example
 *  `<script />` without `src`).
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#remove_empty_elements
 *
 *  Default: `false`
 *
 * @prop {string[]} [removeEmptyElementsExcept]
 *  Specifies empty elements to preserve when `removeEmptyElements` is enabled.
 *  Has no effect unless `removeEmptyElements: true`.
 *
 *  Accepts tag names or HTML-like element specifications:
 *
 *  * Tag name only: `["td", "span"]`—preserves all empty elements of these types
 *  * With valued attributes: `["<span aria-hidden='true'>"]`—preserves only when attribute values match
 *  * With boolean attributes: `["<input disabled>"]`—preserves only when boolean attribute is present
 *  * Mixed: `["<button type='button' disabled>"]`—all specified attributes must match
 *
 *  Attribute matching:
 *
 *  * All specified attributes must be present and match (valued attributes must have exact values)
 *  * Additional attributes on the element are allowed
 *  * Attribute name matching respects the `caseSensitive` option
 *  * Supports double quotes, single quotes, and unquoted attribute values in specifications
 *
 *  Limitations:
 *
 *  * Self-closing syntax (e.g., `["<span/>"]`) is not supported; use `["span"]` instead
 *  * Definitions containing `>` within quoted attribute values (e.g., `["<span title='a>b'>"]`) are not supported
 *
 *  Default: `[]`
 *
 * @prop {boolean} [removeOptionalTags]
 *  Drop optional start/end tags where the HTML specification permits it
 *  (for example `</li>`, optional `<html>` etc.).
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#remove_optional_tags
 *
 *  Default: `false`
 *
 * @prop {boolean} [removeRedundantAttributes]
 *  Remove attributes that are redundant because they match the element’s
 *  default values (for example `<button type="submit">`).
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#remove_redundant_attributes
 *
 *  Default: `false`
 *
 * @prop {boolean} [removeScriptTypeAttributes]
 *  Remove `type` attributes from `<script>` when they are unnecessary
 *  (e.g. `type="text/javascript"`).
 *
 *  Default: `false`
 *
 * @prop {boolean} [removeStyleLinkTypeAttributes]
 *  Remove `type` attributes from `<style>` and `<link>` elements when
 *  they are unnecessary (e.g. `type="text/css"`).
 *
 *  Default: `false`
 *
 * @prop {boolean} [removeTagWhitespace]
 *  **Note that this will result in invalid HTML!**
 *
 *  When true, extra whitespace between tag name and attributes (or before
 *  the closing bracket) will be removed where possible. Affects output spacing
 *  such as the space used in the short doctype representation.
 *
 *  Default: `false`
 *
 * @prop {boolean | ((tag: string, attrs: HTMLAttribute[]) => void)} [sortAttributes]
 *  When true, enables sorting of attributes. If a function is provided it
 *  will be used as a custom attribute sorter, which should mutate `attrs`
 *  in-place to the desired order. If disabled, the minifier will attempt to
 *  preserve the order from the input.
 *
 *  Default: `false`
 *
 * @prop {boolean | ((value: string) => string)} [sortClassName]
 *  When true, enables sorting of class names inside `class` attributes.
 *  If a function is provided it will be used to transform/sort the class
 *  name string. If disabled, the minifier will attempt to preserve the
 *  class-name order from the input.
 *
 *  Default: `false`
 *
 * @prop {boolean} [trimCustomFragments]
 *  When true, whitespace around ignored custom fragments may be trimmed
 *  more aggressively. This affects how preserved fragments interact with
 *  surrounding whitespace collapse.
 *
 *  Default: `false`
 *
 * @prop {boolean} [useShortDoctype]
 *  Replace the HTML doctype with the short `<!doctype html>` form.
 *  See also: https://perfectionkills.com/experimenting-with-html-minifier/#use_short_doctype
 *
 *  Default: `false`
 */

// Hoisted, reusable RegExp patterns and tiny helpers to avoid repeated allocations in hot paths
const RE_WS_START = /^[ \n\r\t\f]+/;
const RE_WS_END = /[ \n\r\t\f]+$/;
const RE_ALL_WS_NBSP = /[ \n\r\t\f\xA0]+/g;
const RE_NBSP_LEADING_GROUP = /(^|\xA0+)[^\xA0]+/g;
const RE_NBSP_LEAD_GROUP = /(\xA0+)[^\xA0]+/g;
const RE_NBSP_TRAILING_GROUP = /[^\xA0]+(\xA0+)/g;
const RE_NBSP_TRAILING_STRIP = /[^\xA0]+$/;
const RE_CONDITIONAL_COMMENT = /^\[if\s[^\]]+]|\[endif]$/;
const RE_EVENT_ATTR_DEFAULT = /^on[a-z]{3,}$/;
const RE_CAN_REMOVE_ATTR_QUOTES = /^[^ \t\n\f\r"'`=<>]+$/;
const RE_TRAILING_SEMICOLON = /;$/;
const RE_AMP_ENTITY = /&(#?[0-9a-zA-Z]+;)/g;

// Tiny stable stringify for options signatures (sorted keys, shallow, nested objects)
function stableStringify(obj) {
  if (obj == null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  let out = '{';
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    out += JSON.stringify(k) + ':' + stableStringify(obj[k]) + (i < keys.length - 1 ? ',' : '');
  }
  return out + '}';
}

// Minimal LRU cache for strings and promises
class LRU {
  constructor(limit = 200) {
    this.limit = limit;
    this.map = new Map();
  }
  get(key) {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
  }
  delete(key) { this.map.delete(key); }
}

// Per-process caches
const jsMinifyCache = new LRU(200);
const cssMinifyCache = new LRU(200);

const trimWhitespace = str => {
  if (!str) return str;
  // Fast path: if no whitespace at start or end, return early
  if (!/^[ \n\r\t\f]/.test(str) && !/[ \n\r\t\f]$/.test(str)) {
    return str;
  }
  return str.replace(RE_WS_START, '').replace(RE_WS_END, '');
};

function collapseWhitespaceAll(str) {
  if (!str) return str;
  // Fast path: if there are no common whitespace characters, return early
  if (!/[ \n\r\t\f\xA0]/.test(str)) {
    return str;
  }
  // Non-breaking space is specifically handled inside the replacer function here:
  return str.replace(RE_ALL_WS_NBSP, function (spaces) {
    return spaces === '\t' ? '\t' : spaces.replace(RE_NBSP_LEADING_GROUP, '$1 ');
  });
}

function collapseWhitespace(str, options, trimLeft, trimRight, collapseAll) {
  let lineBreakBefore = ''; let lineBreakAfter = '';

  if (!str) return str;

  if (options.preserveLineBreaks) {
    str = str.replace(/^[ \n\r\t\f]*?[\n\r][ \n\r\t\f]*/, function () {
      lineBreakBefore = '\n';
      return '';
    }).replace(/[ \n\r\t\f]*?[\n\r][ \n\r\t\f]*$/, function () {
      lineBreakAfter = '\n';
      return '';
    });
  }

  if (trimLeft) {
    // Non-breaking space is specifically handled inside the replacer function here:
    str = str.replace(/^[ \n\r\t\f\xA0]+/, function (spaces) {
      const conservative = !lineBreakBefore && options.conservativeCollapse;
      if (conservative && spaces === '\t') {
        return '\t';
      }
      return spaces.replace(/^[^\xA0]+/, '').replace(RE_NBSP_LEAD_GROUP, '$1 ') || (conservative ? ' ' : '');
    });
  }

  if (trimRight) {
    // Non-breaking space is specifically handled inside the replacer function here:
    str = str.replace(/[ \n\r\t\f\xA0]+$/, function (spaces) {
      const conservative = !lineBreakAfter && options.conservativeCollapse;
      if (conservative && spaces === '\t') {
        return '\t';
      }
      return spaces.replace(RE_NBSP_TRAILING_GROUP, ' $1').replace(RE_NBSP_TRAILING_STRIP, '') || (conservative ? ' ' : '');
    });
  }

  if (collapseAll) {
    // Strip non-space whitespace then compress spaces to one
    str = collapseWhitespaceAll(str);
  }

  return lineBreakBefore + str + lineBreakAfter;
}

// Non-empty elements that will maintain whitespace around them
const inlineElementsToKeepWhitespaceAround = new Set(['a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'button', 'cite', 'code', 'del', 'dfn', 'em', 'font', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'mark', 'math', 'meter', 'nobr', 'object', 'output', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'select', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'svg', 'textarea', 'time', 'tt', 'u', 'var', 'wbr']);
// Non-empty elements that will maintain whitespace within them
const inlineElementsToKeepWhitespaceWithin = new Set(['a', 'abbr', 'acronym', 'b', 'big', 'del', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'nobr', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var']);
// Elements that will always maintain whitespace around them
const inlineElementsToKeepWhitespace = new Set(['comment', 'img', 'input', 'wbr']);

function collapseWhitespaceSmart(str, prevTag, nextTag, options, inlineElements, inlineTextSet) {
  let trimLeft = prevTag && !inlineElementsToKeepWhitespace.has(prevTag);
  if (trimLeft && !options.collapseInlineTagWhitespace) {
    trimLeft = prevTag.charAt(0) === '/' ? !inlineElements.has(prevTag.slice(1)) : !inlineTextSet.has(prevTag);
  }
  let trimRight = nextTag && !inlineElementsToKeepWhitespace.has(nextTag);
  if (trimRight && !options.collapseInlineTagWhitespace) {
    trimRight = nextTag.charAt(0) === '/' ? !inlineTextSet.has(nextTag.slice(1)) : !inlineElements.has(nextTag);
  }
  return collapseWhitespace(str, options, trimLeft, trimRight, prevTag && nextTag);
}

function isConditionalComment(text) {
  return RE_CONDITIONAL_COMMENT.test(text);
}

function isIgnoredComment(text, options) {
  for (let i = 0, len = options.ignoreCustomComments.length; i < len; i++) {
    if (options.ignoreCustomComments[i].test(text)) {
      return true;
    }
  }
  return false;
}

function isEventAttribute(attrName, options) {
  const patterns = options.customEventAttributes;
  if (patterns) {
    for (let i = patterns.length; i--;) {
      if (patterns[i].test(attrName)) {
        return true;
      }
    }
    return false;
  }
  return RE_EVENT_ATTR_DEFAULT.test(attrName);
}

function canRemoveAttributeQuotes(value) {
  // https://mathiasbynens.be/notes/unquoted-attribute-values
  return RE_CAN_REMOVE_ATTR_QUOTES.test(value);
}

function attributesInclude(attributes, attribute) {
  for (let i = attributes.length; i--;) {
    if (attributes[i].name.toLowerCase() === attribute) {
      return true;
    }
  }
  return false;
}

// Default attribute values (could apply to any element)
const generalDefaults = {
  autocorrect: 'on',
  fetchpriority: 'auto',
  loading: 'eager',
  popovertargetaction: 'toggle'
};

// Tag-specific default attribute values
const tagDefaults = {
  area: { shape: 'rect' },
  button: { type: 'submit' },
  form: {
    enctype: 'application/x-www-form-urlencoded',
    method: 'get'
  },
  html: { dir: 'ltr' },
  img: { decoding: 'auto' },
  input: {
    colorspace: 'limited-srgb',
    type: 'text'
  },
  marquee: {
    behavior: 'scroll',
    direction: 'left'
  },
  style: { media: 'all' },
  textarea: { wrap: 'soft' },
  track: { kind: 'subtitles' }
};

function isAttributeRedundant(tag, attrName, attrValue, attrs) {
  attrValue = attrValue ? trimWhitespace(attrValue.toLowerCase()) : '';

  // Legacy attributes
  if (tag === 'script' && attrName === 'language' && attrValue === 'javascript') {
    return true;
  }
  if (tag === 'script' && attrName === 'charset' && !attributesInclude(attrs, 'src')) {
    return true;
  }
  if (tag === 'a' && attrName === 'name' && attributesInclude(attrs, 'id')) {
    return true;
  }

  // Check general defaults
  if (generalDefaults[attrName] === attrValue) {
    return true;
  }

  // Check tag-specific defaults
  return tagDefaults[tag]?.[attrName] === attrValue;
}

// https://mathiasbynens.be/demo/javascript-mime-type
// https://developer.mozilla.org/en/docs/Web/HTML/Element/script#attr-type
const executableScriptsMimetypes = new Set([
  'text/javascript',
  'text/ecmascript',
  'text/jscript',
  'application/javascript',
  'application/x-javascript',
  'application/ecmascript',
  'module'
]);

const keepScriptsMimetypes = new Set([
  'module'
]);

function isScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0]).toLowerCase();
  return attrValue === '' || executableScriptsMimetypes.has(attrValue);
}

function keepScriptTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue.split(/;/, 2)[0]).toLowerCase();
  return keepScriptsMimetypes.has(attrValue);
}

function isExecutableScript(tag, attrs) {
  if (tag !== 'script') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      return isScriptTypeAttribute(attrs[i].value);
    }
  }
  return true;
}

function isStyleLinkTypeAttribute(attrValue = '') {
  attrValue = trimWhitespace(attrValue).toLowerCase();
  return attrValue === '' || attrValue === 'text/css';
}

function isStyleSheet(tag, attrs) {
  if (tag !== 'style') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      return isStyleLinkTypeAttribute(attrs[i].value);
    }
  }
  return true;
}

const isSimpleBoolean = new Set(['allowfullscreen', 'async', 'autofocus', 'autoplay', 'checked', 'compact', 'controls', 'declare', 'default', 'defaultchecked', 'defaultmuted', 'defaultselected', 'defer', 'disabled', 'enabled', 'formnovalidate', 'hidden', 'indeterminate', 'inert', 'ismap', 'itemscope', 'loop', 'multiple', 'muted', 'nohref', 'noresize', 'noshade', 'novalidate', 'nowrap', 'open', 'pauseonexit', 'readonly', 'required', 'reversed', 'scoped', 'seamless', 'selected', 'sortable', 'truespeed', 'typemustmatch', 'visible']);
const isBooleanValue = new Set(['true', 'false']);

function isBooleanAttribute(attrName, attrValue) {
  return isSimpleBoolean.has(attrName) || (attrName === 'draggable' && !isBooleanValue.has(attrValue));
}

function isUriTypeAttribute(attrName, tag) {
  return (
    (/^(?:a|area|link|base)$/.test(tag) && attrName === 'href') ||
    (tag === 'img' && /^(?:src|longdesc|usemap)$/.test(attrName)) ||
    (tag === 'object' && /^(?:classid|codebase|data|usemap)$/.test(attrName)) ||
    (tag === 'q' && attrName === 'cite') ||
    (tag === 'blockquote' && attrName === 'cite') ||
    ((tag === 'ins' || tag === 'del') && attrName === 'cite') ||
    (tag === 'form' && attrName === 'action') ||
    (tag === 'input' && (attrName === 'src' || attrName === 'usemap')) ||
    (tag === 'head' && attrName === 'profile') ||
    (tag === 'script' && (attrName === 'src' || attrName === 'for'))
  );
}

function isNumberTypeAttribute(attrName, tag) {
  return (
    (/^(?:a|area|object|button)$/.test(tag) && attrName === 'tabindex') ||
    (tag === 'input' && (attrName === 'maxlength' || attrName === 'tabindex')) ||
    (tag === 'select' && (attrName === 'size' || attrName === 'tabindex')) ||
    (tag === 'textarea' && /^(?:rows|cols|tabindex)$/.test(attrName)) ||
    (tag === 'colgroup' && attrName === 'span') ||
    (tag === 'col' && attrName === 'span') ||
    ((tag === 'th' || tag === 'td') && (attrName === 'rowspan' || attrName === 'colspan'))
  );
}

function isLinkType(tag, attrs, value) {
  if (tag !== 'link') return false;
  const needle = String(value).toLowerCase();
  for (let i = 0; i < attrs.length; i++) {
    if (attrs[i].name.toLowerCase() === 'rel') {
      const tokens = String(attrs[i].value).toLowerCase().split(/\s+/);
      if (tokens.includes(needle)) return true;
    }
  }
  return false;
}

function isMediaQuery(tag, attrs, attrName) {
  return attrName === 'media' && (isLinkType(tag, attrs, 'stylesheet') || isStyleSheet(tag, attrs));
}

const srcsetTags = new Set(['img', 'source']);

function isSrcset(attrName, tag) {
  return attrName === 'srcset' && srcsetTags.has(tag);
}

async function cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTMLSelf) {
  if (isEventAttribute(attrName, options)) {
    attrValue = trimWhitespace(attrValue).replace(/^javascript:\s*/i, '');
    return options.minifyJS(attrValue, true);
  } else if (attrName === 'class') {
    attrValue = trimWhitespace(attrValue);
    if (options.sortClassName) {
      attrValue = options.sortClassName(attrValue);
    } else {
      attrValue = collapseWhitespaceAll(attrValue);
    }
    return attrValue;
  } else if (isUriTypeAttribute(attrName, tag)) {
    attrValue = trimWhitespace(attrValue);
    if (isLinkType(tag, attrs, 'canonical')) {
      return attrValue;
    }
    try {
      const out = await options.minifyURLs(attrValue);
      return typeof out === 'string' ? out : attrValue;
    } catch (err) {
      if (!options.continueOnMinifyError) {
        throw err;
      }
      options.log && options.log(err);
      return attrValue;
    }
  } else if (isNumberTypeAttribute(attrName, tag)) {
    return trimWhitespace(attrValue);
  } else if (attrName === 'style') {
    attrValue = trimWhitespace(attrValue);
    if (attrValue) {
      if (attrValue.endsWith(';') && !/&#?[0-9a-zA-Z]+;$/.test(attrValue)) {
        attrValue = attrValue.replace(/\s*;$/, ';');
      }
      attrValue = await options.minifyCSS(attrValue, 'inline');
    }
    return attrValue;
  } else if (isSrcset(attrName, tag)) {
    // https://html.spec.whatwg.org/multipage/embedded-content.html#attr-img-srcset
    attrValue = (await Promise.all(trimWhitespace(attrValue).split(/\s+,\s*|\s*,\s+/).map(async function (candidate) {
      let url = candidate;
      let descriptor = '';
      const match = candidate.match(/\s+([1-9][0-9]*w|[0-9]+(?:\.[0-9]+)?x)$/);
      if (match) {
        url = url.slice(0, -match[0].length);
        const num = +match[1].slice(0, -1);
        const suffix = match[1].slice(-1);
        if (num !== 1 || suffix !== 'x') {
          descriptor = ' ' + num + suffix;
        }
      }
      try {
        const out = await options.minifyURLs(url);
        return (typeof out === 'string' ? out : url) + descriptor;
      } catch (err) {
        if (!options.continueOnMinifyError) {
          throw err;
        }
        options.log && options.log(err);
        return url + descriptor;
      }
    }))).join(', ');
  } else if (isMetaViewport(tag, attrs) && attrName === 'content') {
    attrValue = attrValue.replace(/\s+/g, '').replace(/[0-9]+\.[0-9]+/g, function (numString) {
      // “0.90000” → “0.9”
      // “1.0” → “1”
      // “1.0001” → “1.0001” (unchanged)
      return (+numString).toString();
    });
  } else if (isContentSecurityPolicy(tag, attrs) && attrName.toLowerCase() === 'content') {
    return collapseWhitespaceAll(attrValue);
  } else if (options.customAttrCollapse && options.customAttrCollapse.test(attrName)) {
    attrValue = trimWhitespace(attrValue.replace(/ ?[\n\r]+ ?/g, '').replace(/\s{2,}/g, options.conservativeCollapse ? ' ' : ''));
  } else if (tag === 'script' && attrName === 'type') {
    attrValue = trimWhitespace(attrValue.replace(/\s*;\s*/g, ';'));
  } else if (isMediaQuery(tag, attrs, attrName)) {
    attrValue = trimWhitespace(attrValue);
    return options.minifyCSS(attrValue, 'media');
  } else if (tag === 'iframe' && attrName === 'srcdoc') {
    // Recursively minify HTML content within srcdoc attribute
    // Fast-path: skip if nothing would change
    if (!shouldMinifyInnerHTML(options)) {
      return attrValue;
    }
    return minifyHTMLSelf(attrValue, options, true);
  }
  return attrValue;
}

function isMetaViewport(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i].name === 'name' && attrs[i].value === 'viewport') {
      return true;
    }
  }
}

function isContentSecurityPolicy(tag, attrs) {
  if (tag !== 'meta') {
    return false;
  }
  for (let i = 0, len = attrs.length; i < len; i++) {
    if (attrs[i].name.toLowerCase() === 'http-equiv' && attrs[i].value.toLowerCase() === 'content-security-policy') {
      return true;
    }
  }
}

// Wrap CSS declarations for inline styles and media queries
// This ensures proper context for CSS minification
function wrapCSS(text, type) {
  switch (type) {
    case 'inline':
      return '*{' + text + '}';
    case 'media':
      return '@media ' + text + '{a{top:0}}';
    default:
      return text;
  }
}

function unwrapCSS(text, type) {
  let matches;
  switch (type) {
    case 'inline':
      matches = text.match(/^\*\{([\s\S]*)\}$/);
      break;
    case 'media':
      matches = text.match(/^@media ([\s\S]*?)\s*{[\s\S]*}$/);
      break;
  }
  return matches ? matches[1] : text;
}

async function cleanConditionalComment(comment, options) {
  return options.processConditionalComments
    ? await replaceAsync(comment, /^(\[if\s[^\]]+]>)([\s\S]*?)(<!\[endif])$/, async function (match, prefix, text, suffix) {
      return prefix + await minifyHTML(text, options, true) + suffix;
    })
    : comment;
}

const jsonScriptTypes = new Set([
  'application/json',
  'application/ld+json',
  'application/manifest+json',
  'application/vnd.geo+json',
  'importmap',
  'speculationrules',
]);

function minifyJson(text, options) {
  try {
    return JSON.stringify(JSON.parse(text));
  }
  catch (err) {
    if (!options.continueOnMinifyError) {
      throw err;
    }
    options.log && options.log(err);
    return text;
  }
}

function hasJsonScriptType(attrs) {
  for (let i = 0, len = attrs.length; i < len; i++) {
    const attrName = attrs[i].name.toLowerCase();
    if (attrName === 'type') {
      const attrValue = trimWhitespace((attrs[i].value || '').split(/;/, 2)[0]).toLowerCase();
      if (jsonScriptTypes.has(attrValue)) {
        return true;
      }
    }
  }
  return false;
}

async function processScript(text, options, currentAttrs) {
  for (let i = 0, len = currentAttrs.length; i < len; i++) {
    const attrName = currentAttrs[i].name.toLowerCase();
    if (attrName === 'type') {
      const rawValue = currentAttrs[i].value;
      const normalizedValue = trimWhitespace((rawValue || '').split(/;/, 2)[0]).toLowerCase();
      // Minify JSON script types automatically
      if (jsonScriptTypes.has(normalizedValue)) {
        return minifyJson(text, options);
      }
      // Process custom script types if specified
      if (options.processScripts && options.processScripts.indexOf(rawValue) > -1) {
        return await minifyHTML(text, options);
      }
    }
  }
  return text;
}

// Tag omission rules from https://html.spec.whatwg.org/multipage/syntax.html#optional-tags with the following extensions:
// - retain `<body>` if followed by `<noscript>`
// - `<rb>`, `<rt>`, `<rtc>`, `<rp>` follow HTML Ruby Markup Extensions draft (https://www.w3.org/TR/html-ruby-extensions/)
// - retain all tags which are adjacent to non-standard HTML tags
const optionalStartTags = new Set(['html', 'head', 'body', 'colgroup', 'tbody']);
const optionalEndTags = new Set(['html', 'head', 'body', 'li', 'dt', 'dd', 'p', 'rb', 'rt', 'rtc', 'rp', 'optgroup', 'option', 'colgroup', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
const headerTags = new Set(['meta', 'link', 'script', 'style', 'template', 'noscript']);
const descriptionTags = new Set(['dt', 'dd']);
const pBlockTags = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'dialog', 'div', 'dl', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol', 'p', 'pre', 'search', 'section', 'table', 'ul']);
const pInlineTags = new Set(['a', 'audio', 'del', 'ins', 'map', 'noscript', 'video']);
const rubyEndTagOmission = new Set(['rb', 'rt', 'rtc', 'rp']); // `</rb>`, `</rt>`, `</rp>` can be omitted if followed by `<rb>`, `<rt>`, `<rtc>`, or `<rp>`
const rubyRtcEndTagOmission = new Set(['rb', 'rtc']); // `</rtc>` can be omitted if followed by `<rb>` or `<rtc>` (not `<rt>` or `<rp>`)
const optionTag = new Set(['option', 'optgroup']);
const tableContentTags = new Set(['tbody', 'tfoot']);
const tableSectionTags = new Set(['thead', 'tbody', 'tfoot']);
const cellTags = new Set(['td', 'th']);
const topLevelTags = new Set(['html', 'head', 'body']);
const compactTags = new Set(['html', 'body']);
const looseTags = new Set(['head', 'colgroup', 'caption']);
const trailingTags = new Set(['dt', 'thead']);
const htmlTags = new Set(['a', 'abbr', 'acronym', 'address', 'applet', 'area', 'article', 'aside', 'audio', 'b', 'base', 'basefont', 'bdi', 'bdo', 'bgsound', 'big', 'blink', 'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'command', 'content', 'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'dir', 'div', 'dl', 'dt', 'element', 'em', 'embed', 'fieldset', 'figcaption', 'figure', 'font', 'footer', 'form', 'frame', 'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'image', 'img', 'input', 'ins', 'isindex', 'kbd', 'keygen', 'label', 'legend', 'li', 'link', 'listing', 'main', 'map', 'mark', 'marquee', 'menu', 'menuitem', 'meta', 'meter', 'multicol', 'nav', 'nobr', 'noembed', 'noframes', 'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'plaintext', 'pre', 'progress', 'q', 'rb', 'rp', 'rt', 'rtc', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select', 'selectedcontent', 'shadow', 'small', 'source', 'spacer', 'span', 'strike', 'strong', 'style', 'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'tt', 'u', 'ul', 'var', 'video', 'wbr', 'xmp']);

function canRemoveParentTag(optionalStartTag, tag) {
  switch (optionalStartTag) {
    case 'html':
    case 'head':
      return true;
    case 'body':
      return !headerTags.has(tag);
    case 'colgroup':
      return tag === 'col';
    case 'tbody':
      return tag === 'tr';
  }
  return false;
}

function isStartTagMandatory(optionalEndTag, tag) {
  switch (tag) {
    case 'colgroup':
      return optionalEndTag === 'colgroup';
    case 'tbody':
      return tableSectionTags.has(optionalEndTag);
  }
  return false;
}

function canRemovePrecedingTag(optionalEndTag, tag) {
  switch (optionalEndTag) {
    case 'html':
    case 'head':
    case 'body':
    case 'colgroup':
    case 'caption':
      return true;
    case 'li':
    case 'optgroup':
    case 'tr':
      return tag === optionalEndTag;
    case 'dt':
    case 'dd':
      return descriptionTags.has(tag);
    case 'p':
      return pBlockTags.has(tag);
    case 'rb':
    case 'rt':
    case 'rp':
      return rubyEndTagOmission.has(tag);
    case 'rtc':
      return rubyRtcEndTagOmission.has(tag);
    case 'option':
      return optionTag.has(tag);
    case 'thead':
    case 'tbody':
      return tableContentTags.has(tag);
    case 'tfoot':
      return tag === 'tbody';
    case 'td':
    case 'th':
      return cellTags.has(tag);
  }
  return false;
}

const reEmptyAttribute = new RegExp(
  '^(?:class|id|style|title|lang|dir|on(?:focus|blur|change|click|dblclick|mouse(' +
  '?:down|up|over|move|out)|key(?:press|down|up)))$');

function canDeleteEmptyAttribute(tag, attrName, attrValue, options) {
  const isValueEmpty = !attrValue || /^\s*$/.test(attrValue);
  if (!isValueEmpty) {
    return false;
  }
  if (typeof options.removeEmptyAttributes === 'function') {
    return options.removeEmptyAttributes(attrName, tag);
  }
  return (tag === 'input' && attrName === 'value') || reEmptyAttribute.test(attrName);
}

function hasAttrName(name, attrs) {
  for (let i = attrs.length - 1; i >= 0; i--) {
    if (attrs[i].name === name) {
      return true;
    }
  }
  return false;
}

function canRemoveElement(tag, attrs) {
  switch (tag) {
    case 'textarea':
      return false;
    case 'audio':
    case 'script':
    case 'video':
      if (hasAttrName('src', attrs)) {
        return false;
      }
      break;
    case 'iframe':
      if (hasAttrName('src', attrs) || hasAttrName('srcdoc', attrs)) {
        return false;
      }
      break;
    case 'object':
      if (hasAttrName('data', attrs)) {
        return false;
      }
      break;
    case 'applet':
      if (hasAttrName('code', attrs)) {
        return false;
      }
      break;
  }
  return true;
}

/**
 * @param {string} str - Tag name or HTML-like element spec (e.g., “td” or “<span aria-hidden='true'>”)
 * @param {MinifierOptions} options - Options object for name normalization
 * @returns {{tag: string, attrs: Object.<string, string|undefined>|null}|null} Parsed spec or null if invalid
 */
function parseElementSpec(str, options) {
  if (typeof str !== 'string') {
    return null;
  }

  const trimmed = str.trim();
  if (!trimmed) {
    return null;
  }

  // Simple tag name: “td”
  if (!/[<>]/.test(trimmed)) {
    return { tag: options.name(trimmed), attrs: null };
  }

  // HTML-like markup: “<span aria-hidden='true'>” or “<td></td>”
  // Extract opening tag using regex
  const match = trimmed.match(/^<([a-zA-Z][\w:-]*)((?:\s+[^>]*)?)>/);
  if (!match) {
    return null;
  }

  const tag = options.name(match[1]);
  const attrString = match[2];

  if (!attrString.trim()) {
    return { tag, attrs: null };
  }

  // Parse attributes from string
  const attrs = {};
  const attrRegex = /([a-zA-Z][\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>/]+)))?/g;
  let attrMatch;

  while ((attrMatch = attrRegex.exec(attrString))) {
    const attrName = options.name(attrMatch[1]);
    const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4];
    // Boolean attributes have no value (undefined)
    attrs[attrName] = attrValue;
  }

  return {
    tag,
    attrs: Object.keys(attrs).length > 0 ? attrs : null
  };
}

/**
 * @param {string[]} input - Array of element specifications from `removeEmptyElementsExcept` option
 * @param {MinifierOptions} options - Options object for parsing
 * @returns {Array<{tag: string, attrs: Object.<string, string|undefined>|null}>} Array of parsed element specs
 */
function parseRemoveEmptyElementsExcept(input, options) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map(item => {
    if (typeof item === 'string') {
      const spec = parseElementSpec(item, options);
      if (!spec && options.log) {
        options.log('Warning: Unable to parse “removeEmptyElementsExcept” specification: "' + item + '"');
      }
      return spec;
    }
    if (options.log) {
      options.log('Warning: “removeEmptyElementsExcept” specification must be a string, received: ' + typeof item);
    }
    return null;
  }).filter(Boolean);
}

/**
 * @param {string} tag - Element tag name
 * @param {HTMLAttribute[]} attrs - Array of element attributes
 * @param {Array<{tag: string, attrs: Object.<string, string|undefined>|null}>} preserveList - Parsed preserve specs
 * @returns {boolean} True if the empty element should be preserved
 */
function shouldPreserveEmptyElement(tag, attrs, preserveList) {
  for (const spec of preserveList) {
    // Tag name must match
    if (spec.tag !== tag) {
      continue;
    }

    // If no attributes specified in spec, tag match is enough
    if (!spec.attrs) {
      return true;
    }

    // Check if all specified attributes match
    const allAttrsMatch = Object.entries(spec.attrs).every(([name, value]) => {
      const attr = attrs.find(a => a.name === name);
      if (!attr) {
        return false; // Attribute not present
      }
      // Boolean attribute in spec (undefined value) matches if attribute is present
      if (value === undefined) {
        return true;
      }
      // Valued attribute must match exactly
      return attr.value === value;
    });

    if (allAttrsMatch) {
      return true;
    }
  }

  return false;
}

function canCollapseWhitespace(tag) {
  return !/^(?:script|style|pre|textarea)$/.test(tag);
}

function canTrimWhitespace(tag) {
  return !/^(?:pre|textarea)$/.test(tag);
}

async function normalizeAttr(attr, attrs, tag, options) {
  const attrName = options.name(attr.name);
  let attrValue = attr.value;

  if (options.decodeEntities && attrValue) {
    // Fast path: only decode when entities are present
    if (attrValue.indexOf('&') !== -1) {
      attrValue = decodeHTMLStrict(attrValue);
    }
  }

  if ((options.removeRedundantAttributes &&
    isAttributeRedundant(tag, attrName, attrValue, attrs)) ||
    (options.removeScriptTypeAttributes && tag === 'script' &&
      attrName === 'type' && isScriptTypeAttribute(attrValue) && !keepScriptTypeAttribute(attrValue)) ||
    (options.removeStyleLinkTypeAttributes && (tag === 'style' || tag === 'link') &&
      attrName === 'type' && isStyleLinkTypeAttribute(attrValue))) {
    return;
  }

  if (attrValue) {
    attrValue = await cleanAttributeValue(tag, attrName, attrValue, options, attrs, minifyHTML);
  }

  if (options.removeEmptyAttributes &&
    canDeleteEmptyAttribute(tag, attrName, attrValue, options)) {
    return;
  }

  if (options.decodeEntities && attrValue && attrValue.indexOf('&') !== -1) {
    attrValue = attrValue.replace(RE_AMP_ENTITY, '&amp;$1');
  }

  return {
    attr,
    name: attrName,
    value: attrValue
  };
}

function buildAttr(normalized, hasUnarySlash, options, isLast, uidAttr) {
  const attrName = normalized.name;
  let attrValue = normalized.value;
  const attr = normalized.attr;
  let attrQuote = attr.quote;
  let attrFragment;
  let emittedAttrValue;

  if (typeof attrValue !== 'undefined' && (!options.removeAttributeQuotes ||
    ~attrValue.indexOf(uidAttr) || !canRemoveAttributeQuotes(attrValue))) {
    if (!options.preventAttributesEscaping) {
      if (typeof options.quoteCharacter === 'undefined') {
        // Count quotes in a single pass instead of two regex operations
        let apos = 0, quot = 0;
        for (let i = 0; i < attrValue.length; i++) {
          if (attrValue[i] === "'") apos++;
          else if (attrValue[i] === '"') quot++;
        }
        attrQuote = apos < quot ? '\'' : '"';
      } else {
        attrQuote = options.quoteCharacter === '\'' ? '\'' : '"';
      }
      if (attrQuote === '"') {
        attrValue = attrValue.replace(/"/g, '&#34;');
      } else {
        attrValue = attrValue.replace(/'/g, '&#39;');
      }
    }
    emittedAttrValue = attrQuote + attrValue + attrQuote;
    if (!isLast && !options.removeTagWhitespace) {
      emittedAttrValue += ' ';
    }
  } else if (isLast && !hasUnarySlash) {
    // Last attribute in a non-self-closing tag: no space needed
    emittedAttrValue = attrValue;
  } else {
    // Not last attribute, or is a self-closing tag: add space
    emittedAttrValue = attrValue + ' ';
  }

  if (typeof attrValue === 'undefined' || (options.collapseBooleanAttributes &&
    isBooleanAttribute(attrName.toLowerCase(), attrValue.toLowerCase()))) {
    attrFragment = attrName;
    if (!isLast) {
      attrFragment += ' ';
    }
  } else {
    attrFragment = attrName + attr.customAssign + emittedAttrValue;
  }

  return attr.customOpen + attrFragment + attr.customClose;
}

function identity(value) {
  return value;
}

function identityAsync(value) {
  return Promise.resolve(value);
}

function shouldMinifyInnerHTML(options) {
  return Boolean(
    options.collapseWhitespace ||
    options.removeComments ||
    options.removeOptionalTags ||
    options.minifyJS !== identity ||
    options.minifyCSS !== identityAsync ||
    options.minifyURLs !== identity
  );
}

/**
 * @param {Partial<MinifierOptions>} inputOptions - User-provided options
 * @returns {MinifierOptions} Normalized options with defaults applied
 */
const processOptions = (inputOptions) => {
  const options = {
    name: function (name) {
      return name.toLowerCase();
    },
    canCollapseWhitespace,
    canTrimWhitespace,
    continueOnMinifyError: true,
    html5: true,
    ignoreCustomComments: [
      /^!/,
      /^\s*#/
    ],
    ignoreCustomFragments: [
      /<%[\s\S]*?%>/,
      /<\?[\s\S]*?\?>/
    ],
    includeAutoGeneratedTags: true,
    log: identity,
    minifyCSS: identityAsync,
    minifyJS: identity,
    minifyURLs: identity
  };

  Object.keys(inputOptions).forEach(function (key) {
    const option = inputOptions[key];

    if (key === 'caseSensitive') {
      if (option) {
        options.name = identity;
      }
    } else if (key === 'log') {
      if (typeof option === 'function') {
        options.log = option;
      }
    } else if (key === 'minifyCSS' && typeof option !== 'function') {
      if (!option) {
        return;
      }

      const lightningCssOptions = typeof option === 'object' ? option : {};

      options.minifyCSS = async function (text, type) {
        // Fast path: nothing to minify
        if (!text || !text.trim()) {
          return text;
        }
        text = await replaceAsync(
          text,
          /(url\s*\(\s*)(?:"([^"]*)"|'([^']*)'|([^\s)]+))(\s*\))/ig,
          async function (match, prefix, dq, sq, unq, suffix) {
            const quote = dq != null ? '"' : (sq != null ? "'" : '');
            const url = dq ?? sq ?? unq ?? '';
            try {
              const out = await options.minifyURLs(url);
              return prefix + quote + (typeof out === 'string' ? out : url) + quote + suffix;
            } catch (err) {
              if (!options.continueOnMinifyError) {
                throw err;
              }
              options.log && options.log(err);
              return match;
            }
          }
        );
        // Cache key: wrapped content, type, options signature
        const inputCSS = wrapCSS(text, type);
        const cssSig = stableStringify({ type, opts: lightningCssOptions, cont: !!options.continueOnMinifyError });
        // For large inputs, use length and content fingerprint (first/last 50 chars) to prevent collisions
        const cssKey = inputCSS.length > 2048
          ? (inputCSS.length + '|' + inputCSS.slice(0, 50) + inputCSS.slice(-50) + '|' + type + '|' + cssSig)
          : (inputCSS + '|' + type + '|' + cssSig);

        try {
          const cached = cssMinifyCache.get(cssKey);
          if (cached) {
            return cached;
          }

          const transformCSS = await getLightningCSS();
          const result = transformCSS({
            filename: 'input.css',
            code: Buffer.from(inputCSS),
            minify: true,
            errorRecovery: !!options.continueOnMinifyError,
            ...lightningCssOptions
          });

          const outputCSS = unwrapCSS(result.code.toString(), type);

          // If Lightning CSS removed significant content that looks like template syntax or UIDs, return original
          // This preserves:
          // 1. Template code like `<?php ?>`, `<%= %>`, `{{ }}`, etc. (contain `<` or `>` but not `CDATA`)
          // 2. UIDs representing custom fragments (only lowercase letters and digits, no spaces)
          // CDATA sections, HTML entities, and other invalid CSS are allowed to be removed
          const isCDATA = text.includes('<![CDATA[');
          const uidPattern = /[a-z0-9]{10,}/; // UIDs are long alphanumeric strings
          const hasUID = uidPattern.test(text) && !isCDATA; // Exclude CDATA from UID detection
          const looksLikeTemplate = (text.includes('<') || text.includes('>')) && !isCDATA;

          // Preserve if output is empty and input had template syntax or UIDs
          // This catches cases where Lightning CSS removed content that should be preserved
          const finalOutput = (text.trim() && !outputCSS.trim() && (looksLikeTemplate || hasUID)) ? text : outputCSS;

          cssMinifyCache.set(cssKey, finalOutput);
          return finalOutput;
        } catch (err) {
          cssMinifyCache.delete(cssKey);
          if (!options.continueOnMinifyError) {
            throw err;
          }
          options.log && options.log(err);
          return text;
        }
      };
    } else if (key === 'minifyJS' && typeof option !== 'function') {
      if (!option) {
        return;
      }

      const terserOptions = typeof option === 'object' ? option : {};

      terserOptions.parse = {
        ...terserOptions.parse,
        bare_returns: false
      };

      options.minifyJS = async function (text, inline) {
        const start = text.match(/^\s*<!--.*/);
        const code = start ? text.slice(start[0].length).replace(/\n\s*-->\s*$/, '') : text;

        terserOptions.parse.bare_returns = inline;

        let jsKey;
        try {
          // Fast path: avoid invoking Terser for empty/whitespace-only content
          if (!code || !code.trim()) {
            return '';
          }
          // Cache key: content, inline, options signature (subset)
          const terserSig = stableStringify({
            compress: terserOptions.compress,
            mangle: terserOptions.mangle,
            ecma: terserOptions.ecma,
            toplevel: terserOptions.toplevel,
            module: terserOptions.module,
            keep_fnames: terserOptions.keep_fnames,
            format: terserOptions.format,
            cont: !!options.continueOnMinifyError,
          });
          // For large inputs, use length and content fingerprint (first/last 50 chars) to prevent collisions
          jsKey = (code.length > 2048 ? (code.length + '|' + code.slice(0, 50) + code.slice(-50) + '|') : (code + '|')) + (inline ? '1' : '0') + '|' + terserSig;
          const cached = jsMinifyCache.get(jsKey);
          if (cached) {
            return await cached;
          }
          const inFlight = (async () => {
            const terser = await getTerser();
            const result = await terser(code, terserOptions);
            return result.code.replace(RE_TRAILING_SEMICOLON, '');
          })();
          jsMinifyCache.set(jsKey, inFlight);
          const resolved = await inFlight;
          jsMinifyCache.set(jsKey, resolved);
          return resolved;
        } catch (err) {
          if (jsKey) jsMinifyCache.delete(jsKey);
          if (!options.continueOnMinifyError) {
            throw err;
          }
          options.log && options.log(err);
          return text;
        }
      };
    } else if (key === 'minifyURLs' && typeof option !== 'function') {
      if (!option) {
        return;
      }

      let relateUrlOptions = option;

      if (typeof option === 'string') {
        relateUrlOptions = { site: option };
      } else if (typeof option !== 'object') {
        relateUrlOptions = {};
      }

      options.minifyURLs = function (text) {
        try {
          return RelateURL.relate(text, relateUrlOptions);
        } catch (err) {
          if (!options.continueOnMinifyError) {
            throw err;
          }
          options.log && options.log(err);
          return text;
        }
      };
    } else {
      options[key] = option;
    }
  });
  return options;
};

function uniqueId(value) {
  let id;
  do {
    id = Math.random().toString(36).replace(/^0\.[0-9]*/, '');
  } while (~value.indexOf(id));
  return id;
}

const specialContentTags = new Set(['script', 'style']);

async function createSortFns(value, options, uidIgnore, uidAttr) {
  const attrChains = options.sortAttributes && Object.create(null);
  const classChain = options.sortClassName && new TokenChain();

  function attrNames(attrs) {
    return attrs.map(function (attr) {
      return options.name(attr.name);
    });
  }

  function shouldSkipUID(token, uid) {
    return !uid || token.indexOf(uid) === -1;
  }

  function shouldSkipUIDs(token) {
    return shouldSkipUID(token, uidIgnore) && shouldSkipUID(token, uidAttr);
  }

  async function scan(input) {
    let currentTag, currentType;
    const parser = new HTMLParser(input, {
      start: function (tag, attrs) {
        if (attrChains) {
          if (!attrChains[tag]) {
            attrChains[tag] = new TokenChain();
          }
          attrChains[tag].add(attrNames(attrs).filter(shouldSkipUIDs));
        }
        for (let i = 0, len = attrs.length; i < len; i++) {
          const attr = attrs[i];
          if (classChain && attr.value && options.name(attr.name) === 'class') {
            classChain.add(trimWhitespace(attr.value).split(/[ \t\n\f\r]+/).filter(shouldSkipUIDs));
          } else if (options.processScripts && attr.name.toLowerCase() === 'type') {
            currentTag = tag;
            currentType = attr.value;
          }
        }
      },
      end: function () {
        currentTag = '';
      },
      chars: async function (text) {
        // Only recursively scan HTML content, not JSON-LD or other non-HTML script types
        // `scan()` is for analyzing HTML attribute order, not for parsing JSON
        if (options.processScripts && specialContentTags.has(currentTag) &&
          options.processScripts.indexOf(currentType) > -1 &&
          currentType === 'text/html') {
          await scan(text);
        }
      }
    });

    await parser.parse();
  }

  const log = options.log;
  options.log = identity;
  options.sortAttributes = false;
  options.sortClassName = false;
  const firstPassOutput = await minifyHTML(value, options);
  await scan(firstPassOutput);
  options.log = log;
  if (attrChains) {
    const attrSorters = Object.create(null);
    for (const tag in attrChains) {
      attrSorters[tag] = attrChains[tag].createSorter();
    }
    options.sortAttributes = function (tag, attrs) {
      const sorter = attrSorters[tag];
      if (sorter) {
        const attrMap = Object.create(null);
        const names = attrNames(attrs);
        names.forEach(function (name, index) {
          (attrMap[name] || (attrMap[name] = [])).push(attrs[index]);
        });
        sorter.sort(names).forEach(function (name, index) {
          attrs[index] = attrMap[name].shift();
        });
      }
    };
  }
  if (classChain) {
    const sorter = classChain.createSorter();
    options.sortClassName = function (value) {
      return sorter.sort(value.split(/[ \n\f\r]+/)).join(' ');
    };
  }
}

/**
 * @param {string} value - HTML content to minify
 * @param {MinifierOptions} options - Normalized minification options
 * @param {boolean} [partialMarkup] - Whether treating input as partial markup
 * @returns {Promise<string>} Minified HTML
 */
async function minifyHTML(value, options, partialMarkup) {
  // Check input length limitation to prevent ReDoS attacks
  if (options.maxInputLength && value.length > options.maxInputLength) {
    throw new Error(`Input length (${value.length}) exceeds maximum allowed length (${options.maxInputLength})`);
  }

  if (options.collapseWhitespace) {
    value = collapseWhitespace(value, options, true, true);
  }

  const buffer = [];
  let charsPrevTag;
  let currentChars = '';
  let hasChars;
  let currentTag = '';
  let currentAttrs = [];
  const stackNoTrimWhitespace = [];
  const stackNoCollapseWhitespace = [];
  let optionalStartTag = '';
  let optionalEndTag = '';
  const ignoredMarkupChunks = [];
  const ignoredCustomMarkupChunks = [];
  let uidIgnore;
  let uidIgnorePlaceholderPattern;
  let uidAttr;
  let uidPattern;
  // Create inline tags/text sets with custom elements
  const customElementsInput = options.inlineCustomElements ?? [];
  const customElementsArr = Array.isArray(customElementsInput) ? customElementsInput : Array.from(customElementsInput);
  const normalizedCustomElements = customElementsArr.map(name => options.name(name));
  // Fast path: reuse base Sets if no custom elements
  const inlineTextSet = normalizedCustomElements.length
    ? new Set([...inlineElementsToKeepWhitespaceWithin, ...normalizedCustomElements])
    : inlineElementsToKeepWhitespaceWithin;
  const inlineElements = normalizedCustomElements.length
    ? new Set([...inlineElementsToKeepWhitespaceAround, ...normalizedCustomElements])
    : inlineElementsToKeepWhitespaceAround;

  // Parse `removeEmptyElementsExcept` option
  let removeEmptyElementsExcept;
  if (options.removeEmptyElementsExcept && !Array.isArray(options.removeEmptyElementsExcept)) {
    if (options.log) {
      options.log('Warning: “removeEmptyElementsExcept” option must be an array, received: ' + typeof options.removeEmptyElementsExcept);
    }
    removeEmptyElementsExcept = [];
  } else {
    removeEmptyElementsExcept = parseRemoveEmptyElementsExcept(options.removeEmptyElementsExcept, options) || [];
  }

  // Temporarily replace ignored chunks with comments,
  // so that we don’t have to worry what’s there.
  // For all we care there might be
  // completely-horribly-broken-alien-non-html-emoj-cthulhu-filled content
  value = value.replace(/<!-- htmlmin:ignore -->([\s\S]*?)<!-- htmlmin:ignore -->/g, function (match, group1) {
    if (!uidIgnore) {
      uidIgnore = uniqueId(value);
      const pattern = new RegExp('^' + uidIgnore + '([0-9]+)$');
      uidIgnorePlaceholderPattern = new RegExp('^<!--' + uidIgnore + '(\\d+)-->$');
      if (options.ignoreCustomComments) {
        options.ignoreCustomComments = options.ignoreCustomComments.slice();
      } else {
        options.ignoreCustomComments = [];
      }
      options.ignoreCustomComments.push(pattern);
    }
    const token = '<!--' + uidIgnore + ignoredMarkupChunks.length + '-->';
    ignoredMarkupChunks.push(group1);
    return token;
  });

  const customFragments = options.ignoreCustomFragments.map(function (re) {
    return re.source;
  });
  if (customFragments.length) {
    // Warn about potential ReDoS if custom fragments use unlimited quantifiers
    for (let i = 0; i < customFragments.length; i++) {
      if (/[*+]/.test(customFragments[i])) {
        options.log('Warning: Custom fragment contains unlimited quantifiers (“*” or “+”) which may cause ReDoS vulnerability');
        break;
      }
    }

    // Safe approach: Use bounded quantifiers instead of unlimited ones to prevent ReDoS
    const maxQuantifier = options.customFragmentQuantifierLimit || 200;
    const whitespacePattern = `\\s{0,${maxQuantifier}}`;

    // Use bounded quantifiers to prevent ReDoS—this approach prevents exponential backtracking
    const reCustomIgnore = new RegExp(
      whitespacePattern + '(?:' + customFragments.join('|') + '){1,' + maxQuantifier + '}' + whitespacePattern,
      'g'
    );
    // Temporarily replace custom ignored fragments with unique attributes
    value = value.replace(reCustomIgnore, function (match) {
      if (!uidAttr) {
        uidAttr = uniqueId(value);
        uidPattern = new RegExp('(\\s*)' + uidAttr + '([0-9]+)' + uidAttr + '(\\s*)', 'g');

        if (options.minifyCSS) {
          options.minifyCSS = (function (fn) {
            return function (text, type) {
              text = text.replace(uidPattern, function (match, prefix, index) {
                const chunks = ignoredCustomMarkupChunks[+index];
                return chunks[1] + uidAttr + index + uidAttr + chunks[2];
              });

              return fn(text, type);
            };
          })(options.minifyCSS);
        }

        if (options.minifyJS) {
          options.minifyJS = (function (fn) {
            return function (text, type) {
              return fn(text.replace(uidPattern, function (match, prefix, index) {
                const chunks = ignoredCustomMarkupChunks[+index];
                return chunks[1] + uidAttr + index + uidAttr + chunks[2];
              }), type);
            };
          })(options.minifyJS);
        }
      }

      const token = uidAttr + ignoredCustomMarkupChunks.length + uidAttr;
      ignoredCustomMarkupChunks.push(/^(\s*)[\s\S]*?(\s*)$/.exec(match));
      return '\t' + token + '\t';
    });
  }

  if ((options.sortAttributes && typeof options.sortAttributes !== 'function') ||
    (options.sortClassName && typeof options.sortClassName !== 'function')) {
    await createSortFns(value, options, uidIgnore, uidAttr);
  }

  function _canCollapseWhitespace(tag, attrs) {
    return options.canCollapseWhitespace(tag, attrs, canCollapseWhitespace);
  }

  function _canTrimWhitespace(tag, attrs) {
    return options.canTrimWhitespace(tag, attrs, canTrimWhitespace);
  }

  function removeStartTag() {
    let index = buffer.length - 1;
    while (index > 0 && !/^<[^/!]/.test(buffer[index])) {
      index--;
    }
    buffer.length = Math.max(0, index);
  }

  function removeEndTag() {
    let index = buffer.length - 1;
    while (index > 0 && !/^<\//.test(buffer[index])) {
      index--;
    }
    buffer.length = Math.max(0, index);
  }

  // Look for trailing whitespaces, bypass any inline tags
  function trimTrailingWhitespace(index, nextTag) {
    for (let endTag = null; index >= 0 && _canTrimWhitespace(endTag); index--) {
      const str = buffer[index];
      const match = str.match(/^<\/([\w:-]+)>$/);
      if (match) {
        endTag = match[1];
      } else if (/>$/.test(str) || (buffer[index] = collapseWhitespaceSmart(str, null, nextTag, options, inlineElements, inlineTextSet))) {
        break;
      }
    }
  }

  // Look for trailing whitespaces from previously processed text
  // which may not be trimmed due to a following comment or an empty
  // element which has now been removed
  function squashTrailingWhitespace(nextTag) {
    let charsIndex = buffer.length - 1;
    if (buffer.length > 1) {
      const item = buffer[buffer.length - 1];
      if (/^(?:<!|$)/.test(item) && item.indexOf(uidIgnore) === -1) {
        charsIndex--;
      }
    }
    trimTrailingWhitespace(charsIndex, nextTag);
  }

  const parser = new HTMLParser(value, {
    partialMarkup: partialMarkup ?? options.partialMarkup,
    continueOnParseError: options.continueOnParseError,
    customAttrAssign: options.customAttrAssign,
    customAttrSurround: options.customAttrSurround,
    html5: options.html5,

    start: async function (tag, attrs, unary, unarySlash, autoGenerated) {
      if (tag.toLowerCase() === 'svg') {
        options = Object.create(options);
        options.caseSensitive = true;
        options.keepClosingSlash = true;
        options.name = identity;
      }
      tag = options.name(tag);
      currentTag = tag;
      charsPrevTag = tag;
      if (!inlineTextSet.has(tag)) {
        currentChars = '';
      }
      hasChars = false;
      currentAttrs = attrs;

      let optional = options.removeOptionalTags;
      if (optional) {
        const htmlTag = htmlTags.has(tag);
        // `<html>` may be omitted if first thing inside is not a comment
        // `<head>` may be omitted if first thing inside is an element
        // `<body>` may be omitted if first thing inside is not space, comment, `<meta>`, `<link>`, `<script>`, <`style>`, or `<template>`
        // `<colgroup>` may be omitted if first thing inside is `<col>`
        // `<tbody>` may be omitted if first thing inside is `<tr>`
        if (htmlTag && canRemoveParentTag(optionalStartTag, tag)) {
          removeStartTag();
        }
        optionalStartTag = '';
        // End-tag-followed-by-start-tag omission rules
        if (htmlTag && canRemovePrecedingTag(optionalEndTag, tag)) {
          removeEndTag();
          // `<colgroup>` cannot be omitted if preceding `</colgroup>` is omitted
          // `<tbody>` cannot be omitted if preceding `</tbody>`, `</thead>`, or `</tfoot>` is omitted
          optional = !isStartTagMandatory(optionalEndTag, tag);
        }
        optionalEndTag = '';
      }

      // Set whitespace flags for nested tags (e.g., <code> within a <pre>)
      if (options.collapseWhitespace) {
        if (!stackNoTrimWhitespace.length) {
          squashTrailingWhitespace(tag);
        }
        if (!unary) {
          if (!_canTrimWhitespace(tag, attrs) || stackNoTrimWhitespace.length) {
            stackNoTrimWhitespace.push(tag);
          }
          if (!_canCollapseWhitespace(tag, attrs) || stackNoCollapseWhitespace.length) {
            stackNoCollapseWhitespace.push(tag);
          }
        }
      }

      const openTag = '<' + tag;
      const hasUnarySlash = unarySlash && options.keepClosingSlash;

      buffer.push(openTag);

      if (options.sortAttributes) {
        options.sortAttributes(tag, attrs);
      }

      const parts = [];
      for (let i = attrs.length, isLast = true; --i >= 0;) {
        const normalized = await normalizeAttr(attrs[i], attrs, tag, options);
        if (normalized) {
          parts.push(buildAttr(normalized, hasUnarySlash, options, isLast, uidAttr));
          isLast = false;
        }
      }
      parts.reverse();
      if (parts.length > 0) {
        buffer.push(' ');
        buffer.push.apply(buffer, parts);
      } else if (optional && optionalStartTags.has(tag)) {
        // Start tag must never be omitted if it has any attributes
        optionalStartTag = tag;
      }

      buffer.push(buffer.pop() + (hasUnarySlash ? '/' : '') + '>');

      if (autoGenerated && !options.includeAutoGeneratedTags) {
        removeStartTag();
        optionalStartTag = '';
      }
    },
    end: function (tag, attrs, autoGenerated) {
      if (tag.toLowerCase() === 'svg') {
        options = Object.getPrototypeOf(options);
      }
      tag = options.name(tag);

      // Check if current tag is in a whitespace stack
      if (options.collapseWhitespace) {
        if (stackNoTrimWhitespace.length) {
          if (tag === stackNoTrimWhitespace[stackNoTrimWhitespace.length - 1]) {
            stackNoTrimWhitespace.pop();
          }
        } else {
          squashTrailingWhitespace('/' + tag);
        }
        if (stackNoCollapseWhitespace.length &&
          tag === stackNoCollapseWhitespace[stackNoCollapseWhitespace.length - 1]) {
          stackNoCollapseWhitespace.pop();
        }
      }

      let isElementEmpty = false;
      if (tag === currentTag) {
        currentTag = '';
        isElementEmpty = !hasChars;
      }

      if (options.removeOptionalTags) {
        // `<html>`, `<head>` or `<body>` may be omitted if the element is empty
        if (isElementEmpty && topLevelTags.has(optionalStartTag)) {
          removeStartTag();
        }
        optionalStartTag = '';
        // `</html>` or `</body>` may be omitted if not followed by comment
        // `</head>` may be omitted if not followed by space or comment
        // `</p>` may be omitted if no more content in non-`</a>` parent
        // except for `</dt>` or `</thead>`, end tags may be omitted if no more content in parent element
        if (htmlTags.has(tag) && optionalEndTag && !trailingTags.has(optionalEndTag) && (optionalEndTag !== 'p' || !pInlineTags.has(tag))) {
          removeEndTag();
        }
        optionalEndTag = optionalEndTags.has(tag) ? tag : '';
      }

      if (options.removeEmptyElements && isElementEmpty && canRemoveElement(tag, attrs)) {
        let preserve = false;
        if (removeEmptyElementsExcept.length) {
          // Normalize attribute names for comparison with specs
          const normalizedAttrs = attrs.map(attr => ({ ...attr, name: options.name(attr.name) }));
          preserve = shouldPreserveEmptyElement(tag, normalizedAttrs, removeEmptyElementsExcept);
        }

        if (!preserve) {
          // Remove last “element” from buffer
          removeStartTag();
          optionalStartTag = '';
          optionalEndTag = '';
        } else {
          // Preserve the element—add closing tag
          if (autoGenerated && !options.includeAutoGeneratedTags) {
            optionalEndTag = '';
          } else {
            buffer.push('</' + tag + '>');
          }
          charsPrevTag = '/' + tag;
          if (!inlineElements.has(tag)) {
            currentChars = '';
          } else if (isElementEmpty) {
            currentChars += '|';
          }
        }
      } else {
        if (autoGenerated && !options.includeAutoGeneratedTags) {
          optionalEndTag = '';
        } else {
          buffer.push('</' + tag + '>');
        }
        charsPrevTag = '/' + tag;
        if (!inlineElements.has(tag)) {
          currentChars = '';
        } else if (isElementEmpty) {
          currentChars += '|';
        }
      }
    },
    chars: async function (text, prevTag, nextTag) {
      prevTag = prevTag === '' ? 'comment' : prevTag;
      nextTag = nextTag === '' ? 'comment' : nextTag;
      if (options.decodeEntities && text && !specialContentTags.has(currentTag)) {
        if (text.indexOf('&') !== -1) {
          text = decodeHTML(text);
        }
      }
      if (options.collapseWhitespace) {
        if (!stackNoTrimWhitespace.length) {
          if (prevTag === 'comment') {
            const prevComment = buffer[buffer.length - 1];
            if (prevComment.indexOf(uidIgnore) === -1) {
              if (!prevComment) {
                prevTag = charsPrevTag;
              }
              if (buffer.length > 1 && (!prevComment || (!options.conservativeCollapse && / $/.test(currentChars)))) {
                const charsIndex = buffer.length - 2;
                buffer[charsIndex] = buffer[charsIndex].replace(/\s+$/, function (trailingSpaces) {
                  text = trailingSpaces + text;
                  return '';
                });
              }
            }
          }
          if (prevTag) {
            if (prevTag === '/nobr' || prevTag === 'wbr') {
              if (/^\s/.test(text)) {
                let tagIndex = buffer.length - 1;
                while (tagIndex > 0 && buffer[tagIndex].lastIndexOf('<' + prevTag) !== 0) {
                  tagIndex--;
                }
                trimTrailingWhitespace(tagIndex - 1, 'br');
              }
            } else if (inlineTextSet.has(prevTag.charAt(0) === '/' ? prevTag.slice(1) : prevTag)) {
              text = collapseWhitespace(text, options, /(?:^|\s)$/.test(currentChars));
            }
          }
          if (prevTag || nextTag) {
            text = collapseWhitespaceSmart(text, prevTag, nextTag, options, inlineElements, inlineTextSet);
          } else {
            text = collapseWhitespace(text, options, true, true);
          }
          if (!text && /\s$/.test(currentChars) && prevTag && prevTag.charAt(0) === '/') {
            trimTrailingWhitespace(buffer.length - 1, nextTag);
          }
        }
        if (!stackNoCollapseWhitespace.length && nextTag !== 'html' && !(prevTag && nextTag)) {
          text = collapseWhitespace(text, options, false, false, true);
        }
      }
      if (specialContentTags.has(currentTag) && (options.processScripts || hasJsonScriptType(currentAttrs))) {
        text = await processScript(text, options, currentAttrs);
      }
      if (isExecutableScript(currentTag, currentAttrs)) {
        text = await options.minifyJS(text);
      }
      if (isStyleSheet(currentTag, currentAttrs)) {
        text = await options.minifyCSS(text);
      }
      if (options.removeOptionalTags && text) {
        // `<html>` may be omitted if first thing inside is not a comment
        // `<body>` may be omitted if first thing inside is not space, comment, `<meta>`, `<link>`, `<script>`, `<style>`, or `<template>`
        if (optionalStartTag === 'html' || (optionalStartTag === 'body' && !/^\s/.test(text))) {
          removeStartTag();
        }
        optionalStartTag = '';
        // `</html>` or `</body>` may be omitted if not followed by comment
        // `</head>`, `</colgroup>`, or `</caption>` may be omitted if not followed by space or comment
        if (compactTags.has(optionalEndTag) || (looseTags.has(optionalEndTag) && !/^\s/.test(text))) {
          removeEndTag();
        }
        // Don’t reset optionalEndTag if text is only whitespace and will be collapsed (not conservatively)
        if (!/^\s+$/.test(text) || !options.collapseWhitespace || options.conservativeCollapse) {
          optionalEndTag = '';
        }
      }
      charsPrevTag = /^\s*$/.test(text) ? prevTag : 'comment';
      if (options.decodeEntities && text && !specialContentTags.has(currentTag)) {
        // Escape any `&` symbols that start either:
        // 1) a legacy named character reference (i.e., one that doesn’t end with `;`)
        // 2) or any other character reference (i.e., one that does end with `;`)
        // Note that `&` can be escaped as `&amp`, without the semi-colon.
        // https://mathiasbynens.be/notes/ambiguous-ampersands
        if (text.indexOf('&') !== -1) {
          text = text.replace(/&((?:Iacute|aacute|uacute|plusmn|Otilde|otilde|agrave|Agrave|Yacute|yacute|Oslash|oslash|atilde|Atilde|brvbar|ccedil|Ccedil|Ograve|curren|divide|eacute|Eacute|ograve|Oacute|egrave|Egrave|Ugrave|frac12|frac14|frac34|ugrave|oacute|iacute|Ntilde|ntilde|Uacute|middot|igrave|Igrave|iquest|Aacute|cedil|laquo|micro|iexcl|Icirc|icirc|acirc|Ucirc|Ecirc|ocirc|Ocirc|ecirc|ucirc|Aring|aring|AElig|aelig|acute|pound|raquo|Acirc|times|THORN|szlig|thorn|COPY|auml|ordf|ordm|Uuml|macr|uuml|Auml|ouml|Ouml|para|nbsp|euml|quot|QUOT|Euml|yuml|cent|sect|copy|sup1|sup2|sup3|iuml|Iuml|ETH|shy|reg|not|yen|amp|AMP|REG|uml|eth|deg|gt|GT|LT|lt)(?!;)|(?:#?[0-9a-zA-Z]+;))/g, '&amp$1');
        }
        if (text.indexOf('<') !== -1) {
          text = text.replace(/</g, '&lt;');
        }
      }
      if (uidPattern && options.collapseWhitespace && stackNoTrimWhitespace.length) {
        text = text.replace(uidPattern, function (match, prefix, index) {
          return ignoredCustomMarkupChunks[+index][0];
        });
      }
      currentChars += text;
      if (text) {
        hasChars = true;
      }
      buffer.push(text);
    },
    comment: async function (text, nonStandard) {
      const prefix = nonStandard ? '<!' : '<!--';
      const suffix = nonStandard ? '>' : '-->';
      if (isConditionalComment(text)) {
        text = prefix + await cleanConditionalComment(text, options) + suffix;
      } else if (options.removeComments) {
        if (isIgnoredComment(text, options)) {
          text = '<!--' + text + '-->';
        } else {
          text = '';
        }
      } else {
        text = prefix + text + suffix;
      }
      if (options.removeOptionalTags && text) {
        // Preceding comments suppress tag omissions
        optionalStartTag = '';
        optionalEndTag = '';
      }

      // Optimize whitespace collapsing between consecutive `htmlmin:ignore` placeholder comments
      if (options.collapseWhitespace && text && uidIgnorePlaceholderPattern) {
        if (uidIgnorePlaceholderPattern.test(text)) {
          // Check if previous buffer items are: [ignore-placeholder, whitespace-only text]
          if (buffer.length >= 2) {
            const prevText = buffer[buffer.length - 1];
            const prevComment = buffer[buffer.length - 2];

            // Check if previous item is whitespace-only and item before that is ignore-placeholder
            if (prevText && /^\s+$/.test(prevText) &&
                prevComment && uidIgnorePlaceholderPattern.test(prevComment)) {
              // Extract the index from both placeholders to check their content
              const currentMatch = text.match(uidIgnorePlaceholderPattern);
              const prevMatch = prevComment.match(uidIgnorePlaceholderPattern);

              if (currentMatch && prevMatch) {
                const currentIndex = +currentMatch[1];
                const prevIndex = +prevMatch[1];

                // Defensive bounds check to ensure indices are valid
                if (currentIndex < ignoredMarkupChunks.length && prevIndex < ignoredMarkupChunks.length) {
                  const currentContent = ignoredMarkupChunks[currentIndex];
                  const prevContent = ignoredMarkupChunks[prevIndex];

                  // Only collapse whitespace if both blocks contain HTML (start with `<`)
                  // Don’t collapse if either contains plain text, as that would change meaning
                  // Note: This check will match HTML comments (`<!-- … -->`), but the tag-name
                  // regex below requires starting with a letter, so comments are intentionally
                  // excluded by the `currentTagMatch && prevTagMatch` guard
                  if (currentContent && prevContent && /^\s*</.test(currentContent) && /^\s*</.test(prevContent)) {
                    // Extract tag names from the HTML content (excludes comments, processing instructions, etc.)
                    const currentTagMatch = currentContent.match(/^\s*<([a-zA-Z][\w:-]*)/);
                    const prevTagMatch = prevContent.match(/^\s*<([a-zA-Z][\w:-]*)/);

                    // Only collapse if both matched valid element tags (not comments/text)
                    // and both tags are block-level (inline elements need whitespace preserved)
                    if (currentTagMatch && prevTagMatch) {
                      const currentTag = options.name(currentTagMatch[1]);
                      const prevTag = options.name(prevTagMatch[1]);

                      // Don’t collapse between inline elements
                      if (!inlineElements.has(currentTag) && !inlineElements.has(prevTag)) {
                        // Collapse whitespace respecting context rules
                        let collapsedText = prevText;

                        // Apply `collapseWhitespace` with appropriate context
                        if (!stackNoTrimWhitespace.length && !stackNoCollapseWhitespace.length) {
                          // Not in pre or other no-collapse context
                          if (options.preserveLineBreaks && /[\n\r]/.test(prevText)) {
                            // Preserve line break as single newline
                            collapsedText = '\n';
                          } else if (options.conservativeCollapse) {
                            // Conservative mode: keep single space
                            collapsedText = ' ';
                          } else {
                            // Aggressive mode: remove all whitespace
                            collapsedText = '';
                          }
                        }

                        // Replace the whitespace in buffer
                        buffer[buffer.length - 1] = collapsedText;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      buffer.push(text);
    },
    doctype: function (doctype) {
      buffer.push(options.useShortDoctype
        ? '<!doctype' +
        (options.removeTagWhitespace ? '' : ' ') + 'html>'
        : collapseWhitespaceAll(doctype));
    }
  });

  await parser.parse();

  if (options.removeOptionalTags) {
    // `<html>` may be omitted if first thing inside is not a comment
    // `<head>` or `<body>` may be omitted if empty
    if (topLevelTags.has(optionalStartTag)) {
      removeStartTag();
    }
    // except for `</dt>` or `</thead>`, end tags may be omitted if no more content in parent element
    if (optionalEndTag && !trailingTags.has(optionalEndTag)) {
      removeEndTag();
    }
  }
  if (options.collapseWhitespace) {
    squashTrailingWhitespace('br');
  }

  return joinResultSegments(buffer, options, uidPattern
    ? function (str) {
      return str.replace(uidPattern, function (match, prefix, index, suffix) {
        let chunk = ignoredCustomMarkupChunks[+index][0];
        if (options.collapseWhitespace) {
          if (prefix !== '\t') {
            chunk = prefix + chunk;
          }
          if (suffix !== '\t') {
            chunk += suffix;
          }
          return collapseWhitespace(chunk, {
            preserveLineBreaks: options.preserveLineBreaks,
            conservativeCollapse: !options.trimCustomFragments
          }, /^[ \n\r\t\f]/.test(chunk), /[ \n\r\t\f]$/.test(chunk));
        }
        return chunk;
      });
    }
    : identity, uidIgnore
    ? function (str) {
      return str.replace(new RegExp('<!--' + uidIgnore + '([0-9]+)-->', 'g'), function (match, index) {
        return ignoredMarkupChunks[+index];
      });
    }
    : identity);
}

function joinResultSegments(results, options, restoreCustom, restoreIgnore) {
  let str;
  const maxLineLength = options.maxLineLength;
  const noNewlinesBeforeTagClose = options.noNewlinesBeforeTagClose;

  if (maxLineLength) {
    let line = ''; const lines = [];
    while (results.length) {
      const len = line.length;
      const end = results[0].indexOf('\n');
      const isClosingTag = Boolean(results[0].match(endTag));
      const shouldKeepSameLine = noNewlinesBeforeTagClose && isClosingTag;

      if (end < 0) {
        line += restoreIgnore(restoreCustom(results.shift()));
      } else {
        line += restoreIgnore(restoreCustom(results[0].slice(0, end)));
        results[0] = results[0].slice(end + 1);
      }
      if (len > 0 && line.length > maxLineLength && !shouldKeepSameLine) {
        lines.push(line.slice(0, len));
        line = line.slice(len);
      } else if (end >= 0) {
        lines.push(line);
        line = '';
      }
    }
    if (line) {
      lines.push(line);
    }
    str = lines.join('\n');
  } else {
    str = restoreIgnore(restoreCustom(results.join('')));
  }
  return options.collapseWhitespace ? collapseWhitespace(str, options, true, true) : str;
}

/**
 * @param {string} value
 * @param {MinifierOptions} [options]
 * @returns {Promise<string>}
 */
export const minify = async function (value, options) {
  const start = Date.now();
  options = processOptions(options || {});
  const result = await minifyHTML(value, options);
  options.log('minified in: ' + (Date.now() - start) + 'ms');
  return result;
};

export { presets, getPreset, getPresetNames };

export default { minify, presets, getPreset, getPresetNames };