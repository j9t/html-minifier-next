# HTML Minifier Next

[![npm version](https://img.shields.io/npm/v/html-minifier-next.svg)](https://www.npmjs.com/package/html-minifier-next)
[![Build status](https://github.com/j9t/html-minifier-next/workflows/Tests/badge.svg)](https://github.com/j9t/html-minifier-next/actions)

HTML Minifier Next (HMN) is a highly **configurable, well-tested, JavaScript-based HTML minifier**.

The project has been based on [Terser’s html-minifier-terser](https://github.com/terser/html-minifier-terser), which in turn had been based on [Juriy Zaytsev’s html-minifier](https://github.com/kangax/html-minifier) (HMN offers additional features, but is compatible with both). It was set up because as of 2025, both html-minifier-terser and html-minifier have been unmaintained for some time. As the project seems maintainable [to me, [Jens](https://meiert.com/)]—even more so with community support—, it’s being updated and documented further in this place.

## Installation

From npm for use as a command line app:

```shell
npm i -g html-minifier-next
```

From npm for programmatic use:

```shell
npm i html-minifier-next
```

## General usage

### CLI options

Use `html-minifier-next --help` to check all available options:

| Option | Description | Example |
| --- | --- | --- |
| `--input-dir <dir>` | Specify an input directory | `--input-dir=src` |
| `--output-dir <dir>` | Specify an output directory | `--output-dir=dist` |
| `--file-ext <extensions>` | Specify file extension(s) to process (overrides config file setting) | `--file-ext=html`, `--file-ext=html,htm,php`, `--file-ext="html, htm, php"` |
| `-o --output <file>` | Specify output file (reads from file arguments or STDIN) | File to file: `html-minifier-next input.html -o output.html`<br>Pipe to file: `cat input.html \| html-minifier-next -o output.html`<br>File to STDOUT: `html-minifier-next input.html` |
| `-c --config-file <file>` | Use a configuration file | `--config-file=html-minifier.json` |
| `-v --verbose` | Show detailed processing information (active options, file statistics) | `html-minifier-next --input-dir=src --output-dir=dist --verbose --collapse-whitespace` |
| `-d --dry` | Dry run: Process and report statistics without writing output | `html-minifier-next input.html --dry --collapse-whitespace` |
| `-V --version` | Output the version number | `html-minifier-next --version` |

### Configuration file

You can also use a configuration file to specify options. The file can be either JSON format or a JavaScript module that exports the configuration object:

**JSON configuration example:**

```json
{
  "collapseWhitespace": true,
  "removeComments": true,
  "fileExt": "html,htm"
}
```

**JavaScript module configuration example:**

```js
module.exports = {
  collapseWhitespace: true,
  removeComments: true,
  fileExt: "html,htm"
};
```

**Using a configuration file:**

```bash
# Specify config file
html-minifier-next --config-file=html-minifier.json --input-dir=src --output-dir=dist

# CLI arguments override config file settings
html-minifier-next --config-file=html-minifier.json --file-ext=xml --input-dir=src --output-dir=dist
```

### Node.js

ESM with Node.js ≥16.14:

```js
import { minify } from 'html-minifier-next';

const result = await minify('<p title="blah" id="moo">foo</p>', {
  removeAttributeQuotes: true,
});
console.log(result); // “<p title=blah id=moo>foo</p>”
```

CommonJS:

```js
const { minify } = require('html-minifier-next');

(async () => {
  const result = await minify('<p title="blah" id="moo">foo</p>', {
    removeAttributeQuotes: true,
  });
  console.log(result);
})();
```

See [the original blog post](http://perfectionkills.com/experimenting-with-html-minifier) for details of [how it works](http://perfectionkills.com/experimenting-with-html-minifier#how_it_works), [description of each option](http://perfectionkills.com/experimenting-with-html-minifier#options), [testing results](http://perfectionkills.com/experimenting-with-html-minifier#field_testing), and [conclusions](http://perfectionkills.com/experimenting-with-html-minifier#cost_and_benefits).

For lint-like capabilities, take a look at [HTMLLint](https://github.com/kangax/html-lint).

## Options quick reference

Most of the options are disabled by default. Experiment and find what works best for you and your project.

Options can be used in config files (camelCase) or via CLI flags (kebab-case with `--` prefix). Options that default to `true` use `--no-` prefix in CLI to disable them.

| Option (config/CLI) | Description | Default |
| --- | --- | --- |
| `caseSensitive`<br>`--case-sensitive` | Treat attributes in case-sensitive manner (useful for custom HTML elements) | `false` |
| `collapseBooleanAttributes`<br>`--collapse-boolean-attributes` | [Omit attribute values from boolean attributes](http://perfectionkills.com/experimenting-with-html-minifier#collapse_boolean_attributes) | `false` |
| `collapseInlineTagWhitespace`<br>`--collapse-inline-tag-whitespace` | Don’t leave any spaces between `display: inline;` elements when collapsing—use with `collapseWhitespace=true` | `false` |
| `collapseWhitespace`<br>`--collapse-whitespace` | [Collapse whitespace that contributes to text nodes in a document tree](http://perfectionkills.com/experimenting-with-html-minifier#collapse_whitespace) | `false` |
| `conservativeCollapse`<br>`--conservative-collapse` | Always collapse to 1 space (never remove it entirely)—use with `collapseWhitespace=true` | `false` |
| `continueOnParseError`<br>`--continue-on-parse-error` | [Handle parse errors](https://html.spec.whatwg.org/multipage/parsing.html#parse-errors) instead of aborting | `false` |
| `customAttrAssign`<br>`--custom-attr-assign` | Arrays of regexes that allow to support custom attribute assign expressions (e.g., `<div flex?="{{mode != cover}}"></div>`) | `[]` |
| `customAttrCollapse`<br>`--custom-attr-collapse` | Regex that specifies custom attribute to strip newlines from (e.g., `/ng-class/`) | |
| `customAttrSurround`<br>`--custom-attr-surround` | Arrays of regexes that allow to support custom attribute surround expressions (e.g., `<input {{#if value}}checked="checked"{{/if}}>`) | `[]` |
| `customEventAttributes`<br>`--custom-event-attributes` | Arrays of regexes that allow to support custom event attributes for `minifyJS` (e.g., `ng-click`) | `[ /^on[a-z]{3,}$/ ]` |
| `customFragmentQuantifierLimit`<br>`--custom-fragment-quantifier-limit` | Set maximum quantifier limit for custom fragments to prevent ReDoS attacks | `200` |
| `decodeEntities`<br>`--decode-entities` | Use direct Unicode characters whenever possible | `false` |
| `html5`<br>`--no-html5` | Parse input according to the HTML specification | `true` |
| `ignoreCustomComments`<br>`--ignore-custom-comments` | Array of regexes that allow to ignore certain comments, when matched | `[ /^!/, /^\s*#/ ]` |
| `ignoreCustomFragments`<br>`--ignore-custom-fragments` | Array of regexes that allow to ignore certain fragments, when matched (e.g., `<?php … ?>`, `{{ … }}`, etc.) | `[ /<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/ ]` |
| `includeAutoGeneratedTags`<br>`--no-include-auto-generated-tags` | Insert elements generated by HTML parser | `true` |
| `inlineCustomElements`<br>`--inline-custom-elements` | Array of names of custom elements which are inline | `[]` |
| `keepClosingSlash`<br>`--keep-closing-slash` | Keep the trailing slash on void elements | `false` |
| `maxInputLength`<br>`--max-input-length` | Maximum input length to prevent ReDoS attacks (disabled by default) | `undefined` |
| `maxLineLength`<br>`--max-line-length` | Specify a maximum line length; compressed output will be split by newlines at valid HTML split-points | |
| `minifyCSS`<br>`--minify-css` | Minify CSS in `style` elements and `style` attributes (uses [clean-css](https://github.com/jakubpawlowicz/clean-css)) | `false` (could be `true`, `Object`, `Function(text, type)`) |
| `minifyJS`<br>`--minify-js` | Minify JavaScript in `script` elements and event attributes (uses [Terser](https://github.com/terser/terser)) | `false` (could be `true`, `Object`, `Function(text, inline)`) |
| `minifyURLs`<br>`--minify-urls` | Minify URLs in various attributes (uses [relateurl](https://github.com/stevenvachon/relateurl)) | `false` (could be `String`, `Object`, `Function(text)`, `async Function(text)`) |
| `noNewlinesBeforeTagClose`<br>`--no-newlines-before-tag-close` | Never add a newline before a tag that closes an element | `false` |
| `preserveLineBreaks`<br>`--preserve-line-breaks` | Always collapse to 1 line break (never remove it entirely) when whitespace between tags includes a line break—use with `collapseWhitespace=true` | `false` |
| `preventAttributesEscaping`<br>`--prevent-attributes-escaping` | Prevents the escaping of the values of attributes | `false` |
| `processConditionalComments`<br>`--process-conditional-comments` | Process contents of conditional comments through minifier | `false` |
| `processScripts`<br>`--process-scripts` | Array of strings corresponding to types of `script` elements to process through minifier (e.g., `text/ng-template`, `text/x-handlebars-template`, etc.) | `[]` |
| `quoteCharacter`<br>`--quote-character` | Type of quote to use for attribute values (`'` or `"`) | |
| `removeAttributeQuotes`<br>`--remove-attribute-quotes` | [Remove quotes around attributes when possible](http://perfectionkills.com/experimenting-with-html-minifier#remove_attribute_quotes) | `false` |
| `removeComments`<br>`--remove-comments` | [Strip HTML comments](http://perfectionkills.com/experimenting-with-html-minifier#remove_comments) | `false` |
| `removeEmptyAttributes`<br>`--remove-empty-attributes` | [Remove all attributes with whitespace-only values](http://perfectionkills.com/experimenting-with-html-minifier#remove_empty_or_blank_attributes) | `false` (could be `true`, `Function(attrName, tag)`) |
| `removeEmptyElements`<br>`--remove-empty-elements` | [Remove all elements with empty contents](http://perfectionkills.com/experimenting-with-html-minifier#remove_empty_elements) | `false` |
| `removeOptionalTags`<br>`--remove-optional-tags` | [Remove optional tags](http://perfectionkills.com/experimenting-with-html-minifier#remove_optional_tags) | `false` |
| `removeRedundantAttributes`<br>`--remove-redundant-attributes` | [Remove attributes when value matches default](https://meiert.com/blog/optional-html/#toc-attribute-values) | `false` |
| `removeScriptTypeAttributes`<br>`--remove-script-type-attributes` | Remove `type="text/javascript"` from `script` elements; other `type` attribute values are left intact | `false` |
| `removeStyleLinkTypeAttributes`<br>`--remove-style-link-type-attributes`| Remove `type="text/css"` from `style` and `link` elements; other `type` attribute values are left intact | `false` |
| `removeTagWhitespace`<br>`--remove-tag-whitespace` | Remove space between attributes whenever possible; **note that this will result in invalid HTML** | `false` |
| `sortAttributes`<br>`--sort-attributes` | [Sort attributes by frequency](#sorting-attributes-and-style-classes) | `false` |
| `sortClassName`<br>`--sort-class-name` | [Sort style classes by frequency](#sorting-attributes-and-style-classes) | `false` |
| `trimCustomFragments`<br>`--trim-custom-fragments` | Trim whitespace around `ignoreCustomFragments` | `false` |
| `useShortDoctype`<br>`--use-short-doctype` | [Replaces the doctype with the short (HTML) doctype](http://perfectionkills.com/experimenting-with-html-minifier#use_short_doctype) | `false` |

### Sorting attributes and style classes

Minifier options like `sortAttributes` and `sortClassName` won’t impact the plain‑text size of the output. However, they form long, repetitive character chains that should improve the compression ratio of gzip used for HTTP.

## Minification comparison

How does HTML Minifier Next compare to other solutions, like [minimize](https://github.com/Swaagie/minimize), [htmlcompressor.com](http://htmlcompressor.com/), [htmlnano](https://github.com/posthtml/htmlnano), and [minify-html](https://github.com/wilsonzlin/minify-html)? (All with the most aggressive settings, but without [hyper-optimization](https://meiert.com/blog/the-ways-of-writing-html/#toc-hyper-optimized).)

| Site | Original Size (KB) | HTML Minifier Next | minimize | html­compressor.com | htmlnano | minify-html |
| --- | --- | --- | --- | --- | --- | --- |
| [A List Apart](https://alistapart.com/) | 62 | **53** | 58 | 56 | 54 | 55 |
| [Amazon](https://www.amazon.com/) | 715 | **642** | 701 | n/a | n/a | n/a |
| [Apple](https://www.apple.com/) | 184 | **143** | 170 | 167 | 161 | 166 |
| [BBC](https://www.bbc.co.uk/) | 618 | **568** | 613 | n/a | 580 | 582 |
| [CSS-Tricks](https://css-tricks.com/) | 161 | **121** | 148 | 145 | 126 | 144 |
| [ECMAScript](https://tc39.es/ecma262/) | 7233 | **6338** | 6610 | n/a | 6557 | 6563 |
| [EFF](https://www.eff.org/) | 57 | **48** | 51 | 51 | 51 | 49 |
| [FAZ](https://www.faz.net/aktuell/) | 1876 | 1753 | 1790 | n/a | **1652** | n/a |
| [Frontend Dogma](https://frontenddogma.com/) | 119 | **114** | 128 | 118 | 125 | 119 |
| [Google](https://www.google.com/) | 18 | **17** | 18 | 18 | **17** | n/a |
| [Ground News](https://ground.news/) | 1840 | **1591** | 1827 | n/a | 1689 | n/a |
| [HTML](https://html.spec.whatwg.org/multipage/) | 149 | **147** | 155 | 148 | 153 | 149 |
| [Leanpub](https://leanpub.com/) | 1567 | **1292** | 1561 | n/a | 1299 | n/a |
| [Mastodon](https://mastodon.social/explore) | 35 | **26** | 34 | 34 | 30 | 33 |
| [MDN](https://developer.mozilla.org/en-US/) | 104 | **62** | 67 | 68 | 64 | n/a |
| [Middle East Eye](https://www.middleeasteye.net/) | 224 | **197** | 204 | 204 | 204 | 201 |
| [SitePoint](https://www.sitepoint.com/) | 476 | **345** | 473 | n/a | 415 | 456 |
| [United Nations](https://www.un.org/en/) | 151 | **114** | 130 | 123 | 121 | 124 |
| [W3C](https://www.w3.org/) | 50 | **36** | 41 | 39 | 39 | 39 |

## Examples

### CLI

**Sample command line:**

```bash
html-minifier-next --collapse-whitespace --remove-comments --minify-js true --input-dir=. --output-dir=example
```

**Process specific file extensions:**

```bash
# Process only HTML files
html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --file-ext=html

# Process multiple file extensions
html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --file-ext=html,htm,php

# Using configuration file that sets `fileExt` (e.g., `"fileExt": "html,htm"`)
html-minifier-next --config-file=html-minifier.json --input-dir=src --output-dir=dist

# Process all files (default behavior)
html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist
# Note: When processing all files, non-HTML files will also be read as UTF‑8 and passed to the minifier.
# Consider restricting with “--file-ext” to avoid touching binaries (e.g., images, archives).
```

**Dry run mode (preview outcome without writing files):**

```bash
# Preview with output file
html-minifier-next input.html -o output.html --dry --collapse-whitespace

# Preview directory processing with statistics per file and total
html-minifier-next --input-dir=src --output-dir=dist --dry --collapse-whitespace
# Output: [DRY RUN] Would process directory: src → dist
#   index.html: 1,234 → 892 bytes (-342, 27.7%)
#   about.html: 2,100 → 1,654 bytes (-446, 21.2%)
# ---
# Total: 3,334 → 2,546 bytes (-788, 23.6%)
```

**Verbose mode (show detailed processing information):**

```bash
# Show processing details while minifying
html-minifier-next --input-dir=src --output-dir=dist --verbose --collapse-whitespace
# Output: Options: collapseWhitespace, html5, includeAutoGeneratedTags
#   ✓ src/index.html: 1,234 → 892 bytes (-342, 27.7%)
#   ✓ src/about.html: 2,100 → 1,654 bytes (-446, 21.2%)
# ---
# Total: 3,334 → 2,546 bytes (-788, 23.6%)

# Note: --dry automatically enables verbose output
html-minifier-next --input-dir=src --output-dir=dist --dry --collapse-whitespace
```

## Special cases

### Ignoring chunks of markup

If you have chunks of markup you would like preserved, you can wrap them with `<!-- htmlmin:ignore -->`.

### Minifying JSON-LD

You can minify `script` elements with JSON-LD by setting `{ processScripts: ['application/ld+json'] }`. Note that this minification is rudimentary; it’s mainly useful for removing newlines and excessive whitespace. 

### Preserving SVG elements

SVG elements are automatically recognized, and when they are minified, both case-sensitivity and closing-slashes are preserved, regardless of the minification settings used for the rest of the file.

### Working with invalid markup

HTML Minifier Next **can’t work with invalid or partial chunks of markup**. This is because it parses markup into a tree structure, then modifies it (removing anything that was specified for removal, ignoring anything that was specified to be ignored, etc.), then it creates a markup out of that tree and returns it.

_Input markup (e.g., `<p id="">foo`) → Internal representation of markup in a form of tree (e.g., `{ tag: "p", attr: "id", children: ["foo"] }`) → Transformation of internal representation (e.g., removal of `id` attribute) → Output of resulting markup (e.g., `<p>foo</p>`)_

HMN can’t know that the original markup represented only part of the tree. It parses a complete tree and, in doing so, loses information about the input being malformed or partial. As a result, it can’t emit a partial or malformed tree.

To validate HTML markup, use [the W3C validator](https://validator.w3.org/) or one of [several validator packages](https://meiert.com/blog/html-validator-packages/).

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

## Running HTML Minifier Next

### Benchmarks

Benchmarks for minified HTML:

```shell
cd benchmarks
npm install
npm run benchmarks
```

## Local server

```shell
npm run serve
```

## Acknowledgements

With many thanks to all the previous authors of HTML Minifier, especially [Juriy Zaytsev](https://github.com/kangax), and to everyone who helped make this new edition better, particularly [Daniel Ruf](https://github.com/DanielRuf) and [Jonas Geiler](https://github.com/jonasgeiler).