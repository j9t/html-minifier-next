# Changelog

As of version 2.0.0, all notable changes to HTML Minifier Next (HMN) are documented in this file, which is (mostly) AI-generated and (always) human-edited. Dependency updates may or may not be called out specifically.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.9.1] - 2025-12-14

### Changed

- Optimized whitespace collapsing between consecutive `htmlmin:ignore` placeholder comments
  - Automatically removes whitespace between consecutive `<!-- htmlmin:ignore -->` block pairs containing block-level HTML elements when `collapseWhitespace` is enabled
  - Preserves whitespace when blocks contain plain text or inline elements (e.g., `<span>`, `<b>`, `<a>`) to avoid changing semantic meaning
  - Respects existing context rules (`conservativeCollapse`, `<pre>` elements, etc.)
  - Improves compression efficiency for templates using multiple ignore blocks (e.g., Nunjucks, Jinja, ERB)

### Internal

- Ensured automated dependency updates for benchmarks (via Dependabot)

## [4.9.0] - 2025-12-13

### Added

- Added `--ignore-dir` option to exclude directories from processing when using `--input-dir`
  - Accepts comma-separated directory patterns (e.g., `--ignore-dir=libs,vendor,node_modules`)
  - Supports both directory name matching (e.g., `libs` matches any directory named "libs") and relative path matching (e.g., `static/libs` matches only that specific path)
  - Available in CLI and config files (`ignoreDir` property)
  - Config file supports both string (`"ignoreDir": "libs,vendor"`) and array (`"ignoreDir": ["libs", "vendor"]`) formats
  - CLI arguments override config file settings

## [4.8.3] - 2025-12-12

### Fixed

- Fixed `removeAttributeQuotes` adding unwanted space before closing tag when unquoted attribute values end with `/` (e.g., not to result in `<a href=/path/ >` but `<a href=/path/>`)

### Internal

- Added additional test coverage for `removeAttributeQuotes` option

## [4.8.2] - 2025-12-10

### Performance

- Pre-compiled regexes for common special elements (`script`, `style`, `noscript`) in HTML parser to eliminate regex creation overhead during parsing
- Lazy-load heavy dependencies (Terser, Lightning CSS) only when CSS/JS minification is enabled
- Optimized attribute quote counting by replacing two regex operations with single-pass character iteration
- Cached inline element Sets to avoid redundant creation when no custom elements are configured
- Improved attribute processing by replacing O(n²) unshift operations with O(n) push and reverse (faster for elements with many attributes)

## [4.8.1] - 2025-12-10

### Internal

- Moved type definitions and JSDoc comments to follow standard practices
- Added extra context (link to Socket overview) to benchmark comparison table

## [4.8.0] - 2025-12-10

### Added

- Added `removeEmptyElementsExcept` option to preserve specific empty elements when `removeEmptyElements` is enabled
  - Accepts array of element specifications: simple tag names (e.g., `"td"`) or HTML-like markup with attributes (e.g., `"<span aria-hidden='true'>"`)
  - Supports double quotes, single quotes, and unquoted attribute values
  - When attributes are specified, all must match for preservation (additional attributes allowed)
  - Available in API, CLI (`--remove-empty-elements-except`), and web demo
  - Addresses use cases like preserving empty table cells or framework-required empty elements (e.g., Bulma navbar burger)

### Documentation

- Made README and CLI documentation more consistent

## [4.7.1] - 2025-12-09

### Fixed

- Fixed CLI hanging indefinitely when processing empty HTML files
  - Root cause: Empty file content caused incorrect fallthrough to STDIN reading mode
  - Solution: Track whether files were provided as arguments independently of content

## [4.7.0] - 2025-12-07

### Performance

- Added 200-item LRU cache for CSS and JavaScript minification to avoid re-processing identical inline styles/scripts (50–90% faster for pages with repeated content or batch processing)
- Optimized hot-path code for 5–15% faster minification: hoisted RegExp patterns, added fast-path checks for expensive operations, optimized string operations (`trimWhitespace`, whitespace detection, character escaping)

### Internal

- Improved benchmark code quality and test parity: extracted `TEST_TIMEOUT` constant for reuse, added `--minify-urls` flag to both CLI invocations for accurate comparison between HTML Minifier Next and HTML Minifier Terser

## [4.6.3] - 2025-12-06

### Documentation

- Added HTML Minifier Terser to benchmark comparison table for direct comparison with HMN’s original parent
- Added average processing time metrics to benchmarks showing performance across all minifiers
  - Displays average time per successful completion with success rate (e.g., “150 ms (10/10)”)
  - Fastest tool is determined by lowest average time across successful runs
  - Success rate is shown for transparency, allowing users to make informed decisions

### Internal

- Added progress messages for download and processing phases
- Added verbose logging mode (`VERBOSE=true npm run benchmarks`) for debugging
- Updated all benchmark dependencies to latest versions

## [4.6.2] - 2025-12-05

### Documentation

- Clarified `--no-html5` option behavior: enforces legacy inline/block nesting rules that may restructure modern HTML (e.g., moving `<figure>` outside `<a>` elements)

## [4.6.1] - 2025-12-01

### Changed

- Improved parser error handling
  - Added line/column tracking for better error messages
  - Improved `continueOnParseError` to skip problematic characters instead of failing

### Fixed

- Fixed parser hang on HTML with massive attribute values (e.g., large SVG path data)
  - Limited attribute regex input to 20 KB to prevent catastrophic backtracking
  - Attributes exceeding 20 KB are extracted using manual string parsing (preserving all data)
  - Parser now gracefully handles pathological cases in SSR framework output
- Fixed `sortAttributes` incorrectly parsing JSON-LD script content as HTML
  - The `scan()` function (used for attribute sorting analysis) now only recursively processes `text/html` script content
  - JSON-LD and other non-HTML script types are correctly skipped during the scan phase
  - Prevents corruption when using `sortAttributes` with `processScripts: ["application/ld+json"]`

## [4.6.0] - 2025-11-29

### Added

- Added automatic minification for JSON script tags
  - Supports `application/json`, `application/ld+json`, `application/manifest+json`, `application/vnd.geo+json`, `importmap`, and `speculationrules` script types
  - JSON is parsed and re-stringified to remove whitespace
  - When `continueOnMinifyError` is `true` (default), malformed JSON is logged and returned unchanged; when `false`, JSON parse errors throw, consistent with CSS/JS/URL minification

### Internal

- Added preset-related tests

## [4.5.2] - 2025-11-28

### Internal

- Added test coverage for bare returns with `customEventAttributes` option
  - Ensures compatibility with future JavaScript minifiers (oxc-minify, @swc/core) that may handle bare return statements differently than Terser
  - Covers return with function calls, conditional returns, multiple statements with returns, and early return guard patterns
  - Tests framework-specific event attributes (Angular `ng-click`, Vue `@click`, Alpine.js `x-on:click`) with bare returns

## [4.5.1] - 2025-11-28

### Changed

- Removed `conservativeCollapse` from `comprehensive` preset

## [4.5.0] - 2025-11-28

### Added

- Added preset system with two curated configurations:
  - `conservative`: Safe minification suitable for most projects (12 options including whitespace collapsing, comment removal, and doctype normalization)
  - `comprehensive`: More aggressive minification for greater file size reduction (22 options including all conservative options plus attribute quote removal, optional tag removal, class sorting, and more)
- Added `--preset <name>` CLI flag to use presets from command line
- Added `preset` configuration file option to use presets from config files
- Added “conservative” and “comprehensive” preset links to web demo UI
- Added priority system: presets are applied first, then config file options, then CLI flags (allowing preset customization)
- Exported `getPreset()`, `getPresetNames()`, and `presets` from main module for programmatic access

### Documentation

- Added “Presets” section to README with usage examples and priority explanation
- Added `--preset` option to CLI options table in README
- Updated CLI help text to include preset option
- Fixed case in web version (demo)

## [4.4.0] - 2025-11-26

### Added

- Added `partialMarkup` option to support minifying partial HTML fragments such as template includes and SSI fragments
  - Preserves stray end tags (closing tags without corresponding opening tags)
  - Prevents auto-closing of unclosed tags at the end of input
  - Useful for minifying HTML fragments that will be combined with other fragments later
- Added CLI flag `--partial-markup` to enable partial markup mode from command line
- Added `partialMarkup` option to web demo
- Added comprehensive test coverage for partial markup functionality

### Changed

- Updated “Working with invalid markup” section in README to reflect new partial markup support with examples

### Documentation

- Added JSDoc documentation for the `partialMarkup` option
- Added README documentation explaining partial markup use cases

## [4.3.1] - 2025-11-25

### Added

- Added `.editorconfig` file to standardize editor settings across the project (UTF-8 encoding, LF line endings, 2-space tabs, trailing whitespace trimming)

### Changed

- Removed redundant pre-push git hook since tests already run on every commit via pre-commit hook

### Fixed

- Fixed CLI help text descriptions for `--no-html5`, `--no-include-auto-generated-tags`, and `--no-continue-on-minify-error` flags to correctly describe what the flags do when used, rather than describing the default behavior
- Updated README documentation to clarify the behavior of `html5` and `includeAutoGeneratedTags` options in both enabled and disabled states

## [4.3.0] - 2025-11-24

### Added

- Added `continueOnMinifyError` option to control error handling during CSS, JavaScript, and URL minification. When set to `false`, minification errors will throw and may abort processing. When set to `true` (the default), the minifier attempts to recover from errors, preserving the original content when minification fails. This provides users with explicit control over error handling and helps ensure invalid syntax is not silently ignored when strict validation is needed.
- Added CLI flag `--no-continue-on-minify-error` to disable error recovery from the command line
- Added test coverage including error scenarios across CSS, JavaScript, and URL minification

### Changed

- Enabled dynamic setting of Lightning CSS `errorRecovery` based on the `continueOnMinifyError` option (enabled when `continueOnMinifyError` is `true`, disabled when `false`)

### Documentation

- Added JSDoc documentation for the `continueOnMinifyError` option
- Updated documentation of the new option and its interaction with Lightning CSS error recovery
- Updated benchmark configuration to explicitly include the new option

## [4.2.2] - 2025-11-20

### Fixed

- Fixed demo to automatically minify when loading shared URLs with sample code

## [4.2.1] - 2025-11-20

### Internal

- Standardized error variable naming in catch blocks to consistently use `err` throughout the codebase (main source, CLI, and benchmarks)

## [4.2.0] - 2025-11-20

### Added

- Added shareable URL functionality to demo allowing users to bookmark and share minification configurations and code via URL hash fragments with LZ-String compression (supports ~2 KB of HTML with graceful fallback to options-only sharing for larger content)

## [4.1.1] - 2025-11-11

### Fixed

- Fixed TypeScript type definition for `minifyCSS` option to indicate that all Lightning CSS options are optional (wrapped `TransformOptions` with `Partial<>` to match runtime behavior where defaults are provided)

### Internal

- Updated dependencies to latest versions

## [4.1.0] - 2025-11-09

### Added

- Added official TypeScript type definitions generated from JSDoc comments, eliminating the need for the community-maintained `@types/html-minifier-next` package
- Added comprehensive inline documentation for all 50+ minifier options with default values and detailed descriptions
- Added TypeScript compiler as a build step to generate type definitions alongside the existing Rollup build process
- Added TypeScript type definition tests to verify type correctness and prevent regressions

### Changed

- Updated build process to clean the `dist` directory before each build via new `prebuild` script
- Added `@types/relateurl` as a dependency to ensure proper TypeScript type resolution for the `minifyURLs` option
- Updated test suite to include TypeScript type-checking as part of standard test run

### Internal

- Added TypeScript configuration file (`tsconfig.json`) with modern compiler options for declaration generation
- Updated package exports to include TypeScript type definitions path

## [4.0.2] - 2025-11-05

### Changed

- Refreshed demo code and design

### Fixed

- Fixed browser demo loading by using virtual module stub for Lightning CSS instead of externalizing
- Fixed “Select all” functionality to skip disabled options (CSS minification remains disabled)

## [4.0.1] - 2025-11-05

### Removed

- Removed UMD bundles (`htmlminifier.umd.bundle.js` and minified variant) as they were undocumented and incompatible with Lightning CSS browser limitations

### Internal

- Simplified build configuration to ESM bundle (for demo) and CommonJS (for npm package)
- Fixed browser demo build by disabling CSS minification option (Lightning CSS requires Node.js native bindings and cannot run in-browser)

## [4.0.0] - 2025-11-05

### Breaking Changes

- **BREAKING:** Replaced unmaintained clean-css with [Lightning CSS](https://lightningcss.dev/) for CSS minification. This provides better minification and active maintenance, but introduces behavioral changes in CSS output:
  - Selector merging: Identical CSS rules are now merged (e.g., `p.a{color:red}p.b{color:red}` becomes `p.a,p.b{color:red}`)
  - Color normalization: Colors are optimized to shortest format (e.g., `white` becomes `#fff`)
  - Quote removal: Unnecessary quotes are removed from URLs (e.g., `url("image.png")` becomes `url(image.png)`)
  - Pseudo-element normalization: Double colons are normalized to single colons where applicable (e.g., `::before` becomes `:before`)
  - Property reordering: CSS properties may be reordered for better compression
  - Stricter validation: Invalid CSS (including HTML entities in CSS or CDATA markers) may be rejected and returned unminified
  - Previous clean-css options (e.g., `level`, `compatibility`, `format`) are no longer supported
- **BREAKING:** The `minifyCSS` option configuration has changed. Lightning CSS options differ from clean-css options. When passing an object to `minifyCSS`, use Lightning CSS configuration options:
  - `targets`: Browser targets for vendor prefix optimization (e.g., `{ chrome: 95, firefox: 90 }`)
  - `unusedSymbols`: Array of CSS identifiers to remove during minification
  - `errorRecovery`: Boolean to skip invalid CSS rules (disabled in Lightning CSS, but enabled by default in HMN)
  - `sourceMap`: Boolean to generate source maps

### Migration Notes

If you were passing configuration options to `minifyCSS`, review Lightning CSS documentation and update your configuration:

```javascript
// Before (clean-css)
minify(html, {
  minifyCSS: {
    level: 2,
    compatibility: 'ie8'
  }
});

// After (Lightning CSS)
minify(html, {
  minifyCSS: {
    targets: { ie: 11, chrome: 95, firefox: 90 } // Browser targets object
  }
});
```

To disable error recovery for strict CSS validation:

```javascript
minify(html, {
  minifyCSS: {
    errorRecovery: false // Disable error recovery (enabled by default in HMN)
  }
});
```

If you rely on specific CSS output formatting, review your CSS after upgrading as selector order and formatting may change due to better optimization.

### Internal

- Relocated CSS minification tests from html.spec.js to css+js.spec.js to clean up and consolidate test suites

## [3.2.2] - 2025-11-02

### Added

- Added `search` and `selectedcontent` elements to HTML element registry for complete minification support and proper optional tag removal

### Internal

- Added additional ruby-related test

## [3.2.1] - 2025-10-29

### Internal

- Restructured tests
- Added CSS and JS minification tests

## [3.2.0] - 2025-10-29

### Added

- Added `--verbose`/`-v` flag to show active options and file statistics (also automatically enabled with `--dry`)
- Added progress indicator for directory processing in interactive terminals (shows file count and percentage completed; auto-disabled in non-TTY environments and when using `--verbose` or `--dry`)
- Added ESM config file support via dynamic import fallback (`.mjs` files and modules with `"type": "module"`)
- Documented and added tests for `--version`/`-V` flag

### Changed

- Listed CLI options in documentation
- Verbose mode now displays explicitly provided disabled options (e.g., `--no-html5` shows as `no-html5`)

### Fixed

- Fixed numeric option validation to reject invalid input with clear error messages: now rejects non-numeric values (e.g., `--max-line-length=abc`), values with trailing characters (e.g., `--max-line-length=12abc`), and negative numbers (e.g., `--max-line-length=-50`) instead of silently accepting partial numeric prefixes
- Fixed JSON option parsing to properly detect and report malformed array-like inputs (e.g., `--minify-css=[bad, json]`) and JSON with leading whitespace
- Fixed race condition in config file loading by refactoring async option parser to synchronous path capture with explicit post-parse loading, ensuring config is fully loaded and normalized before any minification operations

### Internal

- Restructured README
- Improved return value consistency in `processFile` function (now always returns stats object)
- Added tests for edge cases: EPIPE handling when piping to `head`, output directory nested in input directory (skip traversal logic), and symbolic link handling

## [3.1.0] - 2025-10-27

### Added

- Added `--dry`/`-d` flag for dry run mode: process and report statistics without writing output files

### Changed

- Improved CLI help text and enhanced README documentation for `-o, --output` flag, to clarify what it does and how it works
- Refactored CLI functionality by closing `-o` file streams, skipping symlinks and the output subtree in directory mode, and handling `EPIPE`

### Internal

- Expanded CLI test coverage: STDIN/STDOUT piping, `-o` flag combinations, dry run error handling
- Added minifier tests: `maxInputLength` security option, CSS/JS error handling, `<dialog>` and `<search>` elements
- Enabled cross-platform CI testing (Ubuntu, macOS, Windows)

## [3.0.0] - 2025-10-16

### Breaking Changes

- **BREAKING:** The `removeRedundantAttributes` option now removes significantly more HTML default attribute values. This will result in more aggressive minification when this option is enabled, which may change existing output—keep an eye on CSS selectors, JavaScript queries, and tooling requirements. Newly removed default values include:
  - `autocorrect="on"`, `fetchpriority="auto"`, `loading="eager"`, `popovertargetaction="toggle"`
  - Specific element/attribute combinations: `<button type="submit">`, `<form enctype="application/x-www-form-urlencoded">`, `<form method="get">` (both previously supported, now reorganized), `<html dir="ltr">`, `<img decoding="auto">`, `<input colorspace="limited-srgb">`, `<input type="text">` (previously supported, now reorganized), `<marquee behavior="scroll">`, `<marquee direction="left">`, `<style media="all">`, `<textarea wrap="soft">`, `<track kind="subtitles">`

## [2.1.8] - 2025-10-14

### Fixed

- Fixed HTML parser incorrectly handling `<dt>` and `<dd>` elements when optional closing tags are already omitted in source markup, preventing accumulation of remnant closing tags in output

## [2.1.7] - 2025-10-10

### Changed

- Migrated test suite from Jest to native Node.js `node:test` runner
- Removed glob dependency overrides (no longer needed without Jest)

## [2.1.6] - 2025-10-07

### Added

- Added support for HTML Ruby Markup Extensions ([June 2024 draft](https://www.w3.org/TR/2024/WD-html-ruby-extensions-20240627/)) to handle extended ruby annotation markup
- Added `dialog` and `search` elements to `<p>` end tag omission rules per current HTML specification

### Changed/fixed

- Updated ruby element tag omission logic to correctly handle all conforming elements: `<ruby>`, `<rp>`, `<rt>`, `<rb>`, `<rtc>`
- Improved optional tag removal for ruby elements when `removeOptionalTags` and `collapseWhitespace` options are enabled
- Enhanced whitespace handling to preserve `optionalEndTag` tracking through collapsible whitespace (unless `conservativeCollapse` is enabled)

## [2.1.5] - 2025-09-29

### Fixed

- Fixed issue with `<tfoot>` and `<tbody>` elements breaking HTML structure in nested tables, by ensuring table element closing only occurs within the current table scope (addresses kangax/html-minifier#1163)

## [2.1.4] - 2025-09-20

### Changed

- Replaced Alpine.js npm dependency with CDN for demo page to reduce dev dependencies
- Improved demo safety by not marking unsafe options by default (to prevent invalid HTML output)

## [2.1.3] - 2025-09-14

### Changed

- Cleaned up `.gitignore` file

## [2.1.2] - 2025-09-13

### Changed

- Added linting enforcement to pre-commit hooks to ensure code quality
- Renamed workflow files for clarity: `main.yaml` → `tests.yml`, `pages.yml` → `github-pages.yml`

### Removed

- Removed orphaned `.lintstagedrc.yml` file left from Husky refactoring cleanup
- Removed non-functional `.github/workflows/benchmarks.yml` workflow

## [2.1.1] - 2025-09-13

### Fixed

- Fixed demo not loading in modern browsers due to missing JSON import assertion
- Fixed demo numeric inputs incorrectly rejecting “0” values
- Improved demo numeric input validation and error handling with explicit radix

## [2.1.0] - 2025-09-13

### Added

- Enabled commit message validation using commitlint via commit-msg hook
- Configured flexible commitlint rules supporting both conventional and natural language commit styles

### Changed

- Replaced Husky with native Git hooks for development workflow
- Updated `prepare` script to configure Git hooks path automatically

### Removed

- Removed Husky dependency (2.4kB package size reduction)
- Removed `.husky/` directory in favor of `.githooks/`
- Removed unused `commitlint-config-non-conventional` dependency

### Internal

- Migrated from Husky-managed Git hooks to native `.githooks/` directory
- Maintained identical pre-commit and pre-push test execution
- Simplified development setup with zero external dependencies for Git hooks

## [2.0.0] - 2025-09-12

### Breaking Changes

- **BREAKING:** Removed `HTMLtoXML` and `HTMLtoDOM` functions from the public API. These XML-related functions were outdated and no longer relevant to the library’s focus on HTML minification.
- **BREAKING:** Deep imports to internal modules are no longer supported. Use the main export instead of importing from specific source files.

### Added

- Added `@eslint/js` to development dependencies for improved linting

### Changed

- Updated comment references from “HTML5 elements” to “HTML elements” for accuracy
- Streamlined codebase by removing unused utility functions
- Updated package exports to enforce clean API boundaries

### Removed

- Removed unused HTML conversion functions (`HTMLtoXML`, `HTMLtoDOM`)
- Removed deprecated development dependencies: `is-ci`, `lint-staged`

### Internal

- Cleaned up package.json by removing unused dependencies
- Improved code maintainability by removing legacy XML-related code