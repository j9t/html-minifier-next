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

describe('cli', () => {
  beforeEach(async () => {
    await removeFixture('tmp');
  });

  test('minify the HTML', async () => {
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

  test('should throw error if input file not found', () => {
    const cliArguments = [
      'no-file.html'
    ];

    assert.throws(() => execCli(cliArguments), /no such file/);
  });

  test('should throw if output directory not specified', () => {
    const cliArguments = [
      '--input-dir=./'
    ];

    assert.throws(() => execCli(cliArguments), /You need to specify where to write the output files with the option --output-dir/);
  });

  test('should throw if input directory not specified', () => {
    const cliArguments = [
      '--output-dir=./'
    ];

    assert.throws(() => execCli(cliArguments), /The option output-dir needs to be used with the option input-dir. If you are working with a single file, use -o/);
  });

  test('should write files to output directory', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp'
    ];

    execCli(cliArguments);
    assert.strictEqual(existsFixture('tmp/default.html'), true);
  });

  test('should write files to output nested directory', () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/nested'
    ];

    execCli(cliArguments);
    assert.strictEqual(existsFixture('tmp/nested/default.html'), true);
  });

  // Parsing JSON
  test('should minify URLs correctly', async () => {
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
  test('should set quote char correctly', async () => {
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
  test('should handle inline-custom-elements correctly', async () => {
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

  test('should process files with single extension', () => {
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

  test('should process files with multiple extensions', () => {
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

  test('should process files with mixed-case and dot-prefixed extension tokens', () => {
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

  test('should process files with comma-separated extensions with spaces', () => {
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

  test('should process all files when no extension specified', () => {
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

  test('should verify minified output for multiple extensions', async () => {
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

  test('should handle empty extension list gracefully', () => {
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

  test('should process files with extensions from config file (string format)', () => {
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

  test('should process files with extensions from config file (array format)', () => {
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

  test('should override config file extensions with CLI argument', () => {
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html',  // Config specifies html
      collapseWhitespace: true
    });
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-override.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-override.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-override',
      '--file-ext=htm'  // CLI overrides to htm
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

  test('should override config file extensions with empty CLI argument', () => {
    fs.mkdirSync(path.resolve(fixturesDir, 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html',  // Config restricts to HTML only
      collapseWhitespace: true
    }, null, 2);
    fs.writeFileSync(path.resolve(fixturesDir, 'tmp/test-config-empty-override.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-empty-override.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-empty-override',
      '--file-ext='  // Empty CLI argument should override config and process ALL files
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
  test('should show statistics in dry run mode for single file', () => {
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

  test('should show statistics in dry run mode for directory', () => {
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

  test('should not write files in dry run mode', () => {
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
  test('should handle STDIN to STDOUT pipe in dry run', () => {
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

  test('should handle STDIN to file with -o flag in dry run', () => {
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

  test('should handle STDIN to STDOUT pipe without dry run', () => {
    const input = '<p>  test  </p>';
    const { stdout, status } = spawnSync('node', [cliPath, '--collapse-whitespace'], {
      cwd: fixturesDir,
      input: input
    });

    assert.strictEqual(status, 0);
    assert.strictEqual(stdout.toString().trim(), '<p>test</p>');
  });

  // -o flag combination tests
  test('should handle file to file with -o flag in dry run', () => {
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

  test('should handle file to file with -o flag without dry run', async () => {
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

  test('should handle file to STDOUT without -o flag', () => {
    const result = execCli([
      'default.html',
      '--collapse-whitespace'
    ]);

    // Should output to stdout
    assert.ok(result.length > 0);
    assert.ok(result.includes('<!DOCTYPE html>'));
  });

  // Error handling tests for dry run
  test('should show error in dry run for non-existent file', () => {
    const result = execCliWithStderr([
      'non-existent.html',
      '--dry',
      '--collapse-whitespace'
    ]);

    // Should exit with error
    assert.notStrictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('Cannot read') || result.stderr.includes('no such file'));
  });

  test('should show error in dry run for invalid directory', () => {
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

  test('should handle dry run with config file', () => {
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
  test('should show processing info in verbose mode for single file', () => {
    const result = execCliWithStderr([
      'default.html',
      '--verbose',
      '--collapse-whitespace',
      '-o', 'tmp/verbose-output.html'
    ]);

    // Should output to stderr
    assert.ok(result.stderr.includes('Options:'));
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

  test('should show processing info in verbose mode for directory', () => {
    const result = execCliWithStderr([
      '--input-dir=./',
      '--output-dir=./tmp/verbose-dir',
      '--verbose',
      '--collapse-whitespace'
    ]);

    // Should output to stderr
    assert.ok(result.stderr.includes('Options:'));
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

  test('should show processing info in verbose mode with STDIN', () => {
    const input = '<p>  test  </p>';
    const { stdout, stderr, status } = spawnSync('node', [cliPath, '--verbose', '--collapse-whitespace', '-o', 'tmp/verbose-stdin.html'], {
      cwd: fixturesDir,
      input: input
    });

    const stderrStr = stderr.toString();

    assert.strictEqual(status, 0);
    assert.ok(stderrStr.includes('Options:'));
    assert.ok(stderrStr.includes('✓'));
    assert.ok(stderrStr.includes('STDIN'));
    assert.ok(stderrStr.includes('→'));
    assert.ok(stderrStr.includes('bytes'));

    // Should not output to stdout
    assert.strictEqual(stdout.toString().trim(), '');

    // Should create output file
    assert.strictEqual(existsFixture('tmp/verbose-stdin.html'), true);
  });

  test('should automatically enable verbose mode with --dry flag', () => {
    const result = execCliWithStderr([
      'default.html',
      '--dry',
      '--collapse-whitespace'
    ]);

    // Should show verbose output (options and stats)
    assert.ok(result.stderr.includes('Options:'));
    assert.ok(result.stderr.includes('collapseWhitespace'));
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));

    assert.strictEqual(result.exitCode, 0);
  });

  test('should work correctly with both --dry and --verbose flags', () => {
    const result = execCliWithStderr([
      'default.html',
      '--dry',
      '--verbose',
      '--collapse-whitespace'
    ]);

    // Should show both dry run and verbose output
    assert.ok(result.stderr.includes('Options:'));
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Would minify:'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, '');
  });

  test('should not show verbose output without --verbose flag', () => {
    const result = execCliWithStderr([
      'default.html',
      '--collapse-whitespace',
      '-o', 'tmp/non-verbose.html'
    ]);

    // Should not show verbose output
    assert.ok(!result.stderr.includes('Options:'));
    assert.ok(!result.stderr.includes('✓'));

    // Stderr should be empty or minimal
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.exitCode, 0);

    // Should still create output file
    assert.strictEqual(existsFixture('tmp/non-verbose.html'), true);
  });

  test('should display version with --version flag', () => {
    const result = execCliWithStderr(['--version']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.match(/^\d+\.\d+\.\d+$/));
    assert.strictEqual(result.stderr, '');
  });

  test('should not show progress indicator in non-TTY environment', async () => {
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

  test('should not show progress indicator with --verbose flag', async () => {
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
    assert.ok(result.stderr.includes('Options:'));
    assert.ok(result.stderr.includes('tmp/test1.html'));
    assert.ok(result.stderr.includes('tmp/test2.html'));
    assert.ok(!result.stderr.includes('Processing: ['));
    assert.strictEqual(result.stdout, '');

    await removeFixture('tmp-out');
  });

  test('should not show progress indicator with --dry flag', async () => {
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
    assert.ok(result.stderr.includes('tmp/test1.html'));
    assert.ok(result.stderr.includes('tmp/test2.html'));
    assert.ok(!result.stderr.includes('Processing: ['));
    assert.strictEqual(result.stdout, '');

    // Dry run should not create output files
    assert.strictEqual(existsFixture('tmp-out'), false);
  });

  test('should process multiple subdirectories correctly for progress counting', async () => {
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
});