// Imports

import { decodeHTML } from 'entities';
import { HTMLParser, endTag } from './htmlparser.js';
import TokenChain from './tokenchain.js';
import { presets, getPreset, getPresetNames } from './presets.js';

import { LRU, identity, uniqueId } from './lib/utils.js';

import {
  RE_LEGACY_ENTITIES,
  RE_ESCAPE_LT,
  inlineElementsToKeepWhitespaceAround,
  inlineElementsToKeepWhitespaceWithin,
  specialContentTags,
  htmlTags,
  optionalStartTags,
  optionalEndTags,
  topLevelTags,
  compactTags,
  looseTags,
  trailingTags,
  pInlineTags
} from './lib/constants.js';

import {
  trimWhitespace,
  collapseWhitespaceAll,
  collapseWhitespace,
  collapseWhitespaceSmart,
  canCollapseWhitespace,
  canTrimWhitespace
} from './lib/whitespace.js';

import {
  isConditionalComment,
  isIgnoredComment,
  isExecutableScript,
  isStyleSheet,
  normalizeAttr,
  buildAttr
} from './lib/attributes.js';

import {
  canRemoveParentTag,
  isStartTagMandatory,
  canRemovePrecedingTag,
  canRemoveElement,
  parseRemoveEmptyElementsExcept,
  shouldPreserveEmptyElement
} from './lib/elements.js';

import {
  cleanConditionalComment,
  hasJsonScriptType,
  processScript
} from './lib/content.js';

import { processOptions } from './lib/options.js';

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

let swcPromise;
async function getSwc() {
  if (!swcPromise) {
    swcPromise = import('@swc/core')
      .then(m => m.default || m)
      .catch(() => {
        throw new Error(
          'The swc minifier requires @swc/core to be installed.\n' +
          'Install it with: npm install @swc/core'
        );
      });
  }
  return swcPromise;
}

// Minification caches

const cssMinifyCache = new LRU(500);
const jsMinifyCache = new LRU(500);
const urlMinifyCache = new LRU(500);

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
 *  @prop {boolean} [collapseAttributeWhitespace]
 *  Collapse multiple whitespace characters within attribute values into a
 *  single space. Also trims leading and trailing whitespace from attribute
 *  values. Applied as an early normalization step before special attribute
 *  handlers (CSS minification, class sorting, etc.) run.
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
 * @prop {boolean | import("terser").MinifyOptions | {engine?: 'terser' | 'swc', [key: string]: any} | ((text: string, inline?: boolean) => Promise<string> | string)} [minifyJS]
 *  When true, enables JS minification for `<script>` contents and
 *  event handler attributes. If an object is provided, it can include:
 *  - `engine`: The minifier to use (`terser` or `swc`). Default: `terser`.
 *    Note: Inline event handlers (e.g., `onclick="…"`) always use Terser
 *    regardless of engine setting, as swc doesn’t support bare return statements.
 *  - Engine-specific options (e.g., Terser options if `engine: 'terser'`,
 *    SWC options if `engine: 'swc'`).
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
 * @prop {boolean | {precision?: number, removeDefaults?: boolean, minifyColors?: boolean}} [minifySVG]
 *  When true, enables SVG-specific optimizations for SVG elements and attributes.
 *  If an object is provided, it can include:
 *  - `precision`: Number of decimal places for numeric values (coordinates, path data, etc.). Default: `3`
 *  - `removeDefaults`: Remove attributes with default values (e.g., `fill="black"`). Default: `true`
 *  - `minifyColors`: Minify color values (hex shortening, rgb to hex conversion). Default: `true`
 *  If disabled, SVG content is minified using standard HTML rules only.
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

async function createSortFns(value, options, uidIgnore, uidAttr, ignoredMarkupChunks) {
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

  function shouldKeepToken(token) {
    // Filter out any HTML comment tokens (UID placeholders)
    // These are temporary markers created by `htmlmin:ignore` and `ignoreCustomFragments`
    if (token.startsWith('<!--') && token.endsWith('-->')) {
      return false;
    }
    return shouldSkipUID(token, uidIgnore) && shouldSkipUID(token, uidAttr);
  }

  // Pre-compile regex patterns for reuse (performance optimization)
  // These must be declared before scan() since scan uses them
  const whitespaceSplitPatternScan = /[ \t\n\f\r]+/;
  const whitespaceSplitPatternSort = /[ \n\f\r]+/;

  async function scan(input) {
    let currentTag, currentType;
    const parser = new HTMLParser(input, {
      start: function (tag, attrs) {
        if (attrChains) {
          if (!attrChains[tag]) {
            attrChains[tag] = new TokenChain();
          }
          const attrNamesList = attrNames(attrs).filter(shouldKeepToken);
          attrChains[tag].add(attrNamesList);
        }
        for (let i = 0, len = attrs.length; i < len; i++) {
          const attr = attrs[i];
          if (classChain && attr.value && options.name(attr.name) === 'class') {
            const classes = trimWhitespace(attr.value).split(whitespaceSplitPatternScan).filter(shouldKeepToken);
            classChain.add(classes);
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
      },
      // We never need `nextTag` information in this scan
      wantsNextTag: false,
      // Continue on parse errors during analysis pass
      continueOnParseError: options.continueOnParseError
    });

    try {
      await parser.parse();
    } catch (err) {
      // If parsing fails during analysis pass, just skip it—we’ll still have partial frequency data from what we could parse
      if (!options.continueOnParseError) {
        throw err;
      }
    }
  }

  // For the first pass, create a copy of options and disable aggressive minification.
  // Keep attribute transformations (like `removeStyleLinkTypeAttributes`) for accurate analysis.
  // This is safe because `createSortFns` is called before custom fragment UID markers (`uidAttr`) are added.
  // Note: `htmlmin:ignore` UID markers (uidIgnore) already exist and are expanded for analysis.
  const firstPassOptions = Object.assign({}, options, {
    // Disable sorting for the analysis pass
    sortAttributes: false,
    sortClassName: false,
    // Disable aggressive minification that doesn’t affect attribute analysis
    collapseWhitespace: false,
    removeAttributeQuotes: false,
    removeTagWhitespace: false,
    decodeEntities: false,
    processScripts: false,
    // Keep `ignoreCustomFragments` to handle template syntax correctly
    // This is safe because `createSortFns` is now called before UID markers are added
    // Continue on parse errors during analysis (e.g., template syntax)
    continueOnParseError: true,
    log: identity
  });

  // Temporarily enable `continueOnParseError` for the `scan()` function call below.
  // Note: `firstPassOptions` already has `continueOnParseError: true` for the minifyHTML call.
  const originalContinueOnParseError = options.continueOnParseError;
  options.continueOnParseError = true;

  // Pre-compile regex patterns for UID replacement and custom fragments
  const uidReplacePattern = uidIgnore && ignoredMarkupChunks
    ? new RegExp('<!--' + uidIgnore + '(\\d+)-->', 'g')
    : null;
  const customFragmentPattern = options.ignoreCustomFragments && options.ignoreCustomFragments.length > 0
    ? new RegExp('(' + options.ignoreCustomFragments.map(re => re.source).join('|') + ')', 'g')
    : null;

  try {
    // Expand UID tokens back to original content for frequency analysis
    let expandedValue = value;
    if (uidReplacePattern) {
      expandedValue = value.replace(uidReplacePattern, function (match, index) {
        return ignoredMarkupChunks[+index] || '';
      });
      // Reset `lastIndex` for pattern reuse
      uidReplacePattern.lastIndex = 0;
    }

    // First pass minification applies attribute transformations like `removeStyleLinkTypeAttributes` for accurate frequency analysis
    const firstPassOutput = await minifyHTML(expandedValue, firstPassOptions);

    // For frequency analysis, we need to remove custom fragments temporarily
    // because HTML comments in opening tags prevent proper attribute parsing.
    // We remove them with a space to preserve attribute boundaries.
    let scanValue = firstPassOutput;
    if (customFragmentPattern) {
      scanValue = firstPassOutput.replace(customFragmentPattern, ' ');
    }

    await scan(scanValue);
  } finally {
    // Restore original option
    options.continueOnParseError = originalContinueOnParseError;
  }
  if (attrChains) {
    const attrSorters = Object.create(null);
    for (const tag in attrChains) {
      attrSorters[tag] = attrChains[tag].createSorter();
    }
    // Memoize sorted attribute orders—attribute sets often repeat in templates
    const attrOrderCache = new LRU(500);

    options.sortAttributes = function (tag, attrs) {
      const sorter = attrSorters[tag];
      if (sorter) {
        const names = attrNames(attrs);

        // Create order-independent cache key from tag and sorted attribute names
        const cacheKey = tag + ':' + names.slice().sort().join(',');
        let sortedNames = attrOrderCache.get(cacheKey);

        if (sortedNames === undefined) {
          // Only sort if not in cache—need to clone names since sort mutates in place
          sortedNames = sorter.sort(names.slice());
          attrOrderCache.set(cacheKey, sortedNames);
        }

        // Apply the sorted order to attrs
        const attrMap = Object.create(null);
        names.forEach(function (name, index) {
          (attrMap[name] || (attrMap[name] = [])).push(attrs[index]);
        });
        sortedNames.forEach(function (name, index) {
          attrs[index] = attrMap[name].shift();
        });
      }
    };
  }
  if (classChain) {
    const sorter = classChain.createSorter();
    // Memoize `sortClassName` results—class lists often repeat in templates
    const classNameCache = new LRU(500);

    options.sortClassName = function (value) {
      // Fast path: Single class (no spaces) needs no sorting
      if (value.indexOf(' ') === -1) {
        return value;
      }

      // Check cache first
      const cached = classNameCache.get(value);
      if (cached !== undefined) {
        return cached;
      }

      // Expand UID tokens back to original content before sorting
      // Fast path: Skip if no HTML comments (UID markers) present
      let expandedValue = value;
      if (uidReplacePattern && value.indexOf('<!--') !== -1) {
        expandedValue = value.replace(uidReplacePattern, function (match, index) {
          return ignoredMarkupChunks[+index] || '';
        });
        // Reset `lastIndex` for pattern reuse
        uidReplacePattern.lastIndex = 0;
      }
      const classes = expandedValue.split(whitespaceSplitPatternSort).filter(function(cls) {
        return cls !== '';
      });
      const sorted = sorter.sort(classes);
      const result = sorted.join(' ');

      // Cache the result
      classNameCache.set(value, result);
      return result;
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
  // Fast path: Reuse base Sets if no custom elements
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

  // Temporarily replace ignored chunks with comments, so that we don’t have to worry what’s there.
  // For all we care there might be completely-horribly-broken-alien-non-html-emoj-cthulhu-filled content
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

  // Create sort functions after `htmlmin:ignore` processing but before custom fragment UID markers
  // This allows proper frequency analysis with access to ignored content via UID tokens
  if ((options.sortAttributes && typeof options.sortAttributes !== 'function') ||
    (options.sortClassName && typeof options.sortClassName !== 'function')) {
    await createSortFns(value, options, uidIgnore, null, ignoredMarkupChunks);
  }

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
    // Compute `nextTag` only when whitespace collapse features require it
    wantsNextTag: !!(options.collapseWhitespace || options.collapseInlineTagWhitespace || options.conservativeCollapse),

    start: async function (tag, attrs, unary, unarySlash, autoGenerated) {
      const lowerTag = tag.toLowerCase();
      if (lowerTag === 'svg' || lowerTag === 'math') {
        options = Object.create(options);
        options.caseSensitive = true;
        options.keepClosingSlash = true;
        options.name = identity;
        options.insideSVG = lowerTag === 'svg';
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
        const normalized = await normalizeAttr(attrs[i], attrs, tag, options, minifyHTML);
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
      const lowerTag = tag.toLowerCase();
      if (lowerTag === 'svg' || lowerTag === 'math') {
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
        if (tag && optionalEndTag && !trailingTags.has(optionalEndTag) && (optionalEndTag !== 'p' || !pInlineTags.has(tag))) {
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
          // Remove last element from buffer
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
        text = await processScript(text, options, currentAttrs, minifyHTML);
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
          text = text.replace(RE_LEGACY_ENTITIES, '&amp$1');
        }
        if (text.indexOf('<') !== -1) {
          text = text.replace(RE_ESCAPE_LT, '&lt;');
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
        text = prefix + await cleanConditionalComment(text, options, minifyHTML) + suffix;
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
            if (prevText && /^\s+$/.test(prevText) && prevComment && uidIgnorePlaceholderPattern.test(prevComment)) {
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
  options = processOptions(options || {}, {
    getLightningCSS,
    getTerser,
    getSwc,
    cssMinifyCache,
    jsMinifyCache,
    urlMinifyCache
  });
  const result = await minifyHTML(value, options);
  options.log('minified in: ' + (Date.now() - start) + 'ms');
  return result;
};

export { presets, getPreset, getPresetNames };

export default { minify, presets, getPreset, getPresetNames };