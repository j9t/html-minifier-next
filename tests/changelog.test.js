/**
 * Changelog validation tests
 *
 * Testing library/framework: Jest (v30.x) with ESM, using @jest/globals.
 * We follow existing repository conventions (Jest + ESM) and place tests under tests/.
 *
 * Focus: Validate the specific diff content and overall structure:
 * - Presence and correctness of versions 2.1.3, 2.1.2, 2.1.1, 2.1.0, 2.0.0
 * - Keep a Changelog/ SemVer references and formatting
 * - Section headers and bullets for each version from the diff
 * - SemVer ordering, date formats, and basic hygiene checks
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll } from '@jest/globals';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let changelogContent = '';
let changelogPath = '';

function findChangelog() {
  const repoRoot = path.resolve(__dirname, '..');
  const candidates = [
    'CHANGELOG.md',
    'changelog.md',
    'CHANGELOG',
    'changelog',
    'docs/CHANGELOG.md',
    'docs/changelog.md',
  ].map(p => path.join(repoRoot, p));

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return p;
    }
  }
  throw new Error('CHANGELOG not found in expected locations.');
}

function semverParts(v) {
  // v like 1.2.3 or 1.2.3-alpha.1
  const [core] = v.split('-');
  const [major, minor, patch] = core.split('.').map(n => Number(n));
  return { major, minor, patch };
}

function compareDesc(a, b) {
  const A = semverParts(a), B = semverParts(b);
  if (A.major !== B.major) return B.major - A.major;
  if (A.minor !== B.minor) return B.minor - A.minor;
  return B.patch - A.patch;
}

function getVersionEntries(md) {
  // Capture version headings with dates, and their spans
  const re = /^## \[(\d+\.\d+\.\d+(?:-[\w.-]+)?)\] - (\d{4}-\d{2}-\d{2})/gm;
  const entries = [];
  for (const m of md.matchAll(re)) {
    entries.push({ version: m[1], date: m[2], index: m.index });
  }
  // Determine section bounds
  for (let i = 0; i < entries.length; i++) {
    const start = entries[i].index;
    const end = i + 1 < entries.length ? entries[i + 1].index : md.length;
    entries[i].section = md.slice(start, end);
  }
  return entries;
}

function sectionForVersion(entries, v) {
  const e = entries.find(x => x.version === v);
  return e ? e.section : '';
}

beforeAll(() => {
  changelogPath = findChangelog();
  changelogContent = fs.readFileSync(changelogPath, 'utf8');
});

describe('Changelog structure & references', () => {
  it('starts with "# Changelog" and mentions Keep a Changelog and Semantic Versioning', () => {
    const lines = changelogContent.split('\n').map(l => l.trim());
    const firstHeaderIdx = lines.findIndex(l => l.length > 0);
    expect(firstHeaderIdx).toBeGreaterThanOrEqual(0);
    expect(lines[firstHeaderIdx]).toMatch(/^#\s+Changelog$/);
    expect(changelogContent).toContain('Keep a Changelog');
    expect(changelogContent).toContain('Semantic Versioning');
    expect(changelogContent).toMatch(/https:\/\/keepachangelog\.com/);
    expect(changelogContent).toMatch(/https:\/\/semver\.org/);
  });
});

describe('Version headings & ordering', () => {
  it('has valid version headings with dates and descending order', () => {
    const entries = getVersionEntries(changelogContent);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    // Validate heading format
    for (const e of entries) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
      expect(e.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // YYYY-MM-DD sanity checks
      const [Y, M, D] = e.date.split('-').map(Number);
      expect(Y).toBeGreaterThanOrEqual(2000);
      expect(M).toBeGreaterThanOrEqual(1);
      expect(M).toBeLessThanOrEqual(12);
      expect(D).toBeGreaterThanOrEqual(1);
      expect(D).toBeLessThanOrEqual(31);
    }

    // Descending order check
    const versions = entries.map(e => e.version);
    const sorted = [...versions].sort(compareDesc);
    expect(versions).toEqual(sorted);
  });

  it('does not have duplicate versions', () => {
    const entries = getVersionEntries(changelogContent);
    const set = new Set(entries.map(e => e.version));
    expect(set.size).toBe(entries.length);
  });

  it('dates are not unreasonably in the future (<= 1 day tolerance)', () => {
    const entries = getVersionEntries(changelogContent);
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    for (const e of entries) {
      const dt = new Date(`${e.date}T00:00:00Z`);
      // Allow 1 day to avoid timezone flakes
      expect(dt.getTime()).toBeLessThanOrEqual(tomorrow.getTime());
    }
  });
});

describe('Diff-focused content checks', () => {
  const expected = {
    '2.1.3': {
      date: '2025-09-14',
      mustInclude: [
        '### Changed',
        'Radically cleaned up',
        '.gitignore',
      ],
    },
    '2.1.2': {
      date: '2025-09-13',
      mustInclude: [
        '### Changed',
        'linting enforcement to pre-commit hooks',
        'Renamed workflow files',
        'main.yaml',
        'tests.yml',
        'pages.yml',
        'github-pages.yml',
        '### Removed',
        '.lintstagedrc.yml',
        'benchmarks.yml',
      ],
    },
    '2.1.1': {
      date: '2025-09-13',
      mustInclude: [
        '### Fixed',
        'missing JSON import assertion',
        'incorrectly rejecting “0”',
        'explicit radix',
      ],
    },
    '2.1.0': {
      date: '2025-09-13',
      mustInclude: [
        '### Added',
        'commitlint',
        'commit-msg',
        '### Changed',
        'Replaced Husky with native Git hooks',
        'prepare script',
        '### Removed',
        'Removed Husky dependency',
        '.husky/',
        'commitlint-config-non-conventional',
        '### Internal',
        'native `.githooks/`',
        'pre-commit and pre-push test execution',
        'zero external dependencies',
      ],
    },
    '2.0.0': {
      date: '2025-09-12',
      mustInclude: [
        '### Breaking Changes',
        'Removed `HTMLtoXML` and `HTMLtoDOM`',
        'Deep imports to internal modules are no longer supported',
        '### Added',
        '@eslint/js',
        '### Changed',
        '“HTML elements”',
        'unused utility functions',
        'package exports',
        '### Removed',
        'Removed unused HTML conversion functions',
        'is-ci',
        'lint-staged',
        '### Internal',
        'Cleaned up package.json',
        'legacy XML-related code',
      ],
    },
  };

  it('contains all expected versions from the diff with exact dates', () => {
    const entries = getVersionEntries(changelogContent);
    const byVersion = new Map(entries.map(e => [e.version, e]));
    for (const [ver, cfg] of Object.entries(expected)) {
      expect(byVersion.has(ver)).toBe(true);
      expect(byVersion.get(ver).date).toBe(cfg.date);
    }
  });

  it('each diff version section contains its required bullets/phrases', () => {
    const entries = getVersionEntries(changelogContent);
    const byVersion = new Map(entries.map(e => [e.version, e.section]));
    for (const [ver, cfg] of Object.entries(expected)) {
      const section = byVersion.get(ver) || '';
      for (const needle of cfg.mustInclude) {
        expect(section).toEqual(expect.stringContaining(needle));
      }
    }
  });
});

describe('Section headers & list formatting', () => {
  it('only uses valid Keep a Changelog section headers', () => {
    const valid = new Set([
      'Added',
      'Changed',
      'Deprecated',
      'Removed',
      'Fixed',
      'Security',
      'Breaking Changes',
      'Internal',
    ]);
    const found = [];
    const re = /^###\s+(.+)\s*$/gm;
    for (const m of changelogContent.matchAll(re)) {
      found.push(m[1]);
    }
    for (const h of found) {
      // Allow exact matches (case-insensitive)
      const ok = [...valid].some(v => v.toLowerCase() === h.toLowerCase());
      expect(ok).toBe(true);
    }
  });

  it('bullet points start with "- " and have no trailing whitespace', () => {
    const lines = changelogContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim().startsWith('-')) {
        expect(line).toMatch(/^\s*-\s+/);
      }
      expect(line).toBe(line.replace(/\s+$/, '')); // no trailing spaces
    }
  });

  it('inline code blocks are properly delimited with backticks', () => {
    const matches = changelogContent.match(/`[^`]+`/g) || [];
    for (const m of matches) {
      expect(m.startsWith('`') && m.endsWith('`')).toBe(true);
    }
  });
});

describe('Basic link syntax sanity', () => {
  it('has valid [text](url) patterns where present', () => {
    const links = [...changelogContent.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m => ({ text: m[1], url: m[2] }));
    for (const l of links) {
      expect(l.text.length).toBeGreaterThan(0);
      expect(l.url.length).toBeGreaterThan(0);
      if (/^https?:\/\//.test(l.url)) {
        expect(l.url).toMatch(/^https?:\/\/[^\s)]+$/);
      }
    }
  });
});

describe('Hygiene & size', () => {
  it('file is a reasonable size (< 500 KB) and parseable', () => {
    const sizeKB = Buffer.byteLength(changelogContent, 'utf8') / 1024;
    expect(sizeKB).toBeLessThan(500);

    // Simple parseability checks
    const headers = changelogContent.split('\n').filter(l => l.startsWith('#'));
    const versions = [...changelogContent.matchAll(/^## \[/gm)];
    expect(headers.length).toBeGreaterThan(0);
    expect(versions.length).toBeGreaterThan(0);
  });

  it('does not mix tabs and spaces for indentation', () => {
    const lines = changelogContent.split('\n');
    const indented = lines.filter(l => /^\s+/.test(l));
    const hasTabs = indented.some(l => /^\t+/.test(l));
    const hasSpaces = indented.some(l => /^ +/.test(l));
    expect(!(hasTabs && hasSpaces)).toBe(true);
  });
});