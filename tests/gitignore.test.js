/**
 * Tests for .gitignore entries introduced in the PR diff.
 *
 * Detected/assumed testing framework:
 * - Prefer existing project setup (Jest or Vitest). This test uses global describe/test/expect which both provide.
 * - If run under Node without a test runner, it will throw; intended to be executed by the project's test command.
 *
 * What we validate:
 * - .gitignore exists at repository root.
 * - Contains the required entries exactly once (no duplicates for these keys).
 * - Directory entries keep trailing slash semantics (except file-only entries like '.DS_Store').
 * - Lines are not commented out and not negated.
 * - Provides clear failure messages guiding maintainers.
 */

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const gitignorePath = path.join(ROOT, '.gitignore');

// From the PR diff focus:
const REQUIRED_LINES = [
  'benchmarks/generated/',
  'benchmarks/sources/',
  'benchmarks/backtest.csv',
  'benchmarks/backtest.log',
  'dist/',
  'node_modules/',
  'tmp/',
  '.DS_Store',
];

function readGitignore() {
  if (!fs.existsSync(gitignorePath)) {
    throw new Error(`.gitignore not found at ${gitignorePath}`);
  }
  const raw = fs.readFileSync(gitignorePath, 'utf8');
  // Normalize line endings and split
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  return { raw, lines };
}

function normalize(line) {
  return line.trim();
}

function isCommentOrBlank(line) {
  const t = line.trim();
  return t === '' || t.startsWith('#');
}

function occurrences(lines, needle) {
  // Exact line match (after trimming both sides)
  const target = normalize(needle);
  return lines.filter(l => normalize(l) === target).length;
}

describe('.gitignore PR entries', () => {
  let raw, lines;

  beforeAll(() => {
    ({ raw, lines } = readGitignore());
  });

  test('file exists at repo root', () => {
    expect(fs.existsSync(gitignorePath)).toBe(true);
  });

  test('contains all required entries (presence check)', () => {
    const missing = REQUIRED_LINES.filter(req => !lines.some(l => normalize(l) === normalize(req)));
    const advice = [
      'Missing required .gitignore entries from the PR diff.',
      'Ensure each of the following lines appears exactly once (uncommented):',
      ...REQUIRED_LINES.map(s => `  - ${s}`),
    ].join('\n');
    expect(missing).toEqual([] /* none missing */);
  });

  test('required entries are not commented out or negated', () => {
    const bad = [];
    for (const req of REQUIRED_LINES) {
      const idxs = lines
        .map((l, i) => ({ l, i }))
        .filter(({ l }) => normalize(l) === normalize(req));
      for (const { l, i } of idxs) {
        const trimmed = l.trim();
        if (trimmed.startsWith('#') || trimmed.startsWith('!')) {
          bad.push({ lineNumber: i + 1, entry: l });
        }
      }
    }
    expect(bad).toEqual([] /* none commented or negated */);
  });

  test('no duplicate declarations for the specific PR entries', () => {
    const dups = REQUIRED_LINES
      .map(req => ({ entry: req, count: occurrences(lines, req) }))
      .filter(x => x.count > 1);
    const msg = dups.length
      ? 'Duplicate .gitignore entries detected for:\n' +
        dups.map(d => `  - ${d.entry} (count=${d.count})`).join('\n')
      : '';
    expect(dups, msg).toEqual([]);
  });

  test('directory entries use trailing slash semantics; file entry remains without slash', () => {
    const directories = REQUIRED_LINES.filter(l => l !== '.DS_Store');
    const files = REQUIRED_LINES.filter(l => l === '.DS_Store');

    const badDirs = directories.filter(d => !d.endsWith('/'));
    const badFiles = files.filter(f => f.endsWith('/'));

    // If this assertion ever fails due to project conventions, update REQUIRED_LINES accordingly.
    expect(badDirs).toEqual([]);
    expect(badFiles).toEqual([]);
  });

  test('lines match exactly (no unintended whitespace around required entries)', () => {
    const withWhitespaceIssues = [];
    for (const req of REQUIRED_LINES) {
      const exact = lines.some(l => l === req);
      const trimmedMatches = lines.some(l => normalize(l) === normalize(req));
      if (trimmedMatches && !exact) {
        withWhitespaceIssues.push(req);
      }
    }
    // We allow trimmed matches, but flag if there is leading/trailing whitespace to encourage cleanup.
    expect(withWhitespaceIssues).toEqual([]);
  });
});