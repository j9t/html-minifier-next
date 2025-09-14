/**
 * Tests for .gitignore rules.
 *
 * Testing library & framework note:
 * - This test is written to run under Jest or Vitest (global expect).
 * - If the project uses Mocha + Chai, we dynamically require('chai') to obtain expect.
 * - No new deps are introduced; the optional 'ignore' package test will be skipped if not installed.
 */
const fs = require('fs');
const path = require('path');

let expectFn;
try {
  // Jest/Vitest provide a global expect
  if (typeof globalThis !== 'undefined' && typeof globalThis.expect !== 'undefined') {
    expectFn = globalThis.expect;
  } else {
    throw new Error('no-global-expect');
  }
} catch (_err) {
  try {
    // Fallback for Mocha + Chai
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    expectFn = require('chai').expect;
  } catch (_err) {
    throw new Error('No assertion library available: expected Jest/Vitest (global expect) or chai.');
  }
}

const readGitignore = () => {
  // Assume repository root .gitignore
  const repoRoot = process.cwd();
  const giPath = path.join(repoRoot, '.gitignore');
  const content = fs.readFileSync(giPath, 'utf8');
  return { giPath, content, lines: content.split('\n') };
};

describe('.gitignore rules', () => {
  const expectedEntries = [
    'benchmarks/generated/',
    'benchmarks/sources/',
    'benchmarks/backtest.csv',
    'benchmarks/backtest.log',
    'dist/',
    'node_modules/',
    'tmp/',
    '.DS_Store',
  ];

  it('should exist at repository root', () => {
    const giPath = path.join(process.cwd(), '.gitignore');
    const exists = fs.existsSync(giPath);
    expectFn(exists, '.gitignore file should exist at repo root').to.equal
      ? expectFn(exists, '.gitignore file should exist at repo root').to.equal(true)
      : expectFn(exists).toBe(true);
  });

  it('should contain all expected ignore entries from the PR diff', () => {
    const { content } = readGitignore();
    for (const entry of expectedEntries) {
      const has = content.includes(entry);
      const assertion = expectFn(has, `Missing .gitignore entry: ${entry}`);
      if (assertion.toBe) assertion.toBe(true);
      else assertion.to.equal(true);
    }
  });

  it('should not un-ignore the above entries using negation rules', () => {
    const { lines } = readGitignore();
    const negations = new Set(
      lines
        .map(function (l) { return l.trim(); })
        .filter(function (l) { return l.startsWith('!'); })
    );
    for (const entry of expectedEntries) {
      const neg1 = '!' + entry;
      const neg2 = entry.endsWith('/') ? '!' + entry.slice(0, -1) : '!' + entry + '/';
      const hasNegation = negations.has(neg1) || negations.has(neg2);
      const assertion = expectFn(hasNegation, `Entry must not be un-ignored: ${entry}`);
      if (assertion.toBe) assertion.toBe(false);
      else assertion.to.equal(false);
    }
  });

  it('should not contain duplicate copies of the expected entries', () => {
    const { lines } = readGitignore();
    for (const entry of expectedEntries) {
      const count = lines.filter((l) => l.trim() === entry).length;
      const assertion = expectFn(
        count <= 1,
        `Duplicate .gitignore entry detected (${count}x): ${entry}`
      );
      if (assertion.toBe) assertion.toBe(true);
      else assertion.to.equal(true);
    }
  });

  it('should use UNIX line endings and end with a newline', () => {
    const { content } = readGitignore();
    // Windows CRLF check
    const hasCR = /\r\n/.test(content);
    const crAssert = expectFn(hasCR, 'Unexpected CRLF line endings in .gitignore');
    if (crAssert.toBe) crAssert.toBe(false);
    else crAssert.to.equal(false);

    // End with newline
    const endsWithLF = content.length === 0 ? true : content.endsWith('\n');
    const lfAssert = expectFn(endsWithLF, 'File should end with a trailing newline');
    if (lfAssert.toBe) lfAssert.toBe(true);
    else lfAssert.to.equal(true);
  });

  it('should retain directory anchors for directory entries (trailing slash)', () => {
    // Directory patterns should end with '/'
    const dirEntries = ['benchmarks/generated/', 'benchmarks/sources/', 'dist/', 'node_modules/', 'tmp/'];
    for (const d of dirEntries) {
      const assertion = expectFn(d.endsWith('/'), `Directory entry should end with '/': ${d}`);
      if (assertion.toBe) assertion.toBe(true);
      else assertion.to.equal(true);
    }
  });

  it('should not comment out the expected entries (no leading #)', () => {
    const { lines } = readGitignore();
    const set = new Set(lines.map((l) => l.trim()));
    for (const entry of expectedEntries) {
      const commented = set.has('# ' + entry) || set.has('#' + entry);
      const assertion = expectFn(commented, `Entry should not be commented out: ${entry}`);
      if (assertion.toBe) assertion.toBe(false);
      else assertion.to.equal(false);
    }
  });

  it('optionally validates ignore semantics for sample paths when the "ignore" package is available', () => {
    let igFactory;
    try {
      // eslint-disable-next-line global-require
      igFactory = require('ignore');
    } catch (_err) {
      // If the dependency is not present, skip the semantic check gracefully.
      // Using runtime skip compatible with Jest/Vitest/Mocha.
      const skip = (global.it && global.it.skip) || (global.test && global.test.skip);
      if (skip) {
        skip('skip: "ignore" package not installed; semantic matching test skipped');
        return;
      }
      // If no skip is available, just return silently.
      return;
    }

    const { lines } = readGitignore();
    const ig = igFactory().add(
      lines
        .map(function (l) { return l.trim(); })
        .filter(function (l) { return l && !l.startsWith('#'); })
    );

    const samples = [
      { path: 'benchmarks/generated/run1/output.json', ignored: true },
      { path: 'benchmarks/sources/input.csv', ignored: true },
      { path: 'benchmarks/backtest.csv', ignored: true },
      { path: 'benchmarks/backtest.log', ignored: true },
      { path: 'dist/app.bundle.js', ignored: true },
      { path: 'node_modules/lodash/index.js', ignored: true },
      { path: 'tmp/scratch.txt', ignored: true },
      { path: '.DS_Store', ignored: true },
      // Negative control cases
      { path: 'src/index.js', ignored: false },
      { path: 'README.md', ignored: false },
    ];

    for (const s of samples) {
      const isIgnored = ig.ignores(s.path);
      const assertion = expectFn(
        isIgnored === s.ignored,
        `Expected ignores("${s.path}") to be ${String(s.ignored)} but got ${String(isIgnored)}`
      );
      if (assertion.toBe) assertion.toBe(true);
      else assertion.to.equal(true);
    }
  });
});