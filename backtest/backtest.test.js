import { describe, test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { BROTLI_QUALITY, GZIP_LEVEL } from './compression.js';
import { formatChange, formatResults, historicalDeps, ordinal, parseRange } from './backtest.js';

describe('Backtest', () => {
  describe('`parseRange`', () => {
    test('A count alone samples every commit', () => {
      assert.deepStrictEqual(parseRange('100'), { count: 100, step: 1 });
    });

    test('A count and a step are read', () => {
      assert.deepStrictEqual(parseRange('500/10'), { count: 500, step: 10 });
    });

    test('Counts and steps that are not positive integers are rejected', () => {
      for (const arg of ['0', '-5', 'all', '/2', '10abc', '1.5']) {
        assert.throws(() => parseRange(arg), /Invalid commit count/, arg);
      }
      for (const arg of ['5/0', '5/-1', '5/x', '5/', '50/2x']) {
        assert.throws(() => parseRange(arg), /Invalid step/, arg);
      }
    });

    test('Leading zeros are still read as numbers', () => {
      assert.deepStrictEqual(parseRange('010/02'), { count: 10, step: 2 });
    });

    test('More than one slash is rejected', () => {
      assert.throws(() => parseRange('1/2/3'), /Invalid format/);
    });
  });

  describe('`ordinal`', () => {
    test('Suffixes follow English usage, including the teens', () => {
      const cases = [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [23, '23rd'], [101, '101st'], [111, '111th']];
      for (const [n, expected] of cases) {
        assert.strictEqual(ordinal(n), expected);
      }
    });
  });

  describe('`formatChange`', () => {
    test('Nothing is shown without an older value, or for a change that rounds to zero', () => {
      assert.strictEqual(formatChange(100, undefined), '');
      assert.strictEqual(formatChange(100, 0), '');
      assert.strictEqual(formatChange(100, 100), '');
      assert.strictEqual(formatChange(100001, 100000), '');
      assert.strictEqual(formatChange(99999, 100000), '');
    });

    test('A change is shown with its sign and two decimals', () => {
      assert.strictEqual(formatChange(101, 100), ' (+1.00%)');
      assert.strictEqual(formatChange(90, 100), ' (-10.00%)');
    });
  });

  describe('`formatResults`', () => {
    // Deliberately not in date order, and with “Site B” missing from the middle commit
    const table = {
      aaa1111: {
        date: '2026-09-01 10:00:00 +0200',
        'Site A': { size: 1000, gzip: 400, brotli: 300, time: 10 },
        'Site B': { size: 2000, gzip: 800, brotli: 700, time: 20 }
      },
      ccc3333: {
        date: '2026-09-03 10:00:00 +0200',
        'Site A': { size: 990, gzip: 400, brotli: 303, time: 10 },
        'Site B': { size: 1900, gzip: 800, brotli: 700, time: 20 }
      },
      bbb2222: {
        date: '2026-09-02 10:00:00 +0200',
        'Site A': { size: 1000, gzip: 404, brotli: 300, time: 12 }
      }
    };
    const results = formatResults(table, ['Site A', 'Site B'], 2, new Date('2026-09-14T12:00:00Z'));

    test('The summary names the run and the compression levels', () => {
      assert.deepStrictEqual(results.summary, {
        commits: 3,
        step: 2,
        sites: 2,
        compression: { gzip: GZIP_LEVEL, brotli: BROTLI_QUALITY },
        generated: '2026-09-14'
      });
    });

    test('Commits are listed newest first, each compared to the next older one', () => {
      assert.deepStrictEqual(results.sites['Site A'], {
        '2026-09-03 10:00 ccc3333': '990 (-1.00%) · Gzip 400 (-0.99%) · Brotli 303 (+1.00%) @ 10 ms (-16.67%)',
        '2026-09-02 10:00 bbb2222': '1,000 · Gzip 404 (+1.00%) · Brotli 300 @ 12 ms (+20.00%)',
        '2026-09-01 10:00 aaa1111': '1,000 · Gzip 400 · Brotli 300 @ 10 ms'
      });
      assert.deepStrictEqual(Object.keys(results.sites['Site A']), [
        '2026-09-03 10:00 ccc3333',
        '2026-09-02 10:00 bbb2222',
        '2026-09-01 10:00 aaa1111'
      ]);
    });

    test('A commit without a site’s result is skipped in the comparison', () => {
      assert.deepStrictEqual(results.sites['Site B'], {
        '2026-09-03 10:00 ccc3333': '1,900 (-5.00%) · Gzip 800 · Brotli 700 @ 20 ms',
        '2026-09-01 10:00 aaa1111': '2,000 · Gzip 800 · Brotli 700 @ 20 ms'
      });
    });
  });
});

describe('Git walk', () => {
  const dirBacktest = path.dirname(fileURLToPath(import.meta.url));
  const inputs = { alpha: '<p>Alpha</p>', beta: '<p>Beta</p>' };

  // Each commit’s minifier prefixes its own marker and the config’s, so a result shows which source and config produced it
  function stub(marker, { failOn } = {}) {
    return `export async function minify(html, options) {
${failOn ? `  if (html.includes('${failOn}')) throw new Error('Stub failure');\n` : ''}  return '${marker}' + options.marker + html;
}`;
  }

  async function write(dir, file, content) {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await fs.writeFile(path.join(dir, file), content);
  }

  function exec(command, args, options) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      proc.stdout.setEncoding('utf8').on('data', (data) => { stdout += data; });
      proc.stderr.setEncoding('utf8').on('data', (data) => { stderr += data; });
      proc.on('error', reject);
      proc.on('close', (code) => resolve({ code, stdout, stderr }));
    });
  }

  async function git(dir, ...args) {
    const { code, stdout, stderr } = await exec('git', ['-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd: dir });
    assert.strictEqual(code, 0, `git ${args.join(' ')}: ${stderr}`);
    return stdout.trim();
  }

  async function commit(dir, day) {
    const date = `2026-01-0${day} 10:00:00 +0000`;
    await git(dir, 'add', '-A');
    const identity = { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' };
    const { code, stderr } = await exec('git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', `Commit ${day}`], {
      cwd: dir,
      env: { ...process.env, ...identity, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
    });
    assert.strictEqual(code, 0, `git commit: ${stderr}`);
    return await git(dir, 'rev-parse', '--short', 'HEAD');
  }

  // A repository of three commits, with the real backtest.js copied in and
  // everything it would fetch stubbed: the oldest commit names its config
  // the old way and fails on beta, the middle one adds a file HEAD lacks
  async function createFixture(t) {
    const dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'hmn-backtest-')));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    await git(dir, 'init', '-q');

    await write(dir, 'package.json', JSON.stringify({ type: 'module' }));
    await write(dir, 'src/htmlminifier.js', stub('A', { failOn: 'Beta' }));
    await write(dir, 'backtest/html-minifier.json', JSON.stringify({ marker: 'old' }));
    const hashes = [await commit(dir, 1)];

    await write(dir, 'src/htmlminifier.js', stub('BB'));
    await write(dir, 'src/extra.js', '');
    await fs.rm(path.join(dir, 'backtest/html-minifier.json'));
    await write(dir, 'backtest/html-minifier-next.config.json', JSON.stringify({ marker: 'new!' }));
    hashes.push(await commit(dir, 2));

    await write(dir, 'src/htmlminifier.js', stub('CCC'));
    await fs.rm(path.join(dir, 'src/extra.js'));
    hashes.push(await commit(dir, 3));

    // Untracked, as in the real repository
    for (const file of ['backtest.js', 'compression.js', 'package.json']) {
      await fs.copyFile(path.join(dirBacktest, file), path.join(dir, 'backtest', file));
    }
    await write(dir, 'backtest/sites.json', JSON.stringify({ alpha: 'https://alpha.example/', beta: 'https://beta.example/' }));
    for (const [name, html] of Object.entries(inputs)) {
      await write(dir, `backtest/input/${name}.html`, html);
    }
    await write(dir, 'backtest/node_modules/progress/package.json', JSON.stringify({ name: 'progress', main: 'index.js' }));
    await write(dir, 'backtest/node_modules/progress/index.js', 'module.exports = class { tick() {} };');
    // All present but the first, whose install goes to an npm stub that records its arguments and fails
    for (const dep of historicalDeps.slice(1)) {
      await fs.mkdir(path.join(dir, 'node_modules', dep), { recursive: true });
    }
    await write(dir, 'bin/npm', '#!/bin/sh\necho "$@" > "$(dirname "$0")/npm-args.txt"\necho "npm stub failure" >&2\nexit 1\n');
    await fs.chmod(path.join(dir, 'bin/npm'), 0o755);
    await write(dir, 'bin/npm.cmd', '@echo %*> "%~dp0npm-args.txt"\r\n@echo npm stub failure 1>&2\r\n@exit /b 1\r\n');

    return { dir, hashes };
  }

  function runBacktest(dir, ...args) {
    const keyPath = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
    const env = { ...process.env, [keyPath]: path.join(dir, 'bin') + path.delimiter + process.env[keyPath] };
    return exec(process.execPath, ['backtest.js', ...args], { cwd: path.join(dir, 'backtest'), env });
  }

  // Tracked files the backtest checks out, as changed against HEAD
  function status(dir) {
    return git(dir, 'status', '--porcelain', '--', 'src', 'package.json', 'backtest/html-minifier-next.config.json');
  }

  test('Minifies each commit with its own source and config, then restores the working tree', { timeout: 60000 }, async (t) => {
    const { dir, hashes } = await createFixture(t);
    const { code, stderr } = await runBacktest(dir, '3');
    assert.strictEqual(code, 0, stderr);

    const results = JSON.parse(await fs.readFile(path.join(dir, 'backtest/results.json'), 'utf8'));
    assert.strictEqual(results.summary.commits, 3);
    // Size per commit, keyed by hash (each key ends in one)
    const sizes = name => Object.fromEntries(Object.entries(results.sites[name]).map(([key, value]) => [key.split(' ').pop(), Number(value.match(/^[\d,]+/)[0].replace(/,/g, ''))]));
    const [oldest, middle, head] = hashes;
    assert.deepStrictEqual(sizes('alpha'), {
      [head]: ('CCC' + 'new!' + inputs.alpha).length,
      [middle]: ('BB' + 'new!' + inputs.alpha).length,
      [oldest]: ('A' + 'old' + inputs.alpha).length
    });
    assert.deepStrictEqual(sizes('beta'), {
      [head]: ('CCC' + 'new!' + inputs.beta).length,
      [middle]: ('BB' + 'new!' + inputs.beta).length
    });

    const errors = await fs.readFile(path.join(dir, 'backtest/errors.log'), 'utf8');
    assert.match(errors, new RegExp(`^${oldest} - \\[beta\\] Error: Stub failure`));

    assert.strictEqual(await status(dir), '');
    await assert.rejects(fs.stat(path.join(dir, 'src/extra.js')), { code: 'ENOENT' });
  });

  test('Installs only missing historical dependencies, and reports why an install failed', { timeout: 60000 }, async (t) => {
    const { dir } = await createFixture(t);
    const { code, stderr } = await runBacktest(dir, '1');
    assert.strictEqual(code, 0, stderr);
    assert.strictEqual((await fs.readFile(path.join(dir, 'bin/npm-args.txt'), 'utf8')).trim(), `install --no-save ${historicalDeps[0]}`);
    assert.match(stderr, /Warning: Failed to install some historical dependencies; old commits may fail\s+npm stub failure/);
  });

  test('Refuses to run over uncommitted changes, leaving them in place', { timeout: 60000 }, async (t) => {
    const { dir } = await createFixture(t);
    const pathSource = path.join(dir, 'src/htmlminifier.js');
    await fs.appendFile(pathSource, '\n// Uncommitted');
    const { code, stderr } = await runBacktest(dir, '3');
    assert.strictEqual(code, 1);
    assert.match(stderr, /Uncommitted changes detected/);
    assert.match(await fs.readFile(pathSource, 'utf8'), /\/\/ Uncommitted$/);
    await assert.rejects(fs.stat(path.join(dir, 'backtest/results.json')), { code: 'ENOENT' });
  });
});