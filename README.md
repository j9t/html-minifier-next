# HTML Minifier Next

[![npm version](https://img.shields.io/npm/v/html-minifier-next.svg)](https://www.npmjs.com/package/html-minifier-next) [![Build status](https://github.com/j9t/html-minifier-next/workflows/Tests/badge.svg)](https://github.com/j9t/html-minifier-next/actions) [![Socket](https://badge.socket.dev/npm/package/html-minifier-next)](https://socket.dev/npm/package/html-minifier-next) [![GitHub Sponsors](https://badgen.net/static/Support/Open%20Source/cyan)](https://github.com/j9t/html-minifier-next?sponsor=1)

Your web page optimization precision tool: HTML Minifier Next (HMN) is a **super-configurable, well-tested, JavaScript-based HTML minifier** able to also handle in-document CSS, JavaScript, and SVG minification.

The project was based on [HTML Minifier Terser (HMT)](https://github.com/terser/html-minifier-terser), which in turn had been based on [Juriy “kangax” Zaytsev’s HTML Minifier (HM)](https://github.com/kangax/html-minifier). HMN is **the official successor to HTML Minifier**: It’s maintained, easier to use, offers new features, and has been optimized for speed. Note that HMN is largely compatible with HM and HMT but has evolved—find [migration guidance in the changelog](https://github.com/j9t/html-minifier-next/blob/main/CHANGELOG.md).

## Installation

HTML Minifier Next is ESM-only and requires Node.js ≥22.

For use as a command-line app, use npx:

```shell
npx html-minifier-next --help
```

(For immediate, zero-config use in the current folder: `npx html-minifier-next --zero`)

For programmatic use, install as a development dependency:

```shell
npm i -D html-minifier-next
```

## General usage

### CLI

Use `npx html-minifier-next --help` to check all available options:

| Option | Description | Example |
| --- | --- | --- |
| `--zero`, `-z` | Minify all HTML files in the current folder and its subfolders in place (except node_modules), using comprehensive settings (standalone—flag is ignored when combined with other options) | `npx html-minifier-next --zero` |
| `--input-dir <dir>`, `-I <dir>` | Specify an input directory | `--input-dir=src` |
| `--ignore-dir <patterns>`, `-X <patterns>` | Exclude directories—relative to input directory—from processing (comma-separated, overrides config file setting) | `--ignore-dir=libs`, `--ignore-dir=libs,vendor,node_modules` |
| `--output-dir <dir>`, `-O <dir>` | Specify an output directory | `--output-dir=dist` |
| `--input <file>`, `-i <file>` | Specify input file (alternative to positional argument; pair with `--output` for file output) | `npx html-minifier-next -i input.html -o output.html` |
| `--output <file>`, `-o <file>` | Specify output file (reads from `--input` file argument or STDIN; outputs to STDOUT if not specified) | File to file: `npx html-minifier-next input.html -o output.html`<br>File to file (explicit): `npx html-minifier-next -i input.html -o output.html`<br>Pipe to file: `cat input.html \| npx html-minifier-next -o output.html`<br>File to STDOUT: `npx html-minifier-next input.html` |
| `--file-ext <extensions>`, `-f <extensions>` | Specify file extension(s) to process (comma-separated, overrides config file setting); defaults to `html,htm,shtml,shtm`; use `*` for all files | `--file-ext=html,php`, `--file-ext='*'` |
| `--preset <name>`, `-p <name>` | Use a preset configuration (conservative or comprehensive) | `--preset=conservative` |
| `--config-file <file>`, `-c <file>` | Use a configuration file | `--config-file=html-minifier-next.json` |
| `--verbose`, `-v` | Show detailed processing information (active options, file statistics) | `npx html-minifier-next --input-dir=src --output-dir=dist --verbose --collapse-whitespace` |
| `--dry`, `-d` | Dry run: Process and report statistics without writing output | `npx html-minifier-next input.html --dry --collapse-whitespace` |

### Configuration file

You can use a configuration file to specify options. The file can be either in JSON format or a JavaScript module that exports the configuration object:

**JSON configuration example:**

```json
{
  "collapseWhitespace": true,
  "removeComments": true,
  "fileExt": "html,php",
  "ignoreDir": "libs,vendor"
}
```

For editor support (validation, autocomplete, and inline documentation) in JSON configuration files, reference the [JSON Schema](https://raw.githubusercontent.com/j9t/html-minifier-next/main/html-minifier-next.schema.json) that ships with the package:

```json
{
  "$schema": "https://raw.githubusercontent.com/j9t/html-minifier-next/main/html-minifier-next.schema.json",
  "collapseWhitespace": true,
  "removeComments": true
}
```

(If HMN is installed locally, you can also use the path `./node_modules/html-minifier-next/html-minifier-next.schema.json` instead of the URL.)

**JavaScript module configuration example** (requires `"type": "module"` in the project’s package.json, or use a .mjs extension):

```javascript
export default {
  collapseWhitespace: true,
  removeComments: true,
  fileExt: "html,php",
  ignoreDir: ["libs", "vendor"]
};
```

### Node.js

```javascript
import { minify } from 'html-minifier-next';

const result = await minify('<p title="example" id="moo">foo</p>', {
  removeAttributeQuotes: true,
  removeOptionalTags: true
});
console.log(result); // “<p title=example id=moo>foo”
```

See [the original blog post](https://perfectionkills.com/experimenting-with-html-minifier/) for details of [how it works](https://perfectionkills.com/experimenting-with-html-minifier/#how_it_works), [descriptions of most options](https://perfectionkills.com/experimenting-with-html-minifier/#options), [testing results](https://perfectionkills.com/experimenting-with-html-minifier/#field_testing), and [conclusions](https://perfectionkills.com/experimenting-with-html-minifier/#cost_and_benefits).

## Presets

HTML Minifier Next provides presets for common use cases. Presets are pre-configured option sets that can be used as a starting point:

* `conservative`: Basic minification with whitespace collapsing, comment removal, and removal of select attributes.
* `comprehensive`: More advanced minification for better file size reduction, including relevant conservative options plus attribute quote removal, optional tag removal, and more.

To review the specific options set, [presets.js](https://github.com/j9t/html-minifier-next/blob/main/src/presets.js) lists them in an accessible manner.

**Using presets:**

```shell
# Via CLI flag
npx html-minifier-next --preset conservative input.html

# Via config file
npx html-minifier-next --config-file=html-minifier-next.json input.html
# where html-minifier-next.json contains: { "preset": "conservative" }

# Override preset options
npx html-minifier-next --preset conservative --remove-empty-attributes input.html
```

**Priority order:** Presets are applied first, then config file options, then CLI flags. This allows you to start with a preset and customize as needed.

## Options quick reference

Most of the options are disabled by default. Experiment and find what works best for you and your project.

Options can be used in config files (camelCase) or via CLI flags (kebab-case with `--` prefix). Boolean options generally support both `--option-name` to enable and `--no-option-name` to disable, so you can override a preset or config file from the command line. (Exception: Options whose name already starts with `no-`, such as `noNewlinesBeforeTagClose`, only expose the `--no-…` CLI flag.)

| Option (config/CLI) | Description | Default |
| --- | --- | --- |
| `cacheCSS`<br>`--cache-css` | Set CSS minification cache size; higher values improve performance for batch processing | `500` |
| `cacheJS`<br>`--cache-js` | Set JavaScript minification cache size; higher values improve performance for batch processing | `500` |
| `cacheSVG`<br>`--cache-svg` | Set SVG minification cache size; higher values improve performance for batch processing | `500` |
| `caseSensitive`<br>`--case-sensitive` | Treat attributes in case-sensitive manner (useful for custom HTML elements) | `false` |
| `collapseAttributeWhitespace`<br>`--collapse-attribute-whitespace` | Trim and collapse whitespace characters within attribute values | `false` |
| `collapseBooleanAttributes`<br>`--collapse-boolean-attributes` | [Omit attribute values from boolean attributes](https://perfectionkills.com/experimenting-with-html-minifier/#collapse_boolean_attributes) | `false` |
| `collapseInlineTagWhitespace`<br>`--collapse-inline-tag-whitespace` | Collapse whitespace more aggressively between inline elements—use with `collapseWhitespace: true` | `false` |
| `collapseWhitespace`<br>`--collapse-whitespace` | [Collapse whitespace that contributes to text nodes in a document tree](https://perfectionkills.com/experimenting-with-html-minifier/#collapse_whitespace) | `false` |
| `conservativeCollapse`<br>`--conservative-collapse` | Always collapse to one space (never remove it entirely)—use with `collapseWhitespace: true` | `false` |
| `continueOnMinifyError`<br>`--continue-on-minify-error`<br>`--no-continue-on-minify-error` | Continue on minification errors; when `false`, minification errors throw and abort processing | `true` |
| `continueOnParseError`<br>`--continue-on-parse-error` | [Handle parse errors](https://html.spec.whatwg.org/multipage/parsing.html#parse-errors) instead of aborting | `false` |
| `customAttrAssign`<br>`--custom-attr-assign` | Array of regexes that allow to support custom attribute assign expressions (e.g., `<div flex?="{{mode != cover}}"></div>`) | `[]` |
| `customAttrCollapse`<br>`--custom-attr-collapse` | Regex that specifies custom attribute to strip newlines from (e.g., `/ng-class/`) | `undefined` |
| `customAttrSurround`<br>`--custom-attr-surround` | Array of regexes that allow to support custom attribute surround expressions (e.g., `<input {{#if value}}checked="checked"{{/if}}>`) | `[]` |
| `customEventAttributes`<br>`--custom-event-attributes` | Array of regexes that allow to support custom event attributes for `minifyJS` (e.g., `ng-click`) | `[ /^on[a-z]{3,}$/ ]` |
| `customFragmentQuantifierLimit`<br>`--custom-fragment-quantifier-limit` | Set maximum quantifier limit for custom fragments to prevent ReDoS attacks | `200` |
| `decodeEntities`<br>`--decode-entities` | Use direct Unicode characters whenever possible | `false` |
| `ignoreCustomComments`<br>`--ignore-custom-comments` | Array of regexes that allow to ignore matching comments | `[ /^!/, /^\s*#/ ]` |
| `ignoreCustomFragments`<br>`--ignore-custom-fragments` | Array of regexes that allow to ignore certain fragments, when matched (e.g., `<?php … ?>`, `{{ … }}`, etc.) | `[ /<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/ ]` |
| `includeAutoGeneratedTags`<br>`--include-auto-generated-tags` | Insert elements generated by HTML parser | `false` |
| `inlineCustomElements`<br>`--inline-custom-elements` | Array of names of custom elements which are inline, for whitespace handling | `[]` |
| `keepClosingSlash`<br>`--keep-closing-slash` | Keep the trailing slash on void elements | `false` |
| `maxInputLength`<br>`--max-input-length` | Maximum input length to prevent ReDoS attacks (disabled by default) | `undefined` |
| `maxLineLength`<br>`--max-line-length` | Specify a maximum line length; compressed output will be split by newlines at valid HTML split-points | `undefined` |
| `mergeScripts`<br>`--merge-scripts` | Merge consecutive inline `script` elements into one (only merges compatible scripts with same `type`, matching `async`/`defer`/`nomodule`/`nonce`) | `false` |
| `minifyCSS`<br>`--minify-css` | Minify CSS in `style` elements and attributes (uses [Lightning CSS](https://lightningcss.dev/)) | `false` (could be `true`, `Object`, `Function(text, type)`) |
| `minifyJS`<br>`--minify-js` | Minify JavaScript in `script` elements and event attributes (uses [Terser](https://terser.org/) or [SWC](https://swc.rs/)) | `false` (could be `true`, `Object`, `Function(text, inline)`) |
| `minifySVG`<br>`--minify-svg` | Minify SVG elements (uses [SVGO](https://svgo.dev/)) | `false` (could be `true`, `Object`) |
| `minifyURLs`<br>`--minify-urls` | Minify URLs in various attributes | `false` (could be `true`, `String`, `Object`, `Function(text)`) |
| `noNewlinesBeforeTagClose`<br>`--no-newlines-before-tag-close` | Never add a newline before a tag that closes an element | `false` |
| `partialMarkup`<br>`--partial-markup` | Treat input as a partial HTML fragment, preserving stray end tags (closing tags without opening tags) and preventing auto-closing of unclosed tags at end of input | `false` |
| `preserveLineBreaks`<br>`--preserve-line-breaks` | Always collapse to one line break (never remove it entirely) when whitespace between tags includes a line break—use with `collapseWhitespace: true` | `false` |
| `preventAttributesEscaping`<br>`--prevent-attributes-escaping` | Prevents the escaping of the values of attributes | `false` |
| `processScripts`<br>`--process-scripts` | Array of strings corresponding to types of `script` elements to process through minifier (e.g., `text/ng-template`, `text/x-handlebars-template`, etc.) | `[]` |
| `quoteCharacter`<br>`--quote-character` | Type of quote to use for attribute values (`'` or `"`) | Auto-detected (uses the quote requiring less escaping; defaults to `"` when equal) |
| `removeAttributeQuotes`<br>`--remove-attribute-quotes` | [Remove quotes around attributes when possible](https://perfectionkills.com/experimenting-with-html-minifier/#remove_attribute_quotes) | `false` |
| `removeComments`<br>`--remove-comments` | [Strip HTML comments](https://perfectionkills.com/experimenting-with-html-minifier/#remove_comments) | `false` |
| `removeDefaultTypeAttributes`<br>`--remove-default-type-attributes` | Remove default `type` attributes from `style`/`link` (e.g., `type="text/css"`) and `script` (e.g., `type="text/javascript"`) elements; other `type` attribute values are left intact | `false` |
| `removeEmptyAttributes`<br>`--remove-empty-attributes` | [Remove all attributes with whitespace-only values](https://perfectionkills.com/experimenting-with-html-minifier/#remove_empty_or_blank_attributes) | `false` (could be `true`, `Function(attrName, tag)`) |
| `removeEmptyElements`<br>`--remove-empty-elements` | [Remove all elements with empty contents](https://perfectionkills.com/experimenting-with-html-minifier/#remove_empty_elements) | `false` |
| `removeEmptyElementsExcept`<br>`--remove-empty-elements-except` | Array of elements to preserve when `removeEmptyElements` is enabled; accepts simple tag names (e.g., `["td"]`) or HTML-like markup with attributes (e.g., `["<span aria-hidden='true'>"]`); supports double quotes, single quotes, and unquoted attribute values | `[]` |
| `removeOptionalTags`<br>`--remove-optional-tags` | [Remove optional tags](https://perfectionkills.com/experimenting-with-html-minifier/#remove_optional_tags) | `false` |
| `removeRedundantAttributes`<br>`--remove-redundant-attributes` | [Remove attributes when value matches default](https://meiert.com/blog/optional-html/#toc-attribute-values) | `false` |
| `removeTagWhitespace`<br>`--remove-tag-whitespace` | Remove space between attributes whenever possible; **note that this will result in invalid HTML** | `false` |
| `sortAttributes`<br>`--sort-attributes` | [Sort attributes by frequency](#sorting-attributes-and-style-classes) | `false` |
| `sortClassNames`<br>`--sort-class-names` | [Sort style classes by frequency](#sorting-attributes-and-style-classes) | `false` |
| `trimCustomFragments`<br>`--trim-custom-fragments` | Trim whitespace around custom fragments (`ignoreCustomFragments`) | `false` |
| `useShortDoctype`<br>`--use-short-doctype` | [Replaces the doctype with the short HTML doctype](https://perfectionkills.com/experimenting-with-html-minifier/#use_short_doctype) | `false` |

### API-only options

A few options take functions and are therefore only available programmatically, not via CLI flags or config files:

| Option | Description | Default |
| --- | --- | --- |
| `canCollapseWhitespace` | `Function(tag, attrs, defaultFn)` that determines whether whitespace inside an element can be collapsed—override to protect additional elements, delegating to `defaultFn` for the rest | Built-in handling (protects `pre`, `textarea`, etc.) |
| `canTrimWhitespace` | `Function(tag, attrs, defaultFn)` that determines whether leading and trailing whitespace around an element may be trimmed | Built-in handling |
| `log` | `Function(message)` called with warnings and errors, including minification errors swallowed by `continueOnMinifyError` (e.g., pass `console.error` to surface them) | No-op (errors are silent) |

### Sorting attributes and style classes

Minifier options like `sortAttributes` and `sortClassNames` won’t impact the plain-text size of the output. However, using these options for more consistent ordering improves the compression ratio for Gzip and Brotli used over HTTP.

### CSS minification

When `minifyCSS` is set to `true`, HTML Minifier Next uses [Lightning CSS](https://lightningcss.dev/) to minify CSS in `style` elements and attributes. Lightning CSS provides excellent minification by default.

You can pass Lightning CSS configuration options by providing an object:

```javascript
const result = await minify(html, {
  minifyCSS: {
    targets: {
      // Browser targets for vendor prefix handling
      chrome: 95,
      firefox: 90,
      safari: 14
    },
    unusedSymbols: ['unused-class', 'old-animation']
  }
});
```

Available Lightning CSS options when passed as an object:

* `targets`: Browser targets for vendor prefix optimization (e.g., `{ chrome: 95, firefox: 90 }`).
* `unusedSymbols`: Array of class names, IDs, keyframe names, and CSS variables to remove.
* `errorRecovery`: Boolean to skip invalid rules instead of throwing errors. This is disabled by default in Lightning CSS, but enabled in HMN when the `continueOnMinifyError` option is set to `true` (the default). Explicitly setting `errorRecovery` in `minifyCSS` options will override this automatic behavior.
* `sourceMap`: Boolean to generate source maps.

For advanced usage, you can also pass a function:

```javascript
const result = await minify(html, {
  minifyCSS: function(text, type) {
    // `text`: CSS string to minify
    // `type`: `inline` for style attributes, `media` for media queries, `undefined` for `<style>` elements
    return yourCustomMinifier(text);
  }
});
```

### JavaScript minification

When `minifyJS` is set to `true`, HTML Minifier Next uses [Terser](https://terser.org/) by default to minify JavaScript in `<script>` elements and event attributes.

You can choose between different JS minifiers using the `engine` field:

```javascript
const result = await minify(html, {
  minifyJS: {
    engine: 'swc', // Use SWC for faster minification
    // SWC-specific options here
  }
});
```

**Available engines:**

* `terser` (default): The standard JavaScript minifier with excellent compression
* [`swc`](https://swc.rs/): Rust-based minifier that’s significantly faster than Terser (requires separate installation)

**To use SWC**, install it as a development dependency:

```shell
npm i -D @swc/core
```

**Important:** Inline event handlers (e.g., `onclick="return false"`) always use Terser regardless of the `engine` setting, as SWC doesn’t support bare return statements. This is handled automatically—you don’t need to do anything special.

You can pass engine-specific configuration options:

```javascript
// Using Terser with custom options
const result = await minify(html, {
  minifyJS: {
    compress: {
      drop_console: true  // Remove console.log statements
    }
  }
});

// Using SWC for faster minification
const result = await minify(html, {
  minifyJS: {
    engine: 'swc'
  }
});
```

For advanced usage, you can also pass a function:

```javascript
const result = await minify(html, {
  minifyJS: function(text, inline) {
    // `text`: JavaScript string to minify
    // `inline`: `true` for event handlers (e.g., `onclick`), `false` for `<script>` elements
    return yourCustomMinifier(text);
  }
});
```

### SVG minification

When `minifySVG` is set to `true`, HTML Minifier Next uses [SVGO](https://svgo.dev/) to optimize inline SVG elements. Complete `<svg>` subtrees are extracted and processed as a block, enabling deep structural optimization:

```javascript
const result = await minify(html, {
  minifySVG: true // Enable with SVGO defaults
});
```

You can pass custom SVGO options:

```javascript
const result = await minify(html, {
  minifySVG: {
    plugins: [{
      name: 'preset-default',
      params: {
        overrides: {
          convertShapeToPath: false // Keep original shapes
        }
      }
    }]
  }
});
```

**Important:**

* SVG minification only applies within `<svg>` elements
* Case sensitivity and self-closing slashes are automatically preserved in SVG (regardless of global settings)
* For maximum compression, use `minifySVG` together with `collapseWhitespace` and other options

### CSS, JavaScript, and SVG cache configuration

HTML Minifier Next uses in-memory caches to improve performance when processing multiple files or repeated content. The cache sizes can be configured for optimal performance based on your use case:

```javascript
const result = await minify(html, {
  minifyCSS: true,
  minifyJS: true,
  minifySVG: true,
  // Configure cache sizes (in number of entries)
  cacheCSS: 750,  // CSS cache size, default: 500
  cacheJS: 250,   // JS cache size, default: 500
  cacheSVG: 100   // SVG cache size, default: 500
});
```

**Via CLI flags:**

```shell
npx html-minifier-next --minify-css --cache-css 750 --minify-js --cache-js 250 --minify-svg --cache-svg 100 input.html
```

**Via environment variables:**

```shell
export HMN_CACHE_CSS=750
export HMN_CACHE_JS=250
export HMN_CACHE_SVG=100
npx html-minifier-next --minify-css --minify-js --minify-svg input.html
```

**Configuration file:**

```json
{
  "minifyCSS": true,
  "cacheCSS": 750,
  "minifyJS": true,
  "cacheJS": 250,
  "minifySVG": true,
  "cacheSVG": 100
}
```

**When to adjust cache sizes:**

* Single file processing: Default `500` is sufficient
* Batch processing: Increase to `1000` or higher for better cache hit rates
* Memory-constrained environments: Cache sizes can be lowered, though the savings are usually negligible—entries are typically kilobyte-scale, so even full caches only hold a few megabytes
* Hundreds/thousands of files: Increase to `1000`–`2000` for optimal performance

**Important:**

* Cache locking: Caches are created on the first `minify()` call and persist for the process lifetime. Cache sizes are locked after first initialization—subsequent calls reuse the same caches even if different `cacheCSS`, `cacheJS`, or `cacheSVG` options are provided. The first call’s options determine the cache sizes.
* Zero values: Explicit `0` values are coerced to `1` (minimum functional cache size) to avoid immediate eviction. To keep the cache footprint as small as possible, use a small number like `10` or `50` instead of `0`.

The caches persist across multiple `minify()` calls, making them particularly effective when processing many files in a batch operation.

## Minification comparison

Please see [**the Minifier Benchmarks project**](https://github.com/j9t/minifier-benchmarks) for details on how HTML Minifier Next compares to other minifiers.

## Examples

### CLI

**Sample command line:**

```shell
npx html-minifier-next --collapse-whitespace --remove-comments --minify-js --input-dir=. --output-dir=example

npx html-minifier-next --input-dir=test --preset comprehensive --output-dir example
```

**Process specific files and directories:**

```shell
# Process default extensions (html, htm, shtml, shtm)
npx html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist

# Process only specific extensions
npx html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --file-ext=html,php

# Using configuration file that sets `fileExt` (e.g., `"fileExt": "html,php"`)
npx html-minifier-next --config-file=html-minifier-next.json --input-dir=src --output-dir=dist

# Process all files (explicit wildcard)
npx html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --file-ext='*'
```

**Exclude directories from processing:**

```shell
# Ignore a single directory
npx html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --ignore-dir=libs

# Ignore multiple directories
npx html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --ignore-dir=libs,vendor,node_modules

# Ignore by relative path (only ignores src/static/libs, not other “libs” directories)
npx html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --ignore-dir=static/libs
```

**Dry run mode (preview outcome without writing files):**

```shell
# Preview with output file
npx html-minifier-next input.html -o output.html --dry --collapse-whitespace

# Preview directory processing with statistics per file and total
npx html-minifier-next --input-dir=src --output-dir=dist --dry --collapse-whitespace
# Output: [DRY RUN] Would process directory: src → dist
#   index.html: 1,234 → 892 bytes (-342, 27.7%)
#   about.html: 2,100 → 1,654 bytes (-446, 21.2%)
# ---
# Total: 3,334 → 2,546 bytes (-788, 23.6%)
```

**Verbose mode (show detailed processing information):**

```shell
# Show processing details while minifying
npx html-minifier-next --input-dir=src --output-dir=dist --verbose --collapse-whitespace
# Output: CLI options: collapseWhitespace
#   ✓ src/index.html: 1,234 → 892 bytes (-342, 27.7%)
#   ✓ src/about.html: 2,100 → 1,654 bytes (-446, 21.2%)
# ---
# Total: 3,334 → 2,546 bytes (-788, 23.6%)

# `--dry` automatically enables verbose output
npx html-minifier-next --input-dir=src --output-dir=dist --dry --collapse-whitespace
```

## Special cases

### Ignoring chunks of markup

If you have chunks of markup you would like preserved, you can wrap them with `<!-- htmlmin:ignore -->`.

### Minifying JSON content

JSON script types are minified automatically without configuration, including `application/json`, `application/ld+json`, `application/manifest+json`, `application/vnd.geo+json`, `application/problem+json`, `application/merge-patch+json`, `application/json-patch+json`, `importmap`, and `speculationrules`. Malformed JSON is preserved by default (with `continueOnMinifyError: true`).

Note: The `processScripts` option is only for script types containing HTML templates (e.g., `text/ng-template`, `text/x-handlebars-template`), not for JSON.

### Preserving SVG and MathML elements

SVG and MathML elements are automatically recognized as foreign elements, and when they are minified, both case-sensitivity and self-closing slashes are preserved, regardless of the minification settings used for the rest of the file. This ensures valid output for these namespaced elements.

### Working with invalid or partial markup

By default, HTML Minifier Next parses markup into a complete tree structure, then modifies it (removing anything that was specified for removal, ignoring anything that was specified to be ignored, etc.), then creates markup from that tree and returns it.

_Input markup (e.g., `<p id="">foo`) → Internal representation of markup in a form of tree (e.g., `{ tag: "p", attr: "id", children: ["foo"] }`) → Transformation of internal representation (e.g., removal of `id` attribute) → Output of resulting markup (e.g., `<p>foo</p>`)_

For partial HTML fragments (such as template includes, SSI fragments, or closing tags without opening tags), use the `partialMarkup: true` option. This preserves stray end tags (closing tags without corresponding opening tags) and prevents auto-closing of unclosed tags at the end of input. Note that normal HTML auto-closing rules still apply during parsing—for example, a closing parent tag will still auto-close its unclosed child elements.

To validate complete HTML markup, use [the W3C validator](https://validator.w3.org/) or one of [several validator packages](https://meiert.com/blog/html-validator-packages/).

## Security

### ReDoS protection

This minifier includes protection against regular expression denial of service (ReDoS) attacks:

* Custom fragment quantifier limits: The `customFragmentQuantifierLimit` option (default: 200) prevents exponential backtracking by replacing unlimited quantifiers (`*`, `+`) with bounded ones in regular expressions.

* Input length limits: The `maxInputLength` option allows you to set a maximum input size to prevent processing of excessively large inputs that could cause performance issues.

* Enhanced pattern detection: The minifier detects and warns about various ReDoS-prone patterns including nested quantifiers, alternation with quantifiers, and multiple unlimited quantifiers.

**Important:** When using custom `ignoreCustomFragments`, ensure your regular expressions don’t contain unlimited quantifiers (`*`, `+`) without bounds, as these can lead to ReDoS vulnerabilities.

#### Custom fragment examples

**Safe patterns** (recommended):

```javascript
ignoreCustomFragments: [
  /<%[\s\S]{0,1000}?%>/,         // JSP/ASP with explicit bounds
  /<\?php[\s\S]{0,5000}?\?>/,    // PHP with bounds
  /\{\{[^}]{0,500}\}\}/          // Handlebars without nested braces
]
```

**Potentially unsafe patterns** (will trigger warnings):

```javascript
ignoreCustomFragments: [
  /<%[\s\S]*?%>/,                // Unlimited quantifiers
  /<!--[\s\S]*?-->/,             // Could cause issues with very long comments
  /\{\{.*?\}\}/,                 // Nested unlimited quantifiers
  /(script|style)[\s\S]*?/       // Multiple unlimited quantifiers
]
```

**Template engine configurations:**

```javascript
// Handlebars/Mustache
ignoreCustomFragments: [/\{\{[\s\S]{0,1000}?\}\}/]

// Liquid (Jekyll)
ignoreCustomFragments: [/\{%[\s\S]{0,500}?%\}/, /\{\{[\s\S]{0,500}?\}\}/]

// Angular
ignoreCustomFragments: [/\{\{[\s\S]{0,500}?\}\}/]

// Vue.js
ignoreCustomFragments: [/\{\{[\s\S]{0,500}?\}\}/]
```

**Important:** When using custom `ignoreCustomFragments`, the minifier automatically applies bounded quantifiers to prevent ReDoS attacks, but you can also write safer patterns yourself using explicit bounds.

##### Escaping patterns in different contexts

The escaping requirements for `ignoreCustomFragments` patterns differ depending on how you’re using HMN:

**Config file (JSON):**

```json
{
  "ignoreCustomFragments": ["\\{%[\\s\\S]{0,1000}?%\\}", "\\{\\{[\\s\\S]{0,500}?\\}\\}"]
}
```

**Programmatic (JavaScript/Node.js):**

```javascript
ignoreCustomFragments: [/\{%[\s\S]{0,1000}?%\}/, /\{\{[\s\S]{0,500}?\}\}/]
```

**CLI (via config file—recommended):**

```shell
npx html-minifier-next --config-file=config.json input.html
```

**CLI (inline—not recommended due to complex escaping):**

```shell
npx html-minifier-next --ignore-custom-fragments '[\\\"\\\\{%[\\\\s\\\\S]{0,1000}?%\\\\}\\\"]' input.html
```

For CLI usage, using a config file is strongly recommended to avoid complex shell and JSON escaping.

**[Web demo:](https://j9t.github.io/html-minifier-next/)**

```
\{%[\s\S]{0,1000}?%\} \{\{[\s\S]{0,500}?\}\}
```

## Working on HTML Minifier Next

Note: This section assumes working with main dependencies installed (`npm i`).

### Local server

```shell
npm run serve
```

### Regression tests

```shell
cd backtest;
npm i;
npm run backtest
```

The backtest tool tracks minification performance across Git history. Results are saved in the backtest folder as a JSON file, results.json.

Parameters:

* No argument: Tests last 50 commits (default)
* `COUNT`: Tests last `COUNT` commits (e.g., `npm run backtest 100`)
* `COUNT/STEP`: Tests last `COUNT` commits, sampling every `STEP`th commit (e.g., `npm run backtest 500/10` tests 50 commits)

### Working tree benchmarks

Where the backtest walks Git history, the benchmark times the code as it is _right now_—useful for A/B testing a branch against a saved baseline:

```shell
cd backtest;
npm i;
npm run benchmark
```

It reuses the backtest corpus (run `npm run backtest` once to download it) and reports per-file output size and median processing time.

Parameters:

* No argument: Runs and, if a baseline exists, shows size and time deltas
* `--save`: Saves the run as the baseline (e.g., on `main` before switching to a branch)
* `--core`: Disables the external minifiers (CSS, JS, SVG, URLs) to isolate HMN’s own processing time
* `--iterations=N`: Sets the number of timed iterations (default 5; the median is reported)
* `--config=PATH`: Uses an alternative options file (default `html-minifier-next.json`)

To compare branches (A/B run), execute `npm run benchmark -- --save` on `main`, then `npm run benchmark` on the branch to see the deltas. Add `--core` on both ends when measuring changes to HMN’s own code rather than the bundled minifiers.

#### Profiling

To profile the current working tree, run the benchmark with Node’s built-in CPU profiler:

```shell
node --cpu-prof benchmark.js
```

This writes a .cpuprofile file to the working directory. Load it with `npx speedscope *.cpuprofile` for a flamegraph, or drag it into Chrome DevTools → Sources → JavaScript Profiler. Compare self-time per function against a clean baseline run on `main`. Pay attention to unexpectedly heavy callbacks in hot paths—V8 de-optimization from variable object shapes or unnecessary method calls can show up there.

## Acknowledgements

With many thanks to the previous authors of and contributors to HTML Minifier, especially [Juriy “kangax” Zaytsev](https://github.com/kangax), and to everyone who helped make this new edition better, particularly [Daniel Ruf](https://github.com/DanielRuf), [Jonas Geiler](https://github.com/jonasgeiler), and [Chris Morgan](https://github.com/chris-morgan)!

***

You might like some of my other work:

* Optimization tools: [hihtml](https://github.com/j9t/hihtml) · HTML Minifier Next · [ObsoHTML](https://github.com/j9t/obsohtml) · [Image Guard](https://github.com/j9t/image-guard) · [Compressor.js Next](https://github.com/j9t/compressorjs-next) · [.htaccess Punk](https://github.com/j9t/htaccess-punk)
* Defense tools: [IA Defensa](https://iadefensa.com/solutions/)
* Resources for quality web development: [Articles](https://meiert.com/topics/development/) · [Books](https://meiert.com/topics/books/) (including [_On Web Development_](https://meiert.com/blog/on-web-development-2/)) · [News](https://frontenddogma.com/) · [Terminology](https://webglossary.info/)