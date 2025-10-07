# Changelog

As of version 2.0.0, all notable changes to HTML Minifier Next are documented in this file, which is (mostly) AI-generated and (always) human-edited. Dependency updates may or may not be called out specifically.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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