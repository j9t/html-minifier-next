# Changelog

As of version 2.0.0, all notable changes to HTML Minifier Next are documented in this file, which is (mostly) AI-generated and (always) human-edited. Dependency updates may or may not be called out specifically.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - 2025-10-28

### Added

- Added `--verbose`/`-v` flag to show active options and file statistics (also automatically enabled with `--dry`)
- Added progress indicator for directory processing in interactive terminals (shows file count and percentage completed); auto-disabled in non-TTY environments and when using `--verbose` or `--dry`
- Added ESM config file support via dynamic import fallback (`.mjs` files and modules with `"type": "module"`)
- Documented and added tests for `--version`/`-V` flag

### Changed

- Listed CLI options in documentation
- Verbose mode now displays explicitly provided disabled options (e.g., `--no-html5` shows as `no-html5`)

### Fixed

- Fixed numeric option validation to reject invalid input with clear error messages: now rejects non-numeric values (e.g., `--max-line-length=abc`), values with trailing characters (e.g., `--max-line-length=12abc`), and negative numbers (e.g., `--max-line-length=-50`) instead of silently accepting partial numeric prefixes
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