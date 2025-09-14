/**
 * Changelog structure tests focused on the current PR diff entries.
 *
 * Framework style: Jest/Vitest (describe/it/expect) with Node's fs for file I/O.
 * No external dependencies are introduced.
 */
const fs = require('fs');
const path = require('path');

const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.md');

function readChangelog() {
  expect(fs.existsSync(changelogPath)).toBe(true);
  const content = fs.readFileSync(changelogPath, 'utf8');
  // Normalize line endings for consistent matching
  return content.replace(/\r\n/g, '\n');
}

function getReleaseBlocks(content) {
  // Split by second-level headings "## [x.y.z] - YYYY-MM-DD"
  const regex = new RegExp('^## \\[(\\d+\\.\\d+\\.\\d+)\\] - (\\d{4}-\\d{2}-\\d{2})$', 'gm');
  const releases = [];
  let match;
  while ((match = regex.exec(content)) !== null) {

    const version = match[1];
    const date = match[2];
    const startIdx = match.index;
    const nextIdx = regex.lastIndex;
    // Find end of this release block as the next "## [" heading or end of string
    const nextMatch = regex.exec(content);
    const endIdx = nextMatch ? nextMatch.index : content.length;
    // Reset lastIndex to continue outer while loop correctly
    if (nextMatch) regex.lastIndex = nextMatch.index;
    const block = content.slice(startIdx, endIdx);
    releases.push({ version, date, block });
  }
  return releases;
}

describe('CHANGELOG.md (diff-focused validation)', () => {
  let content;
  let releases;

  beforeAll(() => {
    content = readChangelog();
    releases = getReleaseBlocks(content);
  });

  it('has a top-level title and references Keep a Changelog and SemVer', () => {
    expect(content).toMatch(/^# Changelog$/m);
    expect(content).toMatch(/\[Keep a Changelog\]\(https:\/\/keepachangelog\.com\/en\/1\.0\.0\/\)/);
    expect(content).toMatch(/\[Semantic Versioning\]\(https:\/\/semver\.org\/spec\/v2\.0\.0\.html\)/);
  });

  it('lists releases with proper heading format "## [x.y.z] - YYYY-MM-DD"', () => {

    expect(releases.length).toBeGreaterThanOrEqual(5);
    for (const r of releases) {

      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('orders versions descending (newest first) and dates are non-increasing', () => {

    const toNum = v => v.split('.').reduce((acc, part, i) => acc + Number(part) / Math.pow(1000, i), 0);

    let lastVersionNum = Infinity;

    let lastDate = '9999-12-31';

    for (const r of releases) {

      const verNum = toNum(r.version);

      expect(verNum).toBeLessThanOrEqual(lastVersionNum);

      expect(r.date <= lastDate).toBe(true);

      lastVersionNum = verNum;

      lastDate = r.date;

    }

  });

  describe('2.1.3 - 2025-09-14 (Changed)', () => {

    let block;

    beforeAll(() => {

      block = releases.find(r => r.version === '2.1.3' && r.date === '2025-09-14')?.block || '';

    });

    it('exists with a Changed section and includes the .gitignore clean-up', () => {

      expect(block).toContain('## [2.1.3] - 2025-09-14');

      expect(block).toMatch(/^### Changed$/m);

      expect(block).toMatch(/Radically cleaned up `\.gitignore` file/);

    });

  });

  describe('2.1.2 - 2025-09-13 (Changed/Removed)', () => {

    let block;

    beforeAll(() => {

      block = releases.find(r => r.version === '2.1.2' && r.date === '2025-09-13')?.block || '';

    });

    it('contains the Changed section entries (linting in pre-commit, workflow rename)', () => {

      expect(block).toContain('## [2.1.2] - 2025-09-13');

      expect(block).toMatch(/^### Changed$/m);

      expect(block).toMatch(/Added linting enforcement to pre-commit hooks/);

      expect(block).toMatch(/Renamed workflow files for clarity: `main\.yaml` → `tests\.yml`, `pages\.yml` → `github-pages\.yml`/);

    });



    it('contains the Removed section entries (orphaned lintstagedrc and benchmarks workflow)', () => {

      expect(block).toMatch(/^### Removed$/m);

      expect(block).toMatch(/Removed orphaned `\.lintstagedrc\.yml` file/);

      expect(block).toMatch(/Removed non-functional `\.github\/workflows\/benchmarks\.yml` workflow/);

    });

  });

  describe('2.1.1 - 2025-09-13 (Fixed)', () => {

    let block;

    beforeAll(() => {

      block = releases.find(r => r.version === '2.1.1' && r.date === '2025-09-13')?.block || '';

    });

    it('captures the demo fixes and validation improvements', () => {

      expect(block).toContain('## [2.1.1] - 2025-09-13');

      expect(block).toMatch(/^### Fixed$/m);

      expect(block).toMatch(/demo not loading .* missing JSON import assertion/i);

      expect(block).toMatch(/incorrectly rejecting “0” values/);

      expect(block).toMatch(/explicit radix/);

    });

  });

  describe('2.1.0 - 2025-09-13 (Added/Changed/Removed/Internal)', () => {

    let block;

    beforeAll(() => {

      block = releases.find(r => r.version === '2.1.0' && r.date === '2025-09-13')?.block || '';

    });

    it('notes commitlint enablement and flexible rules', () => {

      expect(block).toContain('## [2.1.0] - 2025-09-13');

      expect(block).toMatch(/^### Added$/m);

      expect(block).toMatch(/Enabled commit message validation using commitlint/);

      expect(block).toMatch(/flexible commitlint rules supporting both conventional and natural language/);

    });



    it('documents migration from Husky to native Git hooks and prepare script update', () => {

      expect(block).toMatch(/^### Changed$/m);

      expect(block).toMatch(/Replaced Husky with native Git hooks/);

      expect(block).toMatch(/Updated `prepare` script to configure Git hooks path automatically/);

    });



    it('records removed Husky dependency and related directories/packages', () => {

      expect(block).toMatch(/^### Removed$/m);

      expect(block).toMatch(/Removed Husky dependency/);

      expect(block).toMatch(/Removed `\.husky\/` directory/);

      expect(block).toMatch(/Removed unused `commitlint-config-non-conventional` dependency/);

    });



    it('captures internal notes on hook migration and setup simplification', () => {

      expect(block).toMatch(/^### Internal$/m);

      expect(block).toMatch(/Migrated from Husky-managed Git hooks to native `\.githooks\/` directory/);

      expect(block).toMatch(/Simplified development setup with zero external dependencies for Git hooks/);

    });

  });

  describe('2.0.0 - 2025-09-12 (Breaking/Added/Changed/Removed/Internal)', () => {

    let block;

    beforeAll(() => {

      block = releases.find(r => r.version === '2.0.0' && r.date === '2025-09-12')?.block || '';

    });

    it('highlights breaking changes (removed HTMLtoXML/HTMLtoDOM and deep imports)', () => {

      expect(block).toContain('## [2.0.0] - 2025-09-12');

      expect(block).toMatch(/^### Breaking Changes$/m);

      expect(block).toMatch(/Removed `HTMLtoXML` and `HTMLtoDOM` functions/);

      expect(block).toMatch(/Deep imports to internal modules are no longer supported/);

    });



    it('notes added @eslint/js in dev dependencies', () => {

      expect(block).toMatch(/^### Added$/m);

      expect(block).toMatch(/Added `@eslint\/js` to development dependencies/);

    });



    it('captures general changes and API boundary enforcement', () => {

      expect(block).toMatch(/^### Changed$/m);

      expect(block).toMatch(/Updated comment references from “HTML5 elements” to “HTML elements”/);

      expect(block).toMatch(/Updated package exports to enforce clean API boundaries/);

    });



    it('records removed conversion functions and deprecated dev dependencies', () => {

      expect(block).toMatch(/^### Removed$/m);

      expect(block).toMatch(/Removed unused HTML conversion functions/);

      expect(block).toMatch(/Removed deprecated development dependencies: `is-ci`, `lint-staged`/);

    });



    it('includes internal maintenance notes', () => {

      expect(block).toMatch(/^### Internal$/m);

      expect(block).toMatch(/Cleaned up package\.json by removing unused dependencies/);

    });

  });

  describe('Defensive checks', () => {

    it('does not contain obvious placeholder tokens or unresolved merge markers', () => {

      const badPatterns = [/<<<<<</, />>>>>>/, /=====/, /\{TBD\}/i, /\(WIP\)/i];

      for (const p of badPatterns) {

        expect(content).not.toMatch(p);

      }

    });



    it('uses consistent list formatting for entries under each subsection', () => {

      // For each subsection, ensure lines start with "- " for bullets

      const subsectionHeadings = [/^### Added$/m, /^### Changed$/m, /^### Removed$/m, /^### Fixed$/m, /^### Internal$/m, /^### Breaking Changes$/m];
      subsectionHeadings.forEach((h) => {
        const idx = content.search(h);
        if (idx !== -1) {
          const NL = String.fromCharCode(10);
          const after = content.slice(idx).split(NL).slice(1, 12).join(NL); // check next ~10 lines
          // Accept empty subsections (no strict failure), but if bullets exist they should start with "- "
          const hasBullet = /^(?:- |\* )/m.test(after);
          if (hasBullet) {
            const badBullet = /^(?!- |\* ).+$/m.test(after);
            expect(badBullet).toBe(false);
          }
        }
      });

    });

  });

});