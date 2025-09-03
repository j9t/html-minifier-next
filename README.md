# HTML Minifier Next

[![npm version](https://img.shields.io/npm/v/html-minifier-next.svg)](https://www.npmjs.com/package/html-minifier-next)
[![Build Status](https://github.com/j9t/html-minifier-next/workflows/CI/badge.svg)](https://github.com/j9t/html-minifier-next/actions?workflow=CI)

HTML Minifier is a highly **configurable, well-tested, JavaScript-based HTML minifier**.

The project has been based on [Terser’s html-minifier-terser](https://github.com/terser/html-minifier-terser), which in turn had been based on [Juriy Zaytsev’s html-minifier](https://github.com/kangax/html-minifier). It was set up because as of 2025, both html-minifier-terser and html-minifier have been unmaintained for some time. As the project seems maintainable [to me, [Jens](https://meiert.com/)]—even more so with community support—, it will be updated and documented further in this place.

## Installation

From npm for use as a command line app:

```shell
npm i -g html-minifier-next
```

From npm for programmatic use:

```shell
npm i html-minifier-next
```

## Usage

**Note** that almost all options are disabled by default. Experiment and find what works best for you and your project.

**Sample command line:**

```bash
html-minifier-next --collapse-whitespace --remove-comments --minify-js true --input-dir=. --output-dir=example
```

**Process specific file extensions:**

```bash
# Process only HTML files (CLI method)
html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --file-ext=html

# Process multiple file extensions (CLI method)
html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist --file-ext=html,htm,php

# Using configuration file that sets `fileExt` (e.g., `"fileExt": "html,htm"`)
html-minifier-next --config-file=html-minifier.json --input-dir=src --output-dir=dist

# Process all files (default behavior)
html-minifier-next --collapse-whitespace --input-dir=src --output-dir=dist
# Note: When processing all files, non-HTML files will also be read as UTF‑8 and passed to the minifier.
# Consider restricting with “--file-ext” to avoid touching binaries (e.g., images, archives).
```

### CLI options

Use `html-minifier-next --help` to check all available options:

| Option | Description | Example |
| --- | --- | --- |
| `--input-dir <dir>` | Specify an input directory | `--input-dir=src` |
| `--output-dir <dir>` | Specify an output directory | `--output-dir=dist` |
| `--file-ext <extensions>` | Specify file extension(s) to process (overrides config file setting) | `--file-ext=html` or `--file-ext=html,htm,php` |
| `-o --output <file>` | Specify output file (single file mode) | `-o minified.html` |
| `-c --config-file <file>` | Use a configuration file | `--config-file=html-minifier.json` |

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

For lint-like capabilities take a look at [HTMLLint](https://github.com/kangax/html-lint).

## Minification comparison

How does html-minifier-next compare to other solutions?

[html-minifier-terser]: https://www.npmjs.com/package/html-minifier-terser/v/7.2.0
[html-minifier-next]: https://www.npmjs.com/package/html-minifier-next/v/1.4.0
[htmlnano]: https://www.npmjs.com/package/htmlnano/v/2.1.3
[minify]: https://www.npmjs.com/package/@tdewolff/minify/v/2.24.2
[minify-html]: https://www.npmjs.com/package/@minify-html/node/v/0.16.4

| Website                                                     | Source (KB) | [html-minifier-terser] | [html-minifier-next] | [htmlnano] | [minify] | [minify-html] |
| ----------------------------------------------------------- | ----------: | ---------------------: | -------------------: | ---------: | -------: | ------------: |
| [stackoverflow.blog](https://stackoverflow.blog/)           |         166 |                   3.3% |                 3.3% |       8.3% |     4.6% |          4.0% |
| [github.com](https://github.com/)                           |         541 |                   3.7% |                 3.7% |      18.1% |     7.9% |          6.2% |
| [en.wikipedia.org](https://en.wikipedia.org/wiki/Main_Page) |         220 |                   4.6% |                 4.6% |       4.9% |     6.2% |          2.9% |
| [npmjs.com](https://www.npmjs.com/package/eslint)           |         460 |                   0.5% |                 0.5% |       0.9% |     3.6% |          0.7% |
| [tc39.es](https://tc39.es/ecma262/)                         |        7198 |                   8.5% |                 8.5% |       8.7% |     9.5% |          9.1% |
| [apple.com](https://www.apple.com/)                         |         190 |                   7.6% |                 7.6% |      12.1% |    10.5% |          8.1% |
| [w3.org](https://www.w3.org/)                               |          49 |                  18.9% |                18.9% |      23.0% |    24.1% |         19.9% |
| [weather.com](https://weather.com)                          |        1770 |                   0.2% |                 0.2% |      12.1% |    11.9% |          0.6% |
| **Avg. minify rate**                                        |             |               **5.9%** |             **5.9%** |  **11.0%** | **9.8%** |      **6.4%** |

Latest benchmarks: https://github.com/maltsev/html-minifiers-benchmark (updated daily).

## Options quick reference

Most of the options are disabled by default.

| Option | Description | Default |
| --- | --- | --- |
| `caseSensitive` | Treat attributes in case-sensitive manner (useful for custom HTML elements) | `false` |
| `collapseBooleanAttributes` | [Omit attribute values from boolean attributes](http://perfectionkills.com/experimenting-with-html-minifier#collapse_boolean_attributes) | `false` |
| `customFragmentQuantifierLimit` | Set maximum quantifier limit for custom fragments to prevent ReDoS attacks | `200` |
| `collapseInlineTagWhitespace` | Don’t leave any spaces between `display:inline;` elements when collapsing. Must be used in conjunction with `collapseWhitespace=true` | `false` |
| `collapseWhitespace` | [Collapse white space that contributes to text nodes in a document tree](http://perfectionkills.com/experimenting-with-html-minifier#collapse_whitespace) | `false` |
| `conservativeCollapse` | Always collapse to 1 space (never remove it entirely). Must be used in conjunction with `collapseWhitespace=true` | `false` |
| `continueOnParseError` | [Handle parse errors](https://html.spec.whatwg.org/multipage/parsing.html#parse-errors) instead of aborting. | `false` |
| `customAttrAssign` | Arrays of regex’es that allow to support custom attribute assign expressions (e.g. `'<div flex?="{{mode != cover}}"></div>'`) | `[]` |
| `customAttrCollapse` | Regex that specifies custom attribute to strip newlines from (e.g. `/ng-class/`) | |
| `customAttrSurround` | Arrays of regexes that allow to support custom attribute surround expressions (e.g. `<input {{#if value}}checked="checked"{{/if}}>`) | `[]` |
| `customEventAttributes` | Arrays of regexes that allow to support custom event attributes for `minifyJS` (e.g. `ng-click`) | `[ /^on[a-z]{3,}$/ ]` |
| `decodeEntities` | Use direct Unicode characters whenever possible | `false` |
| `html5` | Parse input according to HTML5 specifications | `true` |
| `ignoreCustomComments` | Array of regexes that allow to ignore certain comments, when matched | `[ /^!/, /^\s*#/ ]` |
| `ignoreCustomFragments` | Array of regexes that allow to ignore certain fragments, when matched (e.g. `<?php ... ?>`, `{{ ... }}`, etc.) | `[ /<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/ ]` |
| `includeAutoGeneratedTags` | Insert elements generated by HTML parser | `true` |
| `inlineCustomElements` | Array of names of custom elements which are inline | `[]` |
| `keepClosingSlash` | Keep the trailing slash on singleton elements | `false` |
| `maxInputLength` | Maximum input length to prevent ReDoS attacks (disabled by default) | `undefined` |
| `maxLineLength` | Specify a maximum line length. Compressed output will be split by newlines at valid HTML split-points |
| `minifyCSS` | Minify CSS in style elements and style attributes (uses [clean-css](https://github.com/jakubpawlowicz/clean-css)) | `false` (could be `true`, `Object`, `Function(text, type)`) |
| `minifyJS` | Minify JavaScript in script elements and event attributes (uses [Terser](https://github.com/terser/terser)) | `false` (could be `true`, `Object`, `Function(text, inline)`) |
| `minifyURLs` | Minify URLs in various attributes (uses [relateurl](https://github.com/stevenvachon/relateurl)) | `false` (could be `String`, `Object`, `Function(text)`) |
| `noNewlinesBeforeTagClose` | Never add a newline before a tag that closes an element | `false` |
| `preserveLineBreaks` | Always collapse to 1 line break (never remove it entirely) when whitespace between tags include a line break. Must be used in conjunction with `collapseWhitespace=true` | `false` |
| `preventAttributesEscaping` | Prevents the escaping of the values of attributes | `false` |
| `processConditionalComments` | Process contents of conditional comments through minifier | `false` |
| `processScripts` | Array of strings corresponding to types of script elements to process through minifier (e.g. `text/ng-template`, `text/x-handlebars-template`, etc.) | `[]` |
| `quoteCharacter` | Type of quote to use for attribute values (“'” or “"”) | |
| `removeAttributeQuotes` | [Remove quotes around attributes when possible](http://perfectionkills.com/experimenting-with-html-minifier#remove_attribute_quotes) | `false` |
| `removeComments` | [Strip HTML comments](http://perfectionkills.com/experimenting-with-html-minifier#remove_comments) | `false` |
| `removeEmptyAttributes` | [Remove all attributes with whitespace-only values](http://perfectionkills.com/experimenting-with-html-minifier#remove_empty_or_blank_attributes) | `false` (could be `true`, `Function(attrName, tag)`) |
| `removeEmptyElements` | [Remove all elements with empty contents](http://perfectionkills.com/experimenting-with-html-minifier#remove_empty_elements) | `false` |
| `removeOptionalTags` | [Remove optional tags](http://perfectionkills.com/experimenting-with-html-minifier#remove_optional_tags) | `false` |
| `removeRedundantAttributes` | [Remove attributes when value matches default.](http://perfectionkills.com/experimenting-with-html-minifier#remove_redundant_attributes) | `false` |
| `removeScriptTypeAttributes` | Remove `type="text/javascript"` from `script` elements. Other `type` attribute values are left intact | `false` |
| `removeStyleLinkTypeAttributes`| Remove `type="text/css"` from `style` and `link` elements. Other `type` attribute values are left intact | `false` |
| `removeTagWhitespace` | Remove space between attributes whenever possible. **Note that this will result in invalid HTML!** | `false` |
| `sortAttributes` | [Sort attributes by frequency](#sorting-attributes--style-classes) | `false` |
| `sortClassName` | [Sort style classes by frequency](#sorting-attributes--style-classes) | `false` |
| `trimCustomFragments` | Trim white space around `ignoreCustomFragments`. | `false` |
| `useShortDoctype` | [Replaces the `doctype` with the short (HTML5) doctype](http://perfectionkills.com/experimenting-with-html-minifier#use_short_doctype) | `false` |

### Sorting attributes / style classes

Minifier options like `sortAttributes` and `sortClassName` won’t impact the plain-text size of the output. However, they form long repetitive chains of characters that should improve compression ratio of gzip used in HTTP compression.

## Special cases

### Ignoring chunks of markup

If you have chunks of markup you would like preserved, you can wrap them `<!-- htmlmin:ignore -->`.

### Minifying JSON-LD

You can minify script elements with JSON-LD by setting the option `{ processScripts: ['application/ld+json'] }`. Note that this minification is very rudimentary, it is mainly useful for removing newlines and excessive whitespace. 

### Preserving SVG elements

SVG elements are automatically recognized, and when they are minified, both case-sensitivity and closing-slashes are preserved, regardless of the minification settings used for the rest of the file.

### Working with invalid markup

HTML Minifier **can’t work with invalid or partial chunks of markup**. This is because it parses markup into a tree structure, then modifies it (removing anything that was specified for removal, ignoring anything that was specified to be ignored, etc.), then it creates a markup out of that tree and returns it.

Input markup (e.g. `<p id="">foo`) → Internal representation of markup in a form of tree (e.g. `{ tag: "p", attr: "id", children: ["foo"] }`) → Transformation of internal representation (e.g. removal of `id` attribute) → Output of resulting markup (e.g. `<p>foo</p>`)

HTML Minifier can’t know that original markup was only half of the tree; it does its best to try to parse it as a full tree and it loses information about tree being malformed or partial in the beginning. As a result, it can’t create a partial/malformed tree at the time of the output.

## Security

### ReDoS protection

This minifier includes protection against regular expression denial of service (ReDoS) attacks:

* Custom fragment quantifier limits: The `customFragmentQuantifierLimit` option (default: 200) prevents exponential backtracking by replacing unlimited quantifiers (`*`, `+`) with bounded ones in regular expressions.

* Input length limits: The `maxInputLength` option allows you to set a maximum input size to prevent processing of excessively large inputs that could cause performance issues.

* Enhanced pattern detection: The minifier detects and warns about various ReDoS-prone patterns including nested quantifiers, alternation with quantifiers, and multiple unlimited quantifiers.

**Important:** When using custom `ignoreCustomFragments`, ensure your regular expressions don’t contain unlimited quantifiers (`*`, `+`) without bounds, as these can lead to ReDoS vulnerabilities.

(Further improvements are needed. Contributions welcome.)

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

## Running benchmarks

Benchmarks for minified HTML:

```shell
cd benchmarks
npm install
npm run benchmark
```

## Running local server

```shell
npm run serve
```

## Acknowledgements

With many thanks to all the previous authors of HTML Minifier, especially [Juriy Zaytsev](https://github.com/kangax), and to everyone who helped make this new edition better, like [Daniel Ruf](https://github.com/DanielRuf).
