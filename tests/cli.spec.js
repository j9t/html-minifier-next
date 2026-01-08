import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesDir = path.resolve(__dirname, 'fixtures');
const cliPath = path.resolve(process.cwd(), 'cli.js');

const readFixture = async (filePath) => {
  const data = await fs.promises.readFile(path.resolve(fixturesDir, filePath), 'utf-8');
  return data;
};

const existsFixture = (filePath) => {
  return fs.existsSync(path.resolve(fixturesDir, filePath));
};

const removeFixture = async (p) => {
  const pathToDelete = path.resolve(fixturesDir, p);
  await fs.promises.rm(pathToDelete, { recursive: true, force: true });
};

const execCli = (args = []) => {
  const spawnOptions = {
    cwd: fixturesDir
  };

  const { stdout, stderr } = spawnSync('node', [cliPath, ...args], spawnOptions);
  const error = stderr.toString().trim();

  if (error) {
    throw new Error(error);
  } else {
    return stdout.toString().trim();
  }
};

const execCliWithStderr = (args = []) => {
  const spawnOptions = {
    cwd: fixturesDir
  };

  const { stdout, stderr, status } = spawnSync('node', [cliPath, ...args], spawnOptions);

  return {
    stdout: stdout.toString().trim(),
    stderr: stderr.toString().trim(),
    exitCode: status
  };
};

describe('CLI', () => {
  beforeEach(async () => {
    await removeFixture('tmp');
  });

  test('Should minify the HTML', async () => {
    const input = await readFixture('default.html');

    const minifyOptions = {
      collapseWhitespace: true,
      removeComments: true
    };

    const cliArguments = [
      'default.html',
      '--collapse-whitespace',
      '--remove-comments'
    ];

    let cliMinifiedHTML = execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);

    assert.strictEqual(cliMinifiedHTML, minifiedHTML);

    cliMinifiedHTML = execCli(['default.html']);
    assert.notStrictEqual(cliMinifiedHTML, minifiedHTML);
  });

  test('Should throw error if input file not found', () => {
    const cliArguments = [
      'no-file.html'
    ];

    assert.throws(() => execCli(cliArguments), /no such file/);
  });

  test('Should throw if output directory not specified', () => {
    const cliArguments = [
      '--input-dir=./'
    ];

    assert.throws(() => execCli(cliArguments), /You need to specify where to write the output files with the option `--output-dir`/);
  });

  test('Should throw if input directory not specified', () => {
    const cliArguments = [
      '--output-dir=./'
    ];

    assert.throws(() => execCli(cliArguments), /The option `output-dir` needs to be used with the option `input-dir`—if you are working with a single file, use `-o`/);
  });

  test('Should throw error for invalid max-line-length value', () => {
    const cliArguments = [
      'default.html',
      '--max-line-length=abc'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--max-line-length: "abc"`/);
  });

  test('Should throw error for invalid max-input-length value', () => {
    const cliArguments = [
      'default.html',
      '--max-input-length=xyz'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--max-input-length: "xyz"`/);
  });

  test('Should throw error for invalid custom-fragment-quantifier-limit value', () => {
    const cliArguments = [
      'default.html',
      '--custom-fragment-quantifier-limit=invalid'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--custom-fragment-quantifier-limit: "invalid"`/);
  });

  test('Should reject `max-line-length` with trailing characters', () => {
    const cliArguments = [
      'default.html',
      '--max-line-length=12abc'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--max-line-length: "12abc"`/);
  });

  test('Should reject `max-input-length` with trailing characters', () => {
    const cliArguments = [
      'default.html',
      '--max-input-length=99KB'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--max-input-length: "99KB"`/);
  });

  test('Should reject `custom-fragment-quantifier-limit` with trailing characters', () => {
    const cliArguments = [
      'default.html',
      '--custom-fragment-quantifier-limit=100x'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--custom-fragment-quantifier-limit: "100x"`/);
  });

  test('Should reject negative `max-line-length`', () => {
    const cliArguments = [
      'default.html',
      '--max-line-length=-50'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--max-line-length: "-50"`/);
  });

  test('Should reject negative `max-input-length`', () => {
    const cliArguments = [
      'default.html',
      '--max-input-length=-100'
    ];

    assert.throws(() => execCli(cliArguments), /Invalid number for `--max-input-length: "-100"`/);
  });

  test('Should throw error for malformed JSON array', () => {
    const cliArguments = [
      'default.html',
      '--minify-css=[bad, json]'
    ];

    assert.throws(() => execCli(cliArguments), /Could not parse JSON value `\[bad, json\]`/);
  });

  test('Should throw error for JSON with leading whitespace', () => {
    const cliArguments = [
      'default.html',
      '--minify-js=  {bad: json}'
    ];

    assert.throws(() => execCli(cliArguments), /Could not parse JSON value ` {2}\{bad: json\}`/);
  });

  test('Should write files to output directory', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp'
    ];

    execCli(cliArguments);
    assert.strictEqual(existsFixture('tmp/default.html'), true);
  });

  test('Should write files to output nested directory', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/nested'
    ];

    execCli(cliArguments);
    assert.strictEqual(existsFixture('tmp/nested/default.html'), true);
  });

  // Parsing JSON
  test('Should minify URLs correctly', async () => {
    const input = await readFixture('url.html');

    const minifyOptions = {
      collapseWhitespace: true,
      minifyURLs: {
        site: 'https://example.com/folder/'
      }
    };

    const cliArguments = [
      'url.html',
      '--collapse-whitespace',
      '--minify-urls={"site":"https://example.com/folder/"}'
    ];

    const cliMinifiedHTML = execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);
    assert.strictEqual(cliMinifiedHTML, minifiedHTML);
  });

  // Parsing string inputs
  test('Should set quote char correctly', async () => {
    const input = await readFixture('fragment-quote-char.html');

    const minifyOptions = {
      collapseWhitespace: true,
      quoteCharacter: '\''
    };

    const cliArguments = [
      'fragment-quote-char.html',
      '--collapse-whitespace',
      '--quote-character=\''
    ];

    const cliMinifiedHTML = execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);
    assert.strictEqual(cliMinifiedHTML, minifiedHTML);
  });

  // Parsing array inputs
  test('Should handle `inline-custom-elements` correctly', async () => {
    const input = await readFixture('fragment-inline-custom-elements.html');

    const minifyOptions = {
      collapseWhitespace: true,
      inlineCustomElements: ['custom-element', 'custom-inline']
    };

    const cliArguments = [
      'fragment-inline-custom-elements.html',
      '--collapse-whitespace',
      '--inline-custom-elements=["custom-element","custom-inline"]'
    ];

    const cliMinifiedHTML = execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);
    assert.strictEqual(cliMinifiedHTML, minifiedHTML);

    // Verify spacing is preserved for specified custom elements
    assert.ok(cliMinifiedHTML.includes('<custom-element>A</custom-element> <custom-element>B</custom-element>'));
    assert.ok(cliMinifiedHTML.includes('<span>Standard</span> <custom-inline>Custom</custom-inline>'));
    // but not for unspecified custom elements
    assert.ok(cliMinifiedHTML.includes('<web-component>X</web-component><web-component>Y</web-component>'));
  });

  test('Should process files with single extension', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/single-ext',
      '--file-ext=html',
      '--collapse-whitespace'
    ];

    execCli(cliArguments);

    // Should process .html files
    assert.strictEqual(existsFixture('tmp/single-ext/extension.html'), true);

    // Should not process other extensions
    assert.strictEqual(existsFixture('tmp/single-ext/extension.htm'), false);
    assert.strictEqual(existsFixture('tmp/single-ext/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/single-ext/extension.txt'), false);
  });

  test('Should process files with multiple extensions', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/multi-ext',
      '--file-ext=html,htm,php',
      '--collapse-whitespace'
    ];

    execCli(cliArguments);

    // Should process specified extensions
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.php'), true);

    // Should not process unspecified extensions
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.txt'), false);
  });

  test('Should process files with mixed-case and dot-prefixed extension tokens', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/mixed-case',
      '--file-ext=.HTML, HtM , .Php',
      '--collapse-whitespace'
    ];

    execCli(cliArguments);

    assert.strictEqual(existsFixture('tmp/mixed-case/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/mixed-case/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/mixed-case/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/mixed-case/extension.txt'), false);
  });

  test('Should process files with comma-separated extensions with spaces', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/spaced-ext',
      '--file-ext=html, htm , php',
      '--collapse-whitespace'
    ];

    execCli(cliArguments);

    // Should handle spaces around commas correctly
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.txt'), false);
  });

  test('Should process all files when no extension specified', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/all-files',
      '--collapse-whitespace'
    ];

    execCli(cliArguments);

    // Should process all files when no --file-ext is specified
    assert.strictEqual(existsFixture('tmp/all-files/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/all-files/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/all-files/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/all-files/extension.txt'), true);
  });

  test('Should verify minified output for multiple extensions', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/verify-output',
      '--file-ext=html,htm',
      '--collapse-whitespace',
      '--remove-comments'
    ];

    execCli(cliArguments);

    // Verify HTML file is minified correctly
    const minifiedHtml = await fs.promises.readFile(
      path.resolve(fixturesDir, 'tmp/verify-output/extension.html'),
      'utf-8'
    );
    assert.strictEqual(minifiedHtml, '<!DOCTYPE html><html><head><title>.html extension test page</title></head><body><p>Test content</p></body></html>');

    // Verify HTM file is minified correctly
    const minifiedHtm = await fs.promises.readFile(
      path.resolve(fixturesDir, 'tmp/verify-output/extension.htm'),
      'utf-8'
    );
    assert.strictEqual(minifiedHtm, '<!DOCTYPE html><html><head><title>.htm extension test page</title></head><body><p>Test content</p></body></html>');

    // PHP file should not be processed (not in the extension list)
    assert.strictEqual(existsFixture('tmp/verify-output/extension.php'), false);
  });

  test('Should handle empty extension list gracefully', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/empty-ext',
      '--file-ext=',
      '--collapse-whitespace'
    ];

    execCli(cliArguments);

    // Should process all files when empty string is provided
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.txt'), true);
  });

  test('Should process files with extensions from config file (string format)', () => {
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html,htm',
      collapseWhitespace: true
    });
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-string'
    ];

    execCli(cliArguments);

    // Should process extensions specified in config
    assert.strictEqual(existsFixture('tmp/config-string/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/config-string/extension.htm'), true);

    // Should not process unspecified extensions
    assert.strictEqual(existsFixture('tmp/config-string/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/config-string/extension.txt'), false);

    // Clean up
    fs.unlinkSync(path.resolve(fixturesDir, 'tmp/test-config.json'));
  });

  test('Should process files with extensions from config file (array format)', () => {
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: ['html'],
      collapseWhitespace: true
    });
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-array.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-array.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-array'
    ];

    execCli(cliArguments);

    // Should process extensions specified in config array
    assert.strictEqual(existsFixture('tmp/config-array/extension.html'), true);

    // Should not process other extensions
    assert.strictEqual(existsFixture('tmp/config-array/extension.htm'), false);
    assert.strictEqual(existsFixture('tmp/config-array/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/config-array/extension.txt'), false);

    // Clean up
    fs.unlinkSync(path.resolve(fixturesDir, 'tmp/test-config-array.json'));
  });

  test('Should override config file extensions with CLI argument', () => {
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html', // Config specifies html
      collapseWhitespace: true
    });
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-override.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-override.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-override',
      '--file-ext=htm' // CLI overrides to htm
    ];

    execCli(cliArguments);

    // Should process CLI-specified extensions, not config extensions
    assert.strictEqual(existsFixture('tmp/config-override/extension.htm'), true);

    // Should not process config-specified extensions
    assert.strictEqual(existsFixture('tmp/config-override/extension.html'), false);
    assert.strictEqual(existsFixture('tmp/config-override/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/config-override/extension.txt'), false);

    // Clean up
    fs.unlinkSync(path.resolve(fixturesDir, 'tmp/test-config-override.json'));
  });

  test('Should override config file extensions with empty CLI argument', () => {
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html', // Config restricts to HTML only
      collapseWhitespace: true
    }, null, 2);
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-empty-override.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-empty-override.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-empty-override',
      '--file-ext=' // Empty CLI argument should override config and process ALL files
    ];

    execCli(cliArguments);

    // Should process ALL files when CLI provides empty string (overriding config restriction)
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.txt'), true);

    // Clean up
    fs.unlinkSync(path.resolve(fixturesDir, 'tmp/test-config-empty-override.json'));
  });

  // Dry run mode tests
  test('Should show statistics in dry run mode for single file', () => {
    const cliArguments = [
      'default.html',
      '--dry',
      '--collapse-whitespace'
    ];

    const result = execCliWithStderr(cliArguments);

    // Should output to stderr
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Would minify:'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));
    assert.ok(result.stderr.includes('Saved:'));
    assert.ok(result.stderr.includes('bytes'));

    // Should not output to stdout
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);
  });

  test('Should show statistics in dry run mode for directory', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/dry-test',
      '--dry',
      '--collapse-whitespace'
    ];

    const result = execCliWithStderr(cliArguments);

    // Should output to stderr
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Would process directory:'));
    assert.ok(result.stderr.includes('Total:'));
    assert.ok(result.stderr.includes('bytes'));

    // Should not output to stdout
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);
  });

  test('Should not write files in dry run mode', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/dry-no-write',
      '--dry',
      '--collapse-whitespace'
    ];

    execCliWithStderr(cliArguments);

    // Should not create output directory or files
    assert.strictEqual(existsFixture('tmp/dry-no-write'), false);
    assert.strictEqual(existsFixture('tmp/dry-no-write/default.html'), false);
  });

  // STDIN/STDOUT pipe tests
  test('Should handle STDIN to STDOUT pipe in dry run', () => {
    const input = '<p>  test  </p>';
    const { stdout, stderr, status } = spawnSync('node', [cliPath, '--dry', '--collapse-whitespace'], {
      cwd: fixturesDir,
      input: input
    });

    const stderrStr = stderr.toString();

    assert.strictEqual(status, 0);
    assert.ok(stderrStr.includes('[DRY RUN]'));
    assert.ok(stderrStr.includes('STDIN → STDOUT'));
    assert.ok(stderrStr.includes('Original:'));
    assert.ok(stderrStr.includes('Minified:'));
    assert.ok(stderrStr.includes('Saved:'));
    // Should not output minified HTML to stdout in dry run
    assert.strictEqual(stdout.toString().trim(), '');
  });

  test('Should handle STDIN to file with `-o` flag in dry run', () => {
    const input = '<p>  test  </p>';
    const { stdout, stderr, status } = spawnSync('node', [cliPath, '-o', 'tmp/stdin-output.html', '--dry', '--collapse-whitespace'], {
      cwd: fixturesDir,
      input: input
    });

    const stderrStr = stderr.toString();

    assert.strictEqual(status, 0);
    assert.ok(stderrStr.includes('[DRY RUN]'));
    assert.ok(stderrStr.includes('STDIN → tmp/stdin-output.html'));
    assert.ok(stderrStr.includes('Original:'));
    assert.ok(stderrStr.includes('Minified:'));
    assert.strictEqual(stdout.toString().trim(), '');
    // Should not create output file
    assert.strictEqual(existsFixture('tmp/stdin-output.html'), false);
  });

  test('Should handle STDIN to STDOUT pipe without dry run', () => {
    const input = '<p>  test  </p>';
    const { stdout, status } = spawnSync('node', [cliPath, '--collapse-whitespace'], {
      cwd: fixturesDir,
      input: input
    });

    assert.strictEqual(status, 0);
    assert.strictEqual(stdout.toString().trim(), '<p>test</p>');
  });

  test('Should handle EPIPE gracefully when piping to head', () => {
    const command = `node "${cliPath}" --collapse-whitespace < default.html | head -n1`;
    const { status, stderr } = spawnSync('sh', ['-c', command], {
      cwd: fixturesDir
    });
    // Exit code should be 0 and no noisy errors
    assert.strictEqual(status, 0);
    assert.strictEqual(stderr.toString().trim(), '');
  });

  // `-o` flag combination tests
  test('Should handle file to file with `-o` flag in dry run', () => {
    const result = execCliWithStderr([
      'default.html',
      '-o', 'tmp/output-flag.html',
      '--dry',
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('default.html → tmp/output-flag.html'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));
    assert.strictEqual(result.stdout, '');
    // Should not create output file
    assert.strictEqual(existsFixture('tmp/output-flag.html'), false);
  });

  test('Should handle file to file with `-o` flag without dry run', async () => {
    // Ensure tmp directory exists
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });

    execCli([
      'default.html',
      '-o', 'tmp/output-normal.html',
      '--collapse-whitespace'
    ]);

    // Should create output file
    assert.strictEqual(existsFixture('tmp/output-normal.html'), true);

    const output = await readFixture('tmp/output-normal.html');
    assert.ok(output.length > 0);
    assert.ok(output.includes('<!DOCTYPE html>'));
  });

  test('Should handle file to STDOUT without `-o` flag', () => {
    const result = execCli([
      'default.html',
      '--collapse-whitespace'
    ]);

    // Should output to stdout
    assert.ok(result.length > 0);
    assert.ok(result.includes('<!DOCTYPE html>'));
  });

  // Error handling tests for dry run
  test('Should show error in dry run for non-existent file', () => {
    const result = execCliWithStderr([
      'non-existent.html',
      '--dry',
      '--collapse-whitespace'
    ]);

    // Should exit with error
    assert.notStrictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('Cannot read') || result.stderr.includes('no such file'));
  });

  test('Should show error in dry run for invalid directory', () => {
    const result = execCliWithStderr([
      '--input-dir=./non-existent-dir',
      '--output-dir=./tmp/output',
      '--dry',
      '--collapse-whitespace'
    ]);

    // Should exit with error
    assert.notStrictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('Cannot read') || result.stderr.includes('no such file'));
  });

  test('Should handle dry run with config file', () => {
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      collapseWhitespace: true,
      removeComments: true
    });
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/dry-config.json'), configContent);

    const result = execCliWithStderr([
      '--config-file=./tmp/dry-config.json',
      'default.html',
      '--dry'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Would minify:'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));
    assert.strictEqual(result.stdout, '');

    // Clean up
    fs.unlinkSync(path.resolve(fixturesDir, 'tmp/dry-config.json'));
  });

  // Verbose mode tests
  test('Should show processing info in verbose mode for single file', () => {
    const result = execCliWithStderr([
      'default.html',
      '--verbose',
      '--collapse-whitespace',
      '-o', 'tmp/verbose-output.html'
    ]);

    // Should output to stderr
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes('collapseWhitespace'));
    assert.ok(result.stderr.includes('✓'));
    assert.ok(result.stderr.includes('default.html'));
    assert.ok(result.stderr.includes('→'));
    assert.ok(result.stderr.includes('bytes'));

    // Should not output to stdout
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);

    // Should create output file
    assert.strictEqual(existsFixture('tmp/verbose-output.html'), true);
  });

  test('Should show processing info in verbose mode for directory', () => {
    const result = execCliWithStderr([
      '--input-dir=./',
      '--output-dir=./tmp/verbose-dir',
      '--verbose',
      '--collapse-whitespace'
    ]);

    // Should output to stderr
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes('✓'));
    assert.ok(result.stderr.includes('→'));
    assert.ok(result.stderr.includes('bytes'));
    assert.ok(result.stderr.includes('Total:'));

    // Should not output to stdout
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);

    // Should create output files
    assert.strictEqual(existsFixture('tmp/verbose-dir/default.html'), true);
  });

  test('Should show processing info in verbose mode with STDIN', () => {
    const input = '<p>  test  </p>';
    const { stdout, stderr, status } = spawnSync('node', [cliPath, '--verbose', '--collapse-whitespace', '-o', 'tmp/verbose-stdin.html'], {
      cwd: fixturesDir,
      input: input
    });

    const stderrStr = stderr.toString();

    assert.strictEqual(status, 0);
    assert.ok(stderrStr.includes('CLI options:'));
    assert.ok(stderrStr.includes('✓'));
    assert.ok(stderrStr.includes('STDIN'));
    assert.ok(stderrStr.includes('→'));
    assert.ok(stderrStr.includes('bytes'));

    // Should not output to stdout
    assert.strictEqual(stdout.toString().trim(), '');

    // Should create output file
    assert.strictEqual(existsFixture('tmp/verbose-stdin.html'), true);
  });

  test('Should automatically enable verbose mode with `--dry` flag', () => {
    const result = execCliWithStderr([
      'default.html',
      '--dry',
      '--collapse-whitespace'
    ]);

    // Should show verbose output (options and stats)
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes('collapseWhitespace'));
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));

    assert.strictEqual(result.exitCode, 0);
  });

  test('Should work correctly with both `--dry` and `--verbose` flags', () => {
    const result = execCliWithStderr([
      'default.html',
      '--dry',
      '--verbose',
      '--collapse-whitespace'
    ]);

    // Should show both dry run and verbose output
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Would minify:'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, '');
  });

  test('Should not show verbose output without `--verbose` flag', () => {
    const result = execCliWithStderr([
      'default.html',
      '--collapse-whitespace',
      '-o', 'tmp/non-verbose.html'
    ]);

    // Should not show verbose output
    assert.ok(!result.stderr.includes('CLI options:'));
    assert.ok(!result.stderr.includes('✓'));

    // Stderr should be empty or minimal
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.exitCode, 0);

    // Should still create output file
    assert.strictEqual(existsFixture('tmp/non-verbose.html'), true);
  });

  test('Should display version with `--version` flag', () => {
    const result = execCliWithStderr(['--version']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.match(/^\d+\.\d+\.\d+$/));
    assert.strictEqual(result.stderr, '');
  });

  test('Should not show progress indicator in non-TTY environment', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/test1.html'), '<html><body><h1>Test</h1></body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/test2.html'), '<html><body><h1>Test</h1></body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace'
    ]);

    // In non-TTY (CI/piped), no progress should appear in stderr
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.stdout, '');

    await removeFixture('tmp-out');
  });

  test('Should not show progress indicator with `--verbose` flag', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/test1.html'), '<html><body><h1>Test</h1></body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/test2.html'), '<html><body><h1>Test</h1></body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace',
      '--verbose'
    ]);

    // With verbose, should show per-file stats, not progress
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes(path.join('tmp', 'test1.html')));
    assert.ok(result.stderr.includes(path.join('tmp', 'test2.html')));
    assert.ok(!result.stderr.includes('Processing: ['));
    assert.strictEqual(result.stdout, '');

    await removeFixture('tmp-out');
  });

  test('Should not show progress indicator with `--dry` flag', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/test1.html'), '<html><body><h1>Test</h1></body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/test2.html'), '<html><body><h1>Test</h1></body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace',
      '--dry'
    ]);

    // With dry run, should show per-file stats, not progress
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes(path.join('tmp', 'test1.html')));
    assert.ok(result.stderr.includes(path.join('tmp', 'test2.html')));
    assert.ok(!result.stderr.includes('Processing: ['));
    assert.strictEqual(result.stdout, '');

    // Dry run should not create output files
    assert.strictEqual(existsFixture('tmp-out'), false);
  });

  test('Should process multiple subdirectories correctly for progress counting', async () => {
    // Create nested directory structure
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/sub1/sub2'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/test1.html'), '<html><body><h1>Test 1</h1></body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/sub1/test2.html'), '<html><body><h1>Test 2</h1></body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/sub1/sub2/test3.html'), '<html><body><h1>Test 3</h1></body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace'
    ]);

    // Should successfully process all files in nested directories
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/test1.html'), true);
    assert.strictEqual(existsFixture('tmp-out/sub1/test2.html'), true);
    assert.strictEqual(existsFixture('tmp-out/sub1/sub2/test3.html'), true);

    await removeFixture('tmp-out');
  });

  test('Should skip traversing into output directory when nested in input directory', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/in/sub'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/in/a.html'), '<html><body>a</body></html>');
    const result = execCliWithStderr([
      '--input-dir=tmp/in',
      '--output-dir=tmp/in/sub', // Nested
      '--collapse-whitespace'
    ]);
    assert.strictEqual(result.exitCode, 0);
    // Should write only to sub/, and must not reprocess files it just wrote
    assert.strictEqual(existsFixture('tmp/in/sub/a.html'), true);
    // Verify it only processed the original file, not the output
    const output = await readFixture('tmp/in/sub/a.html');
    assert.ok(output.includes('<html><body>a</body></html>'));
  });

  test('Should skip symbolic links', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/real.html'), '<html><body>x</body></html>');
    // Create symlink pointing to real.html
    const target = path.resolve(fixturesDir, 'tmp/real.html');
    const link = path.resolve(fixturesDir, 'tmp/link.html');
    try {
      await fs.promises.symlink(target, link);
    } catch (err) {
      // Skip test on Windows if symlinks not supported
      if (err.code === 'EPERM' || err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace'
    ]);
    assert.strictEqual(result.exitCode, 0);
    // Only real file should be processed
    assert.strictEqual(existsFixture('tmp-out/real.html'), true);
    assert.strictEqual(existsFixture('tmp-out/link.html'), false);
    await removeFixture('tmp-out');
  });

  test('Should use “conservative” preset', () => {
    const input = '<!DOCTYPE html><html>  <body>  <!-- comment -->  <p>  Hello  </p>  </body></html>';
    const { stdout, stderr, status } = spawnSync('node', [cliPath, '--preset', 'conservative', '--verbose'], {
      cwd: fixturesDir,
      input: input
    });

    // Conservative preset should apply its options
    assert.strictEqual(status, 0);
    assert.ok(stderr.toString().includes('Using preset: conservative'));
    // Should remove comments, collapse whitespace, use short doctype
    const output = stdout.toString();
    assert.ok(!output.includes('<!-- comment -->'));
    assert.ok(!output.includes('  '));
  });

  test('Should use “comprehensive” preset', () => {
    const input = '<!DOCTYPE html><html>  <body>  <!-- comment -->  <p class="z a">  Hello  </p>  </body></html>';
    const { stdout, stderr, status } = spawnSync('node', [cliPath, '--preset', 'comprehensive', '--verbose'], {
      cwd: fixturesDir,
      input: input
    });

    // Comprehensive preset should apply aggressive options
    assert.strictEqual(status, 0);
    assert.ok(stderr.toString().includes('Using preset: comprehensive'));
    // Should remove comments, collapse whitespace, sort classes
    const output = stdout.toString();
    assert.ok(!output.includes('<!-- comment -->'));
    assert.ok(!output.includes('  '));
  });

  test('Should override preset options with CLI flags', () => {
    const input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p class="">test</p>';
    // Conservative preset has `useShortDoctype`, and we add `removeEmptyAttributes` via CLI
    const { stdout, status } = spawnSync('node', [cliPath, '--preset', 'conservative', '--remove-empty-attributes'], {
      cwd: fixturesDir,
      input: input
    });

    // Both preset and CLI options should be applied
    assert.strictEqual(status, 0);
    const output = stdout.toString();
    // `useShortDoctype` from preset
    assert.ok(output.includes('<!doctype html>'));
    // `removeEmptyAttributes` from CLI (empty class should be removed)
    assert.ok(!output.includes('class=""'));
  });

  test('Should fail with unknown preset', () => {
    assert.throws(
      () => execCli(['--preset', 'unknown', 'default.html']),
      /Unknown preset "unknown"/
    );
  });

  test('Should use preset from config file', async () => {
    const configPath = path.resolve(fixturesDir, 'tmp-preset-config.json');
    await fs.promises.writeFile(configPath, JSON.stringify({ preset: 'conservative' }));

    const input = '<!DOCTYPE html><html>  <body>  <!-- comment -->  <p>  Hello  </p>  </body></html>';
    const { stdout, stderr, status } = spawnSync('node', [cliPath, '-c', configPath, '--verbose'], {
      cwd: fixturesDir,
      input: input
    });

    assert.strictEqual(status, 0);
    assert.ok(stderr.toString().includes('Using preset: conservative'));
    assert.ok(!stdout.toString().includes('<!-- comment -->'));

    await fs.promises.rm(configPath, { force: true });
  });

  test('Should override config file options with CLI flags when using preset', async () => {
    const configPath = path.resolve(fixturesDir, 'tmp-preset-config2.json');
    await fs.promises.writeFile(configPath, JSON.stringify({
      preset: 'conservative',
      useShortDoctype: false // Override preset’s `useShortDoctype`
    }));

    const input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p>test</p>';
    // Config says `useShortDoctype: false`, but CLI should override to true
    const { stdout, status } = spawnSync('node', [cliPath, '-c', configPath, '--use-short-doctype'], {
      cwd: fixturesDir,
      input: input
    });

    assert.strictEqual(status, 0);
    // Short doctype should be used due to CLI override
    assert.ok(stdout.toString().includes('<!doctype html>'));

    await fs.promises.rm(configPath, { force: true });
  });

  test('Should prioritize CLI preset over config preset', async () => {
    const configPath = path.resolve(fixturesDir, 'tmp-preset-config3.json');
    await fs.promises.writeFile(configPath, JSON.stringify({ preset: 'conservative' }));

    const input = '<!DOCTYPE html><html><body><p class="z a">Hello</p></body></html>';
    // CLI preset should override config preset
    const { stderr, status } = spawnSync('node', [cliPath, '-c', configPath, '--preset', 'comprehensive', '--verbose'], {
      cwd: fixturesDir,
      input: input
    });

    assert.strictEqual(status, 0);
    assert.ok(stderr.toString().includes('Using preset: comprehensive'));

    await fs.promises.rm(configPath, { force: true });
  });

  test('Should ignore single directory by name', async () => {
    // Create test structure: tmp/a.html, tmp/libs/b.html, tmp/sub/c.html
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs/sub'), { recursive: true });
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/sub'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/sub/d.html'), '<html><body>d</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/sub/c.html'), '<html><body>c</body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=libs',
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    // Should process a.html and sub/c.html
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/sub/c.html'), true);
    // Should not process libs/b.html and libs/sub/d.html
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
    assert.strictEqual(existsFixture('tmp-out/libs/sub/d.html'), false);

    await removeFixture('tmp-out');
  });

  test('Should ignore multiple directories', async () => {
    // Create test structure
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/vendor'), { recursive: true });
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/src'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/vendor/c.html'), '<html><body>c</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/src/d.html'), '<html><body>d</body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=libs,vendor',
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    // Should process a.html and src/d.html
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/src/d.html'), true);
    // Should not process libs/b.html and vendor/c.html
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
    assert.strictEqual(existsFixture('tmp-out/vendor/c.html'), false);

    await removeFixture('tmp-out');
  });

  test('Should ignore directories by relative path', async () => {
    // Create test structure
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/static/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/static/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/c.html'), '<html><body>c</body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=static/libs',
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    // Should process a.html and libs/c.html
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/c.html'), true);
    // Should not process static/libs/b.html
    assert.strictEqual(existsFixture('tmp-out/static/libs/b.html'), false);

    await removeFixture('tmp-out');
  });

  test('Should support `ignoreDir` from config file as string', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/b.html'), '<html><body>b</body></html>');

    const configContent = JSON.stringify({
      collapseWhitespace: true,
      ignoreDir: 'libs'
    }, null, 2);
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-ignore.json'), configContent);

    const result = execCliWithStderr([
      '--config-file=./tmp/test-config-ignore.json',
      '--input-dir=tmp',
      '--output-dir=tmp-out'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);

    await removeFixture('tmp-out');
  });

  test('Should support `ignoreDir` from config file as array', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/vendor'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/vendor/c.html'), '<html><body>c</body></html>');

    const configContent = JSON.stringify({
      collapseWhitespace: true,
      ignoreDir: ['libs', 'vendor']
    }, null, 2);
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-ignore-array.json'), configContent);

    const result = execCliWithStderr([
      '--config-file=./tmp/test-config-ignore-array.json',
      '--input-dir=tmp',
      '--output-dir=tmp-out'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
    assert.strictEqual(existsFixture('tmp-out/vendor/c.html'), false);

    await removeFixture('tmp-out');
  });

  test('Should allow CLI `ignore-dir` to override config file', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/vendor'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/vendor/c.html'), '<html><body>c</body></html>');

    const configContent = JSON.stringify({
      collapseWhitespace: true,
      ignoreDir: 'libs' // Config says ignore libs
    }, null, 2);
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-ignore-override.json'), configContent);

    const result = execCliWithStderr([
      '--config-file=./tmp/test-config-ignore-override.json',
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=vendor' // CLI overrides to ignore vendor instead
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    // “libs” should be processed (not ignored) due to CLI override
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), true);
    // “vendor” should be ignored
    assert.strictEqual(existsFixture('tmp-out/vendor/c.html'), false);

    await removeFixture('tmp-out');
  });

  test('Should handle `ignore-dir` with spaces in comma-separated list', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/vendor'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/vendor/c.html'), '<html><body>c</body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=libs, vendor', // Note the space after comma
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
    assert.strictEqual(existsFixture('tmp-out/vendor/c.html'), false);

    await removeFixture('tmp-out');
  });

  test('Should handle `ignore-dir` with trailing slashes', async () => {
    await fs.promises.mkdir(path.resolve(fixturesDir, 'tmp/libs'), { recursive: true });
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(fixturesDir, 'tmp/libs/b.html'), '<html><body>b</body></html>');

    const result = execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=libs/', // Trailing slash should be stripped
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);

    await removeFixture('tmp-out');
  });
});