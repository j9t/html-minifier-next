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
| `--file-ext <extensions>` | Specify file extension(s) to process (overrides config file setting) | `--file-ext=html`, `--file-ext=html,htm,php`, `--file-ext="html, htm, php"` |
| `-o --output <file>` | Specify output file (reads from file arguments or STDIN) | File to file: `html-minifier-next input.html -o output.html`<br>Pipe to file: `cat input.html \| html-minifier-next -o output.html`<br>File to STDOUT: `html-minifier-next input.html` |
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

## Options quick reference

Most of the options are disabled by default.

| Option | Description | Default |
| --- | --- | --- |
| `caseSensitive` | Treat attributes in case-sensitive manner (useful for custom HTML elements) | `false` |
| `collapseBooleanAttributes` | [Omit attribute values from boolean attributes](http://perfectionkills.com/experimenting-with-html-minifier#collapse_boolean_attributes) | `false` |
| `customFragmentQuantifierLimit` | Set maximum quantifier limit for custom fragments to prevent ReDoS attacks | `200` |
| `collapseInlineTagWhitespace` | Don’t leave any spaces between `display: inline;` elements when collapsing—use with `collapseWhitespace=true` | `false` |
| `collapseWhitespace` | [Collapse whitespace that contributes to text nodes in a document tree](http://perfectionkills.com/experimenting-with-html-minifier#collapse_whitespace) | `false` |
| `conservativeCollapse` | Always collapse to 1 space (never remove it entirely)—use with `collapseWhitespace=true` | `false` |
| `continueOnParseError` | [Handle parse errors](https://html.spec.whatwg.org/multipage/parsing.html#parse-errors) instead of aborting | `false` |
| `customAttrAssign` | Arrays of regexes that allow to support custom attribute assign expressions (e.g., `'<div flex?="{{mode != cover}}"></div>'`) | `[]` |
| `customAttrCollapse` | Regex that specifies custom attribute to strip newlines from (e.g., `/ng-class/`) | |
| `customAttrSurround` | Arrays of regexes that allow to support custom attribute surround expressions (e.g., `<input {{#if value}}checked="checked"{{/if}}>`) | `[]` |
| `customEventAttributes` | Arrays of regexes that allow to support custom event attributes for `minifyJS` (e.g., `ng-click`) | `[ /^on[a-z]{3,}$/ ]` |
| `decodeEntities` | Use direct Unicode characters whenever possible | `false` |
| `html5` | Parse input according to the HTML specification | `true` |
| `ignoreCustomComments` | Array of regexes that allow to ignore certain comments, when matched | `[ /^!/, /^\s*#/ ]` |
| `ignoreCustomFragments` | Array of regexes that allow to ignore certain fragments, when matched (e.g., `<?php … ?>`, `{{ … }}`, etc.) | `[ /<%[\s\S]*?%>/, /<\?[\s\S]*?\?>/ ]` |
| `includeAutoGeneratedTags` | Insert elements generated by HTML parser | `true` |
| `inlineCustomElements` | Array of names of custom elements which are inline | `[]` |
| `keepClosingSlash` | Keep the trailing slash on void elements | `false` |
| `maxInputLength` | Maximum input length to prevent ReDoS attacks (disabled by default) | `undefined` |
| `maxLineLength` | Specify a maximum line length; compressed output will be split by newlines at valid HTML split-points | |
| `minifyCSS` | Minify CSS in `style` elements and `style` attributes (uses [clean-css](https://github.com/jakubpawlowicz/clean-css)) | `false` (could be `true`, `Object`, `Function(text, type)`) |
| `minifyJS` | Minify JavaScript in `script` elements and event attributes (uses [Terser](https://github.com/terser/terser)) | `false` (could be `true`, `Object`, `Function(text, inline)`) |
| `minifyURLs` | Minify URLs in various attributes (uses [relateurl](https://github.com/stevenvachon/relateurl)) | `false` (could be `String`, `Object`, `Function(text)`, `async Function(text)`) |
| `noNewlinesBeforeTagClose` | Never add a newline before a tag that closes an element | `false` |
| `preserveLineBreaks` | Always collapse to 1 line break (never remove it entirely) when whitespace between tags includes a line break—use with `collapseWhitespace=true` | `false` |
| `preventAttributesEscaping` | Prevents the escaping of the values of attributes | `false` |
| `processConditionalComments` | Process contents of conditional comments through minifier | `false` |
| `processScripts` | Array of strings corresponding to types of `script` elements to process through minifier (e.g., `text/ng-template`, `text/x-handlebars-template`, etc.) | `[]` |
| `quoteCharacter` | Type of quote to use for attribute values (`'` or `"`) | |
| `removeAttributeQuotes` | [Remove quotes around attributes when possible](http://perfectionkills.com/experimenting-with-html-minifier#remove_attribute_quotes) | `false` |
| `removeComments` | [Strip HTML comments](http://perfectionkills.com/experimenting-with-html-minifier#remove_comments) | `false` |
| `removeEmptyAttributes` | [Remove all attributes with whitespace-only values](http://perfectionkills.com/experimenting-with-html-minifier#remove_empty_or_blank_attributes) | `false` (could be `true`, `Function(attrName, tag)`) |
| `removeEmptyElements` | [Remove all elements with empty contents](http://perfectionkills.com/experimenting-with-html-minifier#remove_empty_elements) | `false` |
| `removeOptionalTags` | [Remove optional tags](http://perfectionkills.com/experimenting-with-html-minifier#remove_optional_tags) | `false` |
| `removeRedundantAttributes` | [Remove attributes when value matches default](https://meiert.com/blog/optional-html/#toc-attribute-values) | `false` |
| `removeScriptTypeAttributes` | Remove `type="text/javascript"` from `script` elements; other `type` attribute values are left intact | `false` |
| `removeStyleLinkTypeAttributes`| Remove `type="text/css"` from `style` and `link` elements; other `type` attribute values are left intact | `false` |
| `removeTagWhitespace` | Remove space between attributes whenever possible; **note that this will result in invalid HTML** | `false` |
| `sortAttributes` | [Sort attributes by frequency](#sorting-attributes-and-style-classes) | `false` |
| `sortClassName` | [Sort style classes by frequency](#sorting-attributes-and-style-classes) | `false` |
| `trimCustomFragments` | Trim whitespace around `ignoreCustomFragments` | `false` |
| `useShortDoctype` | [Replaces the doctype with the short (HTML) doctype](http://perfectionkills.com/experimenting-with-html-minifier#use_short_doctype) | `false` |

### Sorting attributes and style classes

Minifier options like `sortAttributes` and `sortClassName` won’t impact the plain‑text size of the output. However, they form long, repetitive character chains that should improve the compression ratio of gzip used for HTTP.

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

## Running benchmarks

Benchmarks for minified HTML:

```shell
cd benchmarks
npm install
npm run benchmarks
```

## Running local server

```shell
npm run serve
```

## Acknowledgements

With many thanks to all the previous authors of HTML Minifier, especially [Juriy Zaytsev](https://github.com/kangax), and to everyone who helped make this new edition better, particularly [Daniel Ruf](https://github.com/DanielRuf) and [Jonas Geiler](https://github.com/jonasgeiler).