/* 
Note: Test framework: Jest/Vitest style (describe/test/expect). 
If using Mocha + Chai, you may need to replace `expect` with Chai's expect.
These tests focus on package.json integrity, with emphasis on fields commonly changed in PRs.
*/

const fs = require('fs');
const path = require('path');

function readPkg() {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  return JSON.parse(raw);
}

function isSemverLike(v) {
  // Accepts common semver ranges: ^1.2.3, ~1.2.3, 1.2.3, >=1.2.3 <2, *, latest (edge), etc.
  if (typeof v !== 'string' || !v.trim()) return false;
  const simple = /^(\^|~)?\d+\.\d+\.\d+(-[\w\.-]+)?(\+[\w\.-]+)?$/;        // ^1.2.3 or 1.2.3
  const rangeOps = /^(>=|<=|>|<)?\d+\.\d+\.\d+.*$/;                        // >=1.2.3 <2
  const wildcard = /^\*$/;                                                // *
  const tag = /^(latest|next|beta|rc)$/i;                                 // tags
  return simple.test(v) || rangeOps.test(v) || wildcard.test(v) || tag.test(v);
}

describe('package.json integrity', () => {
  let pkg;
  beforeAll(() => {
    pkg = readPkg();
  });

  test('has valid name and version', () => {
    expect(typeof pkg.name).toBe('string');
    expect(pkg.name.trim().length).toBeGreaterThan(0);
    expect(typeof pkg.version).toBe('string');
    // version may be 0.0.0 in workspaces; still must be semver-like
    expect(isSemverLike(pkg.version)).toBe(true);
  });

  test('scripts contain test script and are non-empty strings', () => {
    expect(pkg.scripts).toBeTruthy();
    expect(typeof pkg.scripts).toBe('object');
    // test script present
    expect(typeof pkg.scripts.test).toBe('string');
    expect(pkg.scripts.test.trim().length).toBeGreaterThan(0);
    // ensure no empty script values
    for (const [k, v] of Object.entries(pkg.scripts)) {
      expect(typeof v).toBe('string');
      expect(v.trim()).not.toHaveLength(0);
    }
  });

  test('engines, if specified, include a Node range that is sensible', () => {
    if (pkg.engines && pkg.engines.node) {
      const node = pkg.engines.node;
      expect(typeof node).toBe('string');
      // Basic sanity: require at least Node 14+ (adjust if project policy differs)
      const matches = node.match(/\d+/g);
      if (matches) {
        const major = parseInt(matches[0], 10);
        expect(Number.isInteger(major)).toBe(true);
        expect(major).toBeGreaterThanOrEqual(14);
      }
    }
  });

  test('type=module coherence: main/module/exports fields make sense', () => {
    const isModule = pkg.type === 'module';
    // If exports present, it should be object or string
    if (pkg.exports !== undefined) {
      const t = typeof pkg.exports;
      expect(['string', 'object']).toContain(t);
    }
    // main/module/types sanity checks
    if (pkg.main) {
      expect(typeof pkg.main).toBe('string');
      expect(pkg.main.trim()).not.toHaveLength(0);
      if (isModule) {
        // ESM packages typically use .js (ESM) and avoid .cjs for main
        expect(pkg.main.endsWith('.cjs')).toBe(false);
      }
    }
    if (pkg.module) {
      expect(typeof pkg.module).toBe('string');
      expect(pkg.module.trim()).not.toHaveLength(0);
      // module should point to ESM build
      expect(pkg.module.endsWith('.mjs') || pkg.module.endsWith('.js')).toBe(true);
    }
    if (pkg.types || pkg.typings) {
      const t = pkg.types || pkg.typings;
      expect(typeof t).toBe('string');
      expect(t.endsWith('.d.ts')).toBe(true);
    }
  });

  test('dependencies/devDependencies use semver-like versions', () => {
    for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const set = pkg[key];
      if (!set) continue;
      expect(typeof set).toBe('object');
      for (const [dep, ver] of Object.entries(set)) {
        expect(typeof dep).toBe('string');
        expect(dep.trim()).not.toHaveLength(0);
        expect(isSemverLike(ver)).toBe(true);
      }
    }
  });

  test('files array, if present, is non-empty and strings do not traverse up', () => {
    if (Array.isArray(pkg.files)) {
      expect(pkg.files.length).toBeGreaterThan(0);
      for (const f of pkg.files) {
        expect(typeof f).toBe('string');
        expect(f.trim()).not.toHaveLength(0);
        expect(f.includes('..')).toBe(false);
      }
    }
  });

  test('repository, license, and author fields (if present) are well-formed', () => {
    if (pkg.repository) {
      if (typeof pkg.repository === 'string') {
        expect(pkg.repository.trim()).not.toHaveLength(0);
      } else {
        expect(typeof pkg.repository).toBe('object');
        expect(typeof pkg.repository.type).toBe('string');
        expect(typeof pkg.repository.url).toBe('string');
        expect(pkg.repository.url.length).toBeGreaterThan(0);
      }
    }
    if (pkg.license) {
      expect(typeof pkg.license).toBe('string');
      expect(pkg.license.trim()).not.toHaveLength(0);
    }
    if (pkg.author) {
      expect(['string', 'object']).toContain(typeof pkg.author);
    }
  });

  test('bin field, if present, points to valid string or map of strings', () => {
    if (pkg.bin) {
      if (typeof pkg.bin === 'string') {
        expect(pkg.bin.trim()).not.toHaveLength(0);
      } else {
        expect(typeof pkg.bin).toBe('object');
        for (const [name, target] of Object.entries(pkg.bin)) {
          expect(typeof name).toBe('string');
          expect(typeof target).toBe('string');
          expect(target.trim()).not.toHaveLength(0);
        }
      }
    }
  });

  test('publishConfig, if present, does not accidentally set access public for private packages', () => {
    if (pkg.private && pkg.publishConfig && pkg.publishConfig.access) {
      expect(pkg.publishConfig.access).not.toBe('public');
    }
  });
});

/**
 * Edge cases and failure conditions:
 * - Invalid JSON will throw before tests run (by design).
 * - Empty or malformed fields cause assertions to fail.
 * - If PR changed `type` to "module" but kept .cjs main, coherence test will surface it.
 */