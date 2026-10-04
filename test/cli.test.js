import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { AsyncLocalStorage } from 'async_hooks';
import os from 'os';
import { describe, test as nodeTest } from 'node:test';
import assert from 'node:assert';
import { minify } from '../src/htmlminifier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const fixturesDir = path.resolve(__dirname, 'fixtures');
const cliPath = path.resolve(process.cwd(), 'cli.js');

const sandbox = new AsyncLocalStorage();

/**
 * The current test’s copy of the fixtures folder, which the CLI runs in
 * @returns {string}
 */
const dirSandbox = () => {
  const dir = sandbox.getStore();
  if (!dir) throw new Error('No sandbox: CLI helpers only work inside `test()`');
  return dir;
};

/**
 * Runs each test in its own copy of the fixtures folder, so that tests can write
 * there—and walk it with `--input-dir=./`—while others run alongside
 * @type {typeof nodeTest}
 */
const test = Object.assign((/** @type {any[]} */ ...args) => {
  const fn = args.pop();
  return nodeTest(...args, async (/** @type {any} */ t) => {
    const dir = await fs.promises.realpath(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hmn-cli-')));
    try {
      await fs.promises.cp(fixturesDir, dir, { recursive: true });
      return await sandbox.run(dir, () => fn(t));
    } finally {
      await fs.promises.rm(dir, { recursive: true, force: true });
    }
  });
}, { skip: nodeTest.skip });

const readFixture = async (filePath) => {
  const data = await fs.promises.readFile(path.resolve(dirSandbox(), filePath), 'utf-8');
  return data;
};

const existsFixture = (filePath) => {
  return fs.existsSync(path.resolve(dirSandbox(), filePath));
};

/**
 * Runs a command without blocking, so that concurrent tests overlap; resolves like `spawnSync`
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, input?: string }} [options] - `cwd` defaults to the sandbox
 * @returns {Promise<{ stdout: Buffer, stderr: Buffer, status: number | null }>}
 */
const spawnAsync = (command, args, { cwd = dirSandbox(), input } = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { cwd });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', chunk => stdout.push(chunk));
  child.stderr.on('data', chunk => stderr.push(chunk));
  child.on('error', reject);
  child.on('close', status => resolve({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), status }));
  // The CLI may exit without reading its input
  child.stdin.on('error', () => {});
  child.stdin.end(input);
});

/**
 * @param {string[]} args
 * @param {{ cwd?: string, input?: string }} [options]
 */
const spawnCli = (args, options) => spawnAsync('node', [cliPath, ...args], options);

const execCli = async (args = []) => {
  const { stdout, stderr } = await spawnCli(args);
  const error = stderr.toString().trim();

  if (error) {
    throw new Error(error);
  } else {
    return stdout.toString().trim();
  }
};

const execCliWithStderr = async (args = []) => {
  const { stdout, stderr, status } = await spawnCli(args);

  return {
    stdout: stdout.toString().trim(),
    stderr: stderr.toString().trim(),
    exitCode: status
  };
};

describe('CLI', { concurrency: os.availableParallelism() }, () => {
  test('Minifies the HTML', async () => {
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

    let cliMinifiedHTML = await execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);

    assert.strictEqual(cliMinifiedHTML, minifiedHTML);

    cliMinifiedHTML = await execCli(['default.html']);
    assert.notStrictEqual(cliMinifiedHTML, minifiedHTML);
  });

  test('Throws an error if the input file is not found', async () => {
    const cliArguments = [
      'no-file.html'
    ];

    await assert.rejects(execCli(cliArguments), /no such file/);
  });

  test('Throws if the output directory is not specified', async () => {
    const cliArguments = [
      '--input-dir=./'
    ];

    await assert.rejects(execCli(cliArguments), /You need to specify where to write the output files with the option `--output-dir`/);
  });

  test('Throws if the input directory is not specified', async () => {
    const cliArguments = [
      '--output-dir=./'
    ];

    await assert.rejects(execCli(cliArguments), /The option `output-dir` needs to be used with the option `input-dir`—if you are working with a single file, use `--input`\/`--output`/);
  });

  test('Throws an error for an invalid max-line-length value', async () => {
    const cliArguments = [
      'default.html',
      '--max-line-length=abc'
    ];

    await assert.rejects(execCli(cliArguments), /Invalid number for `--max-line-length: "abc"`/);
  });

  test('Throws an error for an invalid max-input-length value', async () => {
    const cliArguments = [
      'default.html',
      '--max-input-length=xyz'
    ];

    await assert.rejects(execCli(cliArguments), /Invalid number for `--max-input-length: "xyz"`/);
  });

  test('Rejects `max-line-length` with trailing characters', async () => {
    const cliArguments = [
      'default.html',
      '--max-line-length=12abc'
    ];

    await assert.rejects(execCli(cliArguments), /Invalid number for `--max-line-length: "12abc"`/);
  });

  test('Rejects `max-input-length` with trailing characters', async () => {
    const cliArguments = [
      'default.html',
      '--max-input-length=99KB'
    ];

    await assert.rejects(execCli(cliArguments), /Invalid number for `--max-input-length: "99KB"`/);
  });

  test('Rejects negative `max-line-length`', async () => {
    const cliArguments = [
      'default.html',
      '--max-line-length=-50'
    ];

    await assert.rejects(execCli(cliArguments), /Invalid number for `--max-line-length: "-50"`/);
  });

  test('Rejects negative `max-input-length`', async () => {
    const cliArguments = [
      'default.html',
      '--max-input-length=-100'
    ];

    await assert.rejects(execCli(cliArguments), /Invalid number for `--max-input-length: "-100"`/);
  });

  test('Throws an error for a malformed JSON array', async () => {
    const cliArguments = [
      'default.html',
      '--minify-css=[bad, json]'
    ];

    await assert.rejects(execCli(cliArguments), /Could not parse JSON value `\[bad, json\]`/);
  });

  test('Throws an error for JSON with leading whitespace', async () => {
    const cliArguments = [
      'default.html',
      '--minify-js=  {bad: json}'
    ];

    await assert.rejects(execCli(cliArguments), /Could not parse JSON value ` {2}\{bad: json\}`/);
  });

  test('Writes files to the output directory', async () => {
    const cliArguments = [
      '-I', './',
      '-O', './tmp'
    ];

    await execCli(cliArguments);
    assert.strictEqual(existsFixture('tmp/default.html'), true);
  });

  test('Writes files to a nested output directory', async () => {
    const cliArguments = [
      '-I', './',
      '-O', './tmp/nested'
    ];

    await execCli(cliArguments);
    assert.strictEqual(existsFixture('tmp/nested/default.html'), true);
  });

  // Parsing JSON
  test('Minifies URLs', async () => {
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

    const cliMinifiedHTML = await execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);
    assert.strictEqual(cliMinifiedHTML, minifiedHTML);
  });

  test('Handles acronym CLI flags (`--minify-js`, `--minify-css`)', async () => {
    const input = await readFixture('default.html');

    const minifyOptions = {
      collapseWhitespace: true,
      minifyJS: true,
      minifyCSS: true
    };

    const cliArguments = [
      'default.html',
      '--collapse-whitespace',
      '--minify-js',
      '--minify-css'
    ];

    const cliMinifiedHTML = await execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);
    assert.strictEqual(cliMinifiedHTML, minifiedHTML);
  });

  // Parsing string inputs
  test('Sets the quote character', async () => {
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

    const cliMinifiedHTML = await execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);
    assert.strictEqual(cliMinifiedHTML, minifiedHTML);
  });

  // Parsing array inputs
  test('Handles `inline-custom-elements`', async () => {
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

    const cliMinifiedHTML = await execCli(cliArguments);
    const minifiedHTML = await minify(input, minifyOptions);
    assert.strictEqual(cliMinifiedHTML, minifiedHTML);

    // Verify spacing is preserved for specified custom elements
    assert.ok(cliMinifiedHTML.includes('<custom-element>A</custom-element> <custom-element>B</custom-element>'));
    assert.ok(cliMinifiedHTML.includes('<span>Standard</span> <custom-inline>Custom</custom-inline>'));
    // but not for unspecified custom elements
    assert.ok(cliMinifiedHTML.includes('<web-component>X</web-component><web-component>Y</web-component>'));
  });

  test('Processes files with a single extension', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/single-ext',
      '--file-ext=html',
      '--collapse-whitespace'
    ];

    await execCli(cliArguments);

    // Should process .html files
    assert.strictEqual(existsFixture('tmp/single-ext/extension.html'), true);

    // Should not process other extensions
    assert.strictEqual(existsFixture('tmp/single-ext/extension.htm'), false);
    assert.strictEqual(existsFixture('tmp/single-ext/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/single-ext/extension.txt'), false);
  });

  test('Processes files with multiple extensions', async () => {
    const cliArguments = [
      '-I', './',
      '-O', './tmp/multi-ext',
      '-f', 'html,htm,php',
      '--collapse-whitespace'
    ];

    await execCli(cliArguments);

    // Should process specified extensions
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.php'), true);

    // Should not process unspecified extensions
    assert.strictEqual(existsFixture('tmp/multi-ext/extension.txt'), false);
  });

  test('Processes files with mixed-case and dot-prefixed extension tokens', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/mixed-case',
      '--file-ext=.HTML, HtM , .Php',
      '--collapse-whitespace'
    ];

    await execCli(cliArguments);

    assert.strictEqual(existsFixture('tmp/mixed-case/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/mixed-case/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/mixed-case/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/mixed-case/extension.txt'), false);
  });

  test('Processes files with comma-separated extensions with spaces', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/spaced-ext',
      '--file-ext=html, htm , php',
      '--collapse-whitespace'
    ];

    await execCli(cliArguments);

    // Should handle spaces around commas correctly
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/spaced-ext/extension.txt'), false);
  });

  test('Processes only default extensions when no extension is specified', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/default-ext',
      '--collapse-whitespace'
    ];

    await execCli(cliArguments);

    // Should process default HTML extensions
    assert.strictEqual(existsFixture('tmp/default-ext/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/default-ext/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/default-ext/extension.shtml'), true);
    assert.strictEqual(existsFixture('tmp/default-ext/extension.shtm'), true);

    // Should not process non-default extensions
    assert.strictEqual(existsFixture('tmp/default-ext/extension.xhtml'), false);
    assert.strictEqual(existsFixture('tmp/default-ext/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/default-ext/extension.txt'), false);
  });

  test('Processes all files with `--file-ext=*`', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/all-files',
      '--file-ext=*',
      '--collapse-whitespace'
    ];

    const { stderr } = await execCliWithStderr(cliArguments);
    assert.ok(stderr.includes('Warning:'), 'Should warn when processing all file types');

    // Should process all files when wildcard is specified
    assert.strictEqual(existsFixture('tmp/all-files/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/all-files/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/all-files/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/all-files/extension.txt'), true);
  });

  test('Minifies output for multiple extensions', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/verify-output',
      '--file-ext=html,htm',
      '--collapse-whitespace',
      '--remove-comments'
    ];

    await execCli(cliArguments);

    // Verify HTML file is minified correctly
    const minifiedHtml = await fs.promises.readFile(
      path.resolve(dirSandbox(), 'tmp/verify-output/extension.html'),
      'utf-8'
    );
    assert.strictEqual(minifiedHtml, '<!DOCTYPE html><html><head><title>.html extension test page</title></head><body><p>Test content</p></body></html>');

    // Verify HTM file is minified correctly
    const minifiedHtm = await fs.promises.readFile(
      path.resolve(dirSandbox(), 'tmp/verify-output/extension.htm'),
      'utf-8'
    );
    assert.strictEqual(minifiedHtm, '<!DOCTYPE html><html><head><title>.htm extension test page</title></head><body><p>Test content</p></body></html>');

    // PHP file should not be processed (not in the extension list)
    assert.strictEqual(existsFixture('tmp/verify-output/extension.php'), false);
  });

  test('Processes all files when `--file-ext` is an empty string', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/empty-ext',
      '--file-ext=',
      '--collapse-whitespace'
    ];

    const { stderr } = await execCliWithStderr(cliArguments);
    assert.ok(stderr.includes('Warning:'), 'Should warn when processing all file types');

    // Empty `--file-ext=` is treated as wildcard (all files)
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/empty-ext/extension.txt'), true);
  });

  test('Processes files with extensions from a config file (string format)', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html,htm',
      collapseWhitespace: true
    });
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test-config.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-string'
    ];

    await execCli(cliArguments);

    // Should process extensions specified in config
    assert.strictEqual(existsFixture('tmp/config-string/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/config-string/extension.htm'), true);

    // Should not process unspecified extensions
    assert.strictEqual(existsFixture('tmp/config-string/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/config-string/extension.txt'), false);
  });

  test('Processes files with extensions from a config file (array format)', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: ['html'],
      collapseWhitespace: true
    });
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test-config-array.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-array.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-array'
    ];

    await execCli(cliArguments);

    // Should process extensions specified in config array
    assert.strictEqual(existsFixture('tmp/config-array/extension.html'), true);

    // Should not process other extensions
    assert.strictEqual(existsFixture('tmp/config-array/extension.htm'), false);
    assert.strictEqual(existsFixture('tmp/config-array/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/config-array/extension.txt'), false);
  });

  test('Overrides config file extensions with a CLI argument', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html', // Config specifies html
      collapseWhitespace: true
    });
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test-config-override.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-override.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-override',
      '--file-ext=htm' // CLI overrides to htm
    ];

    await execCli(cliArguments);

    // Should process CLI-specified extensions, not config extensions
    assert.strictEqual(existsFixture('tmp/config-override/extension.htm'), true);

    // Should not process config-specified extensions
    assert.strictEqual(existsFixture('tmp/config-override/extension.html'), false);
    assert.strictEqual(existsFixture('tmp/config-override/extension.php'), false);
    assert.strictEqual(existsFixture('tmp/config-override/extension.txt'), false);
  });

  test('Overrides config file extensions with an empty CLI argument (wildcard)', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      fileExt: 'html', // Config restricts to HTML only
      collapseWhitespace: true
    }, null, 2);
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test-config-empty-override.json'), configContent);

    const cliArguments = [
      '--config-file=./tmp/test-config-empty-override.json',
      '--input-dir=./',
      '--output-dir=./tmp/config-empty-override',
      '--file-ext=' // Empty CLI argument overrides config; treated as wildcard
    ];

    const { stderr } = await execCliWithStderr(cliArguments);
    assert.ok(stderr.includes('Warning:'), 'Should warn when processing all file types');

    // Should process ALL files (empty `--file-ext=` is treated as wildcard)
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.html'), true);
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.htm'), true);
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.php'), true);
    assert.strictEqual(existsFixture('tmp/config-empty-override/extension.txt'), true);
  });

  // Default config file discovery tests
  const execCliInDir = async (args, cwd) => {
    const { stdout, stderr, status } = await spawnCli(args, { cwd });
    return {
      stdout: stdout.toString().trim(),
      stderr: stderr.toString().trim(),
      exitCode: status
    };
  };

  const setupConfigDir = (name, configs) => {
    const dir = path.resolve(dirSandbox(), 'tmp', name);
    fs.mkdirSync(dir, { recursive: true });
    for (const [fileName, config] of Object.entries(configs)) {
      fs.writeFileSync(path.join(dir, fileName), JSON.stringify(config, null, 2));
    }
    fs.writeFileSync(path.join(dir, 'input.html'), '<p>foo</p><!-- comment -->');
    return dir;
  };

  test('Loads the default config file from the working directory', async () => {
    const dir = setupConfigDir('config-default', {
      'html-minifier-next.config.json': { removeComments: true }
    });

    const { stdout, stderr, exitCode } = await execCliInDir(['input.html'], dir);

    assert.strictEqual(exitCode, 0);
    assert.ok(stderr.includes('Using config file html-minifier-next.config.json'));
    assert.strictEqual(stdout, '<p>foo</p>');
  });

  test('Loads htmlminifier.config.json as a fallback default config file', async () => {
    const dir = setupConfigDir('config-default-fallback', {
      'htmlminifier.config.json': { removeComments: true }
    });

    const { stdout, stderr, exitCode } = await execCliInDir(['input.html'], dir);

    assert.strictEqual(exitCode, 0);
    assert.ok(stderr.includes('Using config file htmlminifier.config.json'));
    assert.strictEqual(stdout, '<p>foo</p>');
  });

  test('Refuses a string value for an object-valued option in a config file', async () => {
    // Config values are JSON-parsed first, so `"true"` and `"false"` arrive as
    // booleans; anything that is not JSON stays a string and used to read as “on”
    const dir = setupConfigDir('config-string-value', {
      'html-minifier-next.config.json': { minifyCSS: 'yes' }
    });
    fs.writeFileSync(path.join(dir, 'input.html'), '<style>.a { color : red }</style>');

    const { stdout, stderr, exitCode } = await execCliInDir(['input.html'], dir);

    assert.strictEqual(exitCode, 0);
    assert.strictEqual(stdout, '<style>.a { color : red }</style>', 'A string must not enable minification');
    assert.ok(stderr.includes('minifyCSS'), 'The rejected value should be reported');
  });

  test('Still reads `"true"` and `"false"` in a config file as booleans', async () => {
    const input = '<style>.a { color : red }</style>';

    const dirOn = setupConfigDir('config-boolean-string-on', {
      'html-minifier-next.config.json': { minifyCSS: 'true' }
    });
    fs.writeFileSync(path.join(dirOn, 'input.html'), input);
    const on = await execCliInDir(['input.html'], dirOn);

    assert.strictEqual(on.exitCode, 0);
    assert.strictEqual(on.stdout, '<style>.a{color:red}</style>', '`"true"` should enable minification');

    const dirOff = setupConfigDir('config-boolean-string-off', {
      'html-minifier-next.config.json': { minifyCSS: 'false' }
    });
    fs.writeFileSync(path.join(dirOff, 'input.html'), input);
    const off = await execCliInDir(['input.html'], dirOff);

    assert.strictEqual(off.exitCode, 0);
    assert.strictEqual(off.stdout, input, '`"false"` should leave the CSS alone');
  });

  // Values JSON cannot express must reach the minifier as the module exported them
  const configModuleFunctions = [
    'export default {',
    '  minifyCSS: () => "CSS",',
    '  minifyJS: () => "JS",',
    '  minifyURLs: () => "URL"',
    '};'
  ].join('\n');
  const inputFunctions = '<style>a { color: red }</style><script>var x = 1;</script><a href="https://example.com/">x</a>';
  const outputFunctions = '<style>CSS</style><script>JS</script><a href="URL">x</a>';

  test('Applies function values from a JavaScript config file', async () => {
    const dir = setupConfigDir('config-module-functions', {});
    fs.writeFileSync(path.join(dir, 'hmn.config.mjs'), configModuleFunctions);
    fs.writeFileSync(path.join(dir, 'input.html'), inputFunctions);

    const { stdout, stderr, exitCode } = await execCliInDir(['--config-file=hmn.config.mjs', 'input.html'], dir);

    assert.strictEqual(exitCode, 0, stderr);
    assert.strictEqual(stdout, outputFunctions);
  });

  test('Applies function values from a JavaScript config file in a multi-file run', async () => {
    // Functions cannot be passed to worker threads, so the run has to stay in-process
    const dir = setupConfigDir('config-module-functions-dir', {});
    fs.writeFileSync(path.join(dir, 'hmn.config.mjs'), configModuleFunctions);
    fs.mkdirSync(path.join(dir, 'in'), { recursive: true });
    for (const name of ['a.html', 'b.html']) {
      fs.writeFileSync(path.join(dir, 'in', name), inputFunctions);
    }

    const { stderr, exitCode } = await execCliInDir(['--config-file=hmn.config.mjs', '--input-dir=in', '--output-dir=out', '--workers=2'], dir);

    assert.strictEqual(exitCode, 0, stderr);
    for (const name of ['a.html', 'b.html']) {
      assert.strictEqual(fs.readFileSync(path.join(dir, 'out', name), 'utf8'), outputFunctions, name);
    }
  });

  test('Keeps regular expressions from a JavaScript config file', async () => {
    const dir = setupConfigDir('config-module-regexps', {});
    fs.writeFileSync(path.join(dir, 'hmn.config.mjs'), [
      'export default {',
      '  collapseWhitespace: true,',
      '  customAttrCollapse: /^data-x$/,',
      '  ignoreCustomFragments: [/\\{\\{[\\s\\S]*?\\}\\}/],',
      '  minifyCSS: true,',
      '  removeUnusedCSS: { safelist: [/^js-/] }',
      '};'
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'input.html'), '<style>.js-a{color:red}.gone{color:blue}</style><p data-x="a\n  b">{{ keep   me }}   x</p>');

    const { stdout, stderr, exitCode } = await execCliInDir(['--config-file=hmn.config.mjs', 'input.html'], dir);

    assert.strictEqual(exitCode, 0, stderr);
    assert.strictEqual(stderr, '');
    assert.strictEqual(stdout, '<style>.js-a{color:red}</style><p data-x="a b">{{ keep   me }} x</p>');
  });

  test('Applies a single regular expression for an array option from a JavaScript config file', async () => {
    // Wrapped like a single string in a JSON config, rather than dropped
    const dir = setupConfigDir('config-module-regexp-scalar', {});
    fs.writeFileSync(path.join(dir, 'hmn.config.mjs'), 'export default { collapseWhitespace: true, ignoreCustomFragments: /\\{\\{[\\s\\S]*?\\}\\}/ };');
    fs.writeFileSync(path.join(dir, 'input.html'), '<p>{{ keep   me }}   x</p>');

    const { stdout, stderr, exitCode } = await execCliInDir(['--config-file=hmn.config.mjs', 'input.html'], dir);

    assert.strictEqual(exitCode, 0, stderr);
    assert.strictEqual(stdout, '<p>{{ keep   me }} x</p>');
  });

  test('Leaves array options unset for `null` and `undefined` in a JavaScript config file', async () => {
    for (const value of ['null', 'undefined']) {
      const dir = setupConfigDir(`config-module-array-${value}`, {});
      fs.writeFileSync(path.join(dir, 'hmn.config.mjs'), `export default { collapseWhitespace: true, ignoreCustomFragments: ${value}, inlineCustomElements: ${value} };`);
      fs.writeFileSync(path.join(dir, 'input.html'), '<p>{{ a   b }}   x</p>');

      const { stdout, stderr, exitCode } = await execCliInDir(['--config-file=hmn.config.mjs', 'input.html'], dir);

      assert.strictEqual(exitCode, 0, `${value}: ${stderr}`);
      assert.strictEqual(stdout, '<p>{{ a b }} x</p>', value);
    }
  });

  test('Applies SVGO plugin functions from a JavaScript config file', async () => {
    const dir = setupConfigDir('config-module-svgo-plugin', {});
    fs.writeFileSync(path.join(dir, 'hmn.config.mjs'), [
      'export default {',
      '  minifySVG: {',
      '    plugins: [{',
      '      name: "removeTitleCustom",',
      '      fn: () => ({ element: { enter: (node, parent) => {',
      '        if (node.name === "title") parent.children = parent.children.filter(child => child !== node);',
      '      } } })',
      '    }]',
      '  }',
      '};'
    ].join('\n'));
    fs.writeFileSync(path.join(dir, 'input.html'), '<svg viewBox="0 0 1 1"><title>T</title><rect width="1" height="1"/></svg>');

    const { stdout, stderr, exitCode } = await execCliInDir(['--config-file=hmn.config.mjs', 'input.html'], dir);

    assert.strictEqual(exitCode, 0, stderr);
    assert.strictEqual(stdout, '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>');
  });

  test('Prefers html-minifier-next.config.json over htmlminifier.config.json', async () => {
    const dir = setupConfigDir('config-default-precedence', {
      'html-minifier-next.config.json': { removeComments: true },
      'htmlminifier.config.json': { removeComments: false }
    });

    const { stdout, stderr, exitCode } = await execCliInDir(['input.html'], dir);

    assert.strictEqual(exitCode, 0);
    assert.ok(stderr.includes('Using config file html-minifier-next.config.json'));
    assert.strictEqual(stdout, '<p>foo</p>');
  });

  test('Ignores the default config file when `--config-file` is specified', async () => {
    const dir = setupConfigDir('config-default-explicit', {
      'html-minifier-next.config.json': { removeComments: true },
      'explicit.json': { collapseWhitespace: true }
    });

    const { stdout, stderr, exitCode } = await execCliInDir(['--config-file=explicit.json', 'input.html'], dir);

    assert.strictEqual(exitCode, 0);
    assert.ok(!stderr.includes('Using config file'));
    assert.strictEqual(stdout, '<p>foo</p><!-- comment -->');
  });

  // Dry run mode tests
  test('Shows statistics in dry run mode for a single file, verbosely', async () => {
    const cliArguments = [
      'default.html',
      '--dry',
      '--collapse-whitespace'
    ];

    const result = await execCliWithStderr(cliArguments);

    // `--dry` implies verbose mode
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes('collapseWhitespace'));

    // Should output to STDERR
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Would minify:'));
    assert.ok(result.stderr.includes('Original:'));
    assert.ok(result.stderr.includes('Minified:'));
    assert.ok(result.stderr.includes('Saved:'));
    assert.ok(result.stderr.includes('bytes'));

    // Should not output to STDOUT
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);
  });

  test('Shows statistics in dry run mode for a directory', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/dry-test',
      '--dry',
      '--collapse-whitespace'
    ];

    const result = await execCliWithStderr(cliArguments);

    // Should output to STDERR
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(result.stderr.includes('Would process directory:'));
    assert.ok(result.stderr.includes('Total:'));
    assert.ok(result.stderr.includes('bytes'));

    // Should not output to STDOUT
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);
  });

  test('Does not write files in dry run mode', async () => {
    const cliArguments = [
      '--input-dir=./',
      '--output-dir=./tmp/dry-no-write',
      '--dry',
      '--collapse-whitespace'
    ];

    await execCliWithStderr(cliArguments);

    // Should not create output directory or files
    assert.strictEqual(existsFixture('tmp/dry-no-write'), false);
    assert.strictEqual(existsFixture('tmp/dry-no-write/default.html'), false);
  });

  // STDIN/STDOUT pipe tests
  test('Handles STDIN to STDOUT pipe in dry run', async () => {
    const input = '<p>  test  </p>';
    const { stdout, stderr, status } = await spawnCli(['--dry', '--collapse-whitespace'], {
      input: input
    });

    const stderrStr = stderr.toString();

    assert.strictEqual(status, 0);
    assert.ok(stderrStr.includes('[DRY RUN]'));
    assert.ok(stderrStr.includes('STDIN → STDOUT'));
    assert.ok(stderrStr.includes('Original:'));
    assert.ok(stderrStr.includes('Minified:'));
    assert.ok(stderrStr.includes('Saved:'));
    // Should not output minified HTML to STDOUT in dry run
    assert.strictEqual(stdout.toString().trim(), '');
  });

  test('Handles STDIN to file with `-o` flag in dry run', async () => {
    const input = '<p>  test  </p>';
    const { stdout, stderr, status } = await spawnCli(['-o', 'tmp/stdin-output.html', '--dry', '--collapse-whitespace'], {
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

  test('Handles STDIN to STDOUT pipe without dry run', async () => {
    const input = '<p>  test  </p>';
    const { stdout, status } = await spawnCli(['--collapse-whitespace'], {
      input: input
    });

    assert.strictEqual(status, 0);
    assert.strictEqual(stdout.toString().trim(), '<p>test</p>');
  });

  test('Handles EPIPE gracefully when piping to head', async () => {
    // The path goes in as `$1` rather than into the script, so the shell never parses it
    const command = 'node "$1" --collapse-whitespace < default.html | head -n1';
    const { status, stderr } = await spawnAsync('sh', ['-c', command, 'sh', cliPath]);
    // Exit code should be `0` and no noisy errors
    assert.strictEqual(status, 0);
    assert.strictEqual(stderr.toString().trim(), '');
  });

  // `-o` flag combination tests
  test('Handles file to file with `-o` flag in dry run', async () => {
    const result = await execCliWithStderr([
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

  test('Handles file to file with `-o` flag without dry run', async () => {
    // Ensure tmp directory exists
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });

    await execCli([
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

  // `-i` flag tests
  test('Minifies file to file with `-i`/`-o` flags', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });

    await execCli([
      '-i', 'default.html',
      '-o', 'tmp/input-flag-output.html',
      '--collapse-whitespace'
    ]);

    assert.strictEqual(existsFixture('tmp/input-flag-output.html'), true);

    const output = await readFixture('tmp/input-flag-output.html');
    assert.ok(output.length > 0);
    assert.ok(output.includes('<!DOCTYPE html>'));
  });

  test('Produces the same output with `-i` as with a positional argument', async () => {
    const viaPositional = await execCli(['default.html', '--collapse-whitespace']);
    const viaFlag = await execCli(['-i', 'default.html', '--collapse-whitespace']);

    assert.ok(viaPositional.includes('<!DOCTYPE html>'));
    assert.strictEqual(viaPositional, viaFlag);
  });

  test('Throws an error if the file passed to `-i` is not found', async () => {
    await assert.rejects(execCli(['-i', 'no-file.html']), /no such file/);
  });

  test('Warns when a non-HTML file is passed as a positional argument', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test.js'), '// comment\nfunction foo() { return 1; }\n');

    const { stderr, exitCode } = await execCliWithStderr(['tmp/test.js', '--collapse-whitespace']);
    assert.ok(stderr.includes('Warning:'), 'Should warn for non-HTML file extension');
    assert.ok(stderr.includes('test.js'), 'Warning should name the file');
    assert.strictEqual(exitCode, 0, 'Should still exit successfully');
  });

  test('Warns when a non-HTML file is passed via `-i`', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test.css'), '.foo { color: red; }\n');

    const { stderr, exitCode } = await execCliWithStderr(['-i', 'tmp/test.css', '--collapse-whitespace']);
    assert.ok(stderr.includes('Warning:'), 'Should warn for non-HTML file extension');
    assert.ok(stderr.includes('test.css'), 'Warning should name the file');
    assert.strictEqual(exitCode, 0, 'Should still exit successfully');
  });

  test('Shows a helpful error when `-I` receives a file instead of a directory', async () => {
    await assert.rejects(
      execCli(['-I', 'default.html', '-O', './tmp']),
      /is not a directory.*-i.*-o/
    );
  });

  // Error handling tests for dry run
  test('Shows an error in dry run for a non-existent file', async () => {
    const result = await execCliWithStderr([
      'non-existent.html',
      '--dry',
      '--collapse-whitespace'
    ]);

    // Should exit with error
    assert.notStrictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('Cannot read') || result.stderr.includes('no such file'));
  });

  test('Shows an error in dry run for an invalid directory', async () => {
    const result = await execCliWithStderr([
      '--input-dir=./non-existent-dir',
      '--output-dir=./tmp/output',
      '--dry',
      '--collapse-whitespace'
    ]);

    // Should exit with error
    assert.notStrictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('Cannot read') || result.stderr.includes('no such file'));
  });

  test('Handles dry run with a config file', async () => {
    fs.mkdirSync(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    const configContent = JSON.stringify({
      collapseWhitespace: true,
      removeComments: true
    });
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/dry-config.json'), configContent);

    const result = await execCliWithStderr([
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
  });

  // Verbose mode tests
  test('Shows processing info in verbose mode for a single file', async () => {
    const result = await execCliWithStderr([
      'default.html',
      '--verbose',
      '--collapse-whitespace',
      '-o', 'tmp/verbose-output.html'
    ]);

    // Should output to STDERR
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes('collapseWhitespace'));
    assert.ok(result.stderr.includes('✓'));
    assert.ok(result.stderr.includes('default.html'));
    assert.ok(result.stderr.includes('→'));
    assert.ok(result.stderr.includes('bytes'));

    // Should not output to STDOUT
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);

    // Should create output file
    assert.strictEqual(existsFixture('tmp/verbose-output.html'), true);
  });

  test('Shows processing info in verbose mode for a directory', async () => {
    const result = await execCliWithStderr([
      '--input-dir=./',
      '--output-dir=./tmp/verbose-dir',
      '--verbose',
      '--collapse-whitespace'
    ]);

    // Should output to STDERR
    assert.ok(result.stderr.includes('CLI options:'));
    assert.ok(result.stderr.includes('✓'));
    assert.ok(result.stderr.includes('→'));
    assert.ok(result.stderr.includes('bytes'));
    assert.ok(result.stderr.includes('Total:'));

    // Should not output to STDOUT
    assert.strictEqual(result.stdout, '');

    // Should exit successfully
    assert.strictEqual(result.exitCode, 0);

    // Should create output files
    assert.strictEqual(existsFixture('tmp/verbose-dir/default.html'), true);
  });

  test('Shows processing info in verbose mode with STDIN', async () => {
    const input = '<p>  test  </p>';
    const { stdout, stderr, status } = await spawnCli(['--verbose', '--collapse-whitespace', '-o', 'tmp/verbose-stdin.html'], {
      input: input
    });

    const stderrStr = stderr.toString();

    assert.strictEqual(status, 0);
    assert.ok(stderrStr.includes('CLI options:'));
    assert.ok(stderrStr.includes('✓'));
    assert.ok(stderrStr.includes('STDIN'));
    assert.ok(stderrStr.includes('→'));
    assert.ok(stderrStr.includes('bytes'));

    // Should not output to STDOUT
    assert.strictEqual(stdout.toString().trim(), '');

    // Should create output file
    assert.strictEqual(existsFixture('tmp/verbose-stdin.html'), true);
  });

  test('Reports invalid CSS in verbose mode', async () => {
    const result = await execCliWithStderr([
      'invalid-css-js.html',
      '--verbose',
      '--minify-css',
      '-o', 'tmp/invalid-css.html'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(
      result.stderr.includes('Lightning CSS reported invalid CSS'),
      'Rules flagged under error recovery should be reported'
    );
  });

  test('Reports swallowed minification errors in verbose mode', async () => {
    const result = await execCliWithStderr([
      'invalid-css-js.html',
      '--verbose',
      '--minify-js',
      '-o', 'tmp/invalid-js.html'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(
      result.stderr.includes('Minification failed, content left as-is'),
      'Errors swallowed by `continueOnMinifyError` should be reported'
    );
  });

  test('Stays quiet about minifier diagnostics without verbose mode', async () => {
    const result = await execCliWithStderr([
      'invalid-css-js.html',
      '--minify-css',
      '--minify-js',
      '-o', 'tmp/invalid-quiet.html'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(!result.stderr.includes('Lightning CSS reported invalid CSS'));
    assert.ok(!result.stderr.includes('Minification failed, content left as-is'));
    assert.strictEqual(existsFixture('tmp/invalid-quiet.html'), true);
  });

  test('Reports minifier diagnostics with `--dry` flag', async () => {
    const result = await execCliWithStderr([
      'invalid-css-js.html',
      '--dry',
      '--minify-css'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stderr.includes('[DRY RUN]'));
    assert.ok(
      result.stderr.includes('Lightning CSS reported invalid CSS'),
      '`--dry` implies verbose, so diagnostics should show there, too'
    );
  });

  test('Removes unused CSS with `--remove-unused-css`', async () => {
    const output = await execCli(['unused-css.html', '--minify-css', '--remove-unused-css']);

    assert.ok(output.includes('.used'), 'Referenced class should be kept');
    assert.ok(!output.includes('.unused'), 'Unreferenced class should be removed');
  });

  test('Accepts a `--remove-unused-css` safelist as JSON', async () => {
    const output = await execCli(['unused-css.html', '--minify-css', '--remove-unused-css={"safelist":["safe-a"]}']);

    assert.ok(output.includes('.safe-a'), 'Safelisted class should be kept');
    assert.ok(!output.includes('.unused'), 'Unsafelisted class should still be removed');
  });

  test('Refuses `--remove-unused-css` without `--minify-css`', async () => {
    const result = await execCliWithStderr(['unused-css.html', '--remove-unused-css']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('.unused'), 'Nothing should be removed without `--minify-css`');
    assert.ok(
      result.stderr.includes('removeUnusedCSS') && result.stderr.includes('--minify-css'),
      'The warning should name the flag a CLI user would reach for'
    );
  });

  test('Refuses a non-JSON `--minify-css` value', async () => {
    // A bare word parses as a string, which carries no configuration
    const result = await execCliWithStderr(['unused-css.html', '--minify-css=yes']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('<title>Unused CSS</title>'), 'The document should still be written');
    assert.ok(result.stderr.includes('minifyCSS'), 'The rejected value should be reported');
  });

  test('Refuses a non-JSON `--remove-unused-css` value', async () => {
    // A bare word parses as a string, which must not read as “on”
    const result = await execCliWithStderr(['unused-css.html', '--minify-css', '--remove-unused-css=yes']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('.unused'), 'A string must not enable the option');
    assert.ok(result.stderr.includes('removeUnusedCSS'), 'The rejected value should be reported');
  });

  test('Works with both `--dry` and `--verbose` flags', async () => {
    const result = await execCliWithStderr([
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

  test('Does not show verbose output without `--verbose` flag', async () => {
    const result = await execCliWithStderr([
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

  test('Displays the version with `--version` flag', async () => {
    const result = await execCliWithStderr(['--version']);

    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.match(/^\d+\.\d+\.\d+$/));
    assert.strictEqual(result.stderr, '');
  });

  test('Does not show the progress indicator in a non-TTY environment', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/test1.html'), '<html><body><h1>Test</h1></body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/test2.html'), '<html><body><h1>Test</h1></body></html>');

    const result = await execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace'
    ]);

    // In non-TTY (CI/piped), no progress should appear in STDERR
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stderr, '');
    assert.strictEqual(result.stdout, '');
  });

  test('Does not show the progress indicator with `--verbose` flag', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/test1.html'), '<html><body><h1>Test</h1></body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/test2.html'), '<html><body><h1>Test</h1></body></html>');

    const result = await execCliWithStderr([
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
  });

  test('Does not show the progress indicator with `--dry` flag', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/test1.html'), '<html><body><h1>Test</h1></body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/test2.html'), '<html><body><h1>Test</h1></body></html>');

    const result = await execCliWithStderr([
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

  test('Processes multiple subdirectories for progress counting', async () => {
    // Create nested directory structure
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/sub1/sub2'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/test1.html'), '<html><body><h1>Test 1</h1></body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/sub1/test2.html'), '<html><body><h1>Test 2</h1></body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/sub1/sub2/test3.html'), '<html><body><h1>Test 3</h1></body></html>');

    const result = await execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace'
    ]);

    // Should successfully process all files in nested directories
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/test1.html'), true);
    assert.strictEqual(existsFixture('tmp-out/sub1/test2.html'), true);
    assert.strictEqual(existsFixture('tmp-out/sub1/sub2/test3.html'), true);
  });

  test('Supports in-place processing when `--input-dir` and `--output-dir` are the same', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    const original = '<html>  <body>  <p>  Hello  </p>  </body>  </html>';
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/inplace.html'), original);

    const result = await execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp',
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    const output = await readFixture('tmp/inplace.html');
    assert.ok(output.length < original.length, 'File should be minified');
  });

  test('Skips traversing into the output directory when nested in the input directory', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/in/sub'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/in/a.html'), '<html><body>a</body></html>');
    const result = await execCliWithStderr([
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

  test('Skips symbolic links', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/real.html'), '<html><body>x</body></html>');
    // Create symlink pointing to real.html
    const target = path.resolve(dirSandbox(), 'tmp/real.html');
    const link = path.resolve(dirSandbox(), 'tmp/link.html');
    try {
      await fs.promises.symlink(target, link);
    } catch (err) {
      // Skip test on Windows if symlinks not supported
      if (err.code === 'EPERM' || err.code === 'ENOENT') {
        return;
      }
      throw err;
    }
    const result = await execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--collapse-whitespace'
    ]);
    assert.strictEqual(result.exitCode, 0);
    // Only real file should be processed
    assert.strictEqual(existsFixture('tmp-out/real.html'), true);
    assert.strictEqual(existsFixture('tmp-out/link.html'), false);
  });

  test('Uses the “conservative” preset', async () => {
    const input = '<!DOCTYPE html><html>  <body>  <!-- comment -->  <p>  Hello  </p>  </body></html>';
    const { stdout, stderr, status } = await spawnCli(['--preset', 'conservative', '--verbose'], {
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

  test('Uses the “comprehensive” preset', async () => {
    const input = '<!DOCTYPE html><html>  <body>  <!-- comment -->  <p class="z a">  Hello  </p>  </body></html>';
    const { stdout, stderr, status } = await spawnCli(['-p', 'comprehensive', '--verbose'], {
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

  test('Overrides preset options with CLI flags', async () => {
    const input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p class="">test</p>';
    // Conservative preset has `useShortDoctype`, `removeEmptyAttributes` added via CLI
    const { stdout, status } = await spawnCli(['--preset', 'conservative', '--remove-empty-attributes'], {
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

  test('Fails with an unknown preset', async () => {
    await assert.rejects(
      execCli(['--preset', 'unknown', 'default.html']),
      /Unknown preset “unknown”/
    );
  });

  test('Uses the preset from a config file', async () => {
    const configPath = 'preset-config.json';
    await fs.promises.writeFile(path.resolve(dirSandbox(), configPath), JSON.stringify({ preset: 'conservative' }));

    const input = '<!DOCTYPE html><html>  <body>  <!-- comment -->  <p>  Hello  </p>  </body></html>';
    const { stdout, stderr, status } = await spawnCli(['-c', configPath, '--verbose'], {
      input: input
    });

    assert.strictEqual(status, 0);
    assert.ok(stderr.toString().includes('Using preset: conservative'));
    assert.ok(!stdout.toString().includes('<!-- comment -->'));
  });

  test('Warns about unknown config options', async () => {
    const configPath = 'unknown-option-config.json';
    await fs.promises.writeFile(path.resolve(dirSandbox(), configPath), JSON.stringify({ removeScriptTypeAttributes: true, removeComments: true }));

    const input = '<p><!-- comment -->Hello</p>';
    const { stdout, stderr, status } = await spawnCli(['-c', configPath], {
      input: input
    });

    assert.strictEqual(status, 0);
    // Unknown config keys warn but don’t fail
    assert.ok(stderr.toString().includes('removeScriptTypeAttributes'));
    assert.ok(!stdout.toString().includes('<!-- comment -->'));
  });

  test('Accepts cache options from config file and CLI flags', async () => {
    const configPath = 'cache-options-config.json';
    await fs.promises.writeFile(path.resolve(dirSandbox(), configPath), JSON.stringify({ cacheCSS: 300, removeComments: true }));

    const input = '<p><!-- comment -->Hello</p>';
    const { stdout, stderr, status } = await spawnCli(['-c', configPath, '--cache-js', '300', '--verbose'], {
      input: input
    });

    assert.strictEqual(status, 0);
    // Cache options are valid config keys and must not trigger the unknown-option warning
    assert.ok(!stderr.toString().includes('cacheCSS'));
    // The flag value must reach the options passed to `minify` (regression: values used to be parsed but dropped)—
    // verbose mode lists the CLI-provided options that made it into the final options object
    assert.ok(stderr.toString().includes('cacheJS'));
    assert.ok(!stdout.toString().includes('<!-- comment -->'));
  });

  test('Verbose mode prints cache stats, omitting caches that were never touched', async () => {
    // Duplicate `<style>` block to trigger a CSS cache hit; single `<script>` to keep JS at a miss;
    // no `<svg>`/`minifySVG`, so the SVG cache must be omitted entirely
    const input = '<style>body{color:red}</style><style>body{color:red}</style><script>let a=1;</script>';
    const { stdout, stderr, status } = await spawnCli(['--minify-css', '--minify-js', '--verbose'], {
      input
    });

    assert.strictEqual(status, 0);
    const stderrText = stderr.toString();
    assert.ok(stderrText.includes('Cache stats:'));
    assert.ok(stderrText.includes('CSS cache: 1 hit, 1 miss, 1/500 entries'));
    assert.ok(stderrText.includes('JS cache: 0 hits, 1 miss, 1/500 entries'));
    assert.ok(!stderrText.includes('SVG cache:'), 'SVG cache was never touched and should be omitted');
    assert.ok(stdout.toString().length > 0);
  });

  test('Dry run prints cache stats', async () => {
    const input = '<style>body{color:blue}</style>';
    const { stderr, status } = await spawnCli(['--minify-css', '--dry'], {
      input
    });

    assert.strictEqual(status, 0);
    const stderrText = stderr.toString();
    assert.ok(stderrText.includes('[DRY RUN]'));
    assert.ok(stderrText.includes('Cache stats:'));
    assert.ok(stderrText.includes('CSS cache: 0 hits, 1 miss, 1/500 entries'));
  });

  test('Omits cache stats when no cache was touched', async () => {
    const input = '<p>Hello</p>';
    const { stderr, status } = await spawnCli(['--verbose'], {
      input
    });

    assert.strictEqual(status, 0);
    assert.ok(!stderr.toString().includes('Cache stats:'));
  });

  test('Throws an error for an invalid cache-css value', async () => {
    const cliArguments = [
      'default.html',
      '--cache-css=abc'
    ];

    await assert.rejects(execCli(cliArguments), /Invalid number for `--cache-css: "abc"`/);
  });

  test('Overrides config file options with CLI flags when using a preset', async () => {
    const config = { preset: 'conservative', useShortDoctype: false }; // Override preset’s `useShortDoctype`
    const configPath = 'preset-config2.json';
    await fs.promises.writeFile(path.resolve(dirSandbox(), configPath), JSON.stringify(config));

    const input = '<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN"><p>test</p>';
    // Config says `useShortDoctype: false`, but CLI should override to true
    const { stdout, status } = await spawnCli(['-c', configPath, '--use-short-doctype'], {
      input: input
    });

    assert.strictEqual(status, 0);
    // Short doctype should be used due to CLI override
    assert.ok(stdout.toString().includes('<!doctype html>'));
  });

  test('Prioritizes the CLI preset over the config preset', async () => {
    const configPath = 'preset-config3.json';
    await fs.promises.writeFile(path.resolve(dirSandbox(), configPath), JSON.stringify({ preset: 'conservative' }));

    const input = '<!DOCTYPE html><html><body><p class="z a">Hello</p></body></html>';
    // CLI preset should override config preset
    const { stderr, status } = await spawnCli(['-c', configPath, '--preset', 'comprehensive', '--verbose'], {
      input: input
    });

    assert.strictEqual(status, 0);
    assert.ok(stderr.toString().includes('Using preset: comprehensive'));
  });

  test('Ignores a single directory by name', async () => {
    // Create test structure: tmp/a.html, tmp/libs/b.html, tmp/sub/c.html
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs/sub'), { recursive: true });
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/sub'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/sub/d.html'), '<html><body>d</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/sub/c.html'), '<html><body>c</body></html>');

    const result = await execCliWithStderr([
      '-I', 'tmp',
      '-O', 'tmp-out',
      '-X', 'libs',
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    // Should process a.html and sub/c.html
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/sub/c.html'), true);
    // Should not process libs/b.html and libs/sub/d.html
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
    assert.strictEqual(existsFixture('tmp-out/libs/sub/d.html'), false);
  });

  test('Ignores multiple directories', async () => {
    // Create test structure
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/vendor'), { recursive: true });
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/src'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/vendor/c.html'), '<html><body>c</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/src/d.html'), '<html><body>d</body></html>');

    const result = await execCliWithStderr([
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
  });

  test('Ignores directories by relative path', async () => {
    // Create test structure
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/static/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/static/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/c.html'), '<html><body>c</body></html>');

    const result = await execCliWithStderr([
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
  });

  test('Supports `ignoreDir` from a config file as string', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/b.html'), '<html><body>b</body></html>');

    const configContent = JSON.stringify({
      collapseWhitespace: true,
      ignoreDir: 'libs'
    }, null, 2);
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test-config-ignore.json'), configContent);

    const result = await execCliWithStderr([
      '--config-file=./tmp/test-config-ignore.json',
      '--input-dir=tmp',
      '--output-dir=tmp-out'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
  });

  test('Supports `ignoreDir` from a config file as array', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/vendor'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/vendor/c.html'), '<html><body>c</body></html>');

    const configContent = JSON.stringify({
      collapseWhitespace: true,
      ignoreDir: ['libs', 'vendor']
    }, null, 2);
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test-config-ignore-array.json'), configContent);

    const result = await execCliWithStderr([
      '--config-file=./tmp/test-config-ignore-array.json',
      '--input-dir=tmp',
      '--output-dir=tmp-out'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
    assert.strictEqual(existsFixture('tmp-out/vendor/c.html'), false);
  });

  test('Lets CLI `ignore-dir` override the config file', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/vendor'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/vendor/c.html'), '<html><body>c</body></html>');

    const configContent = JSON.stringify({
      collapseWhitespace: true,
      ignoreDir: 'libs' // Config says ignore libs
    }, null, 2);
    fs.writeFileSync(path.resolve(dirSandbox(), 'tmp/test-config-ignore-override.json'), configContent);

    const result = await execCliWithStderr([
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
  });

  test('Handles `ignore-dir` with spaces in a comma-separated list', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs'), { recursive: true });
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/vendor'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/b.html'), '<html><body>b</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/vendor/c.html'), '<html><body>c</body></html>');

    const result = await execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=libs, vendor', // Note the space after comma
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
    assert.strictEqual(existsFixture('tmp-out/vendor/c.html'), false);
  });

  test('Handles `ignore-dir` with trailing slashes', async () => {
    await fs.promises.mkdir(path.resolve(dirSandbox(), 'tmp/libs'), { recursive: true });
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/a.html'), '<html><body>a</body></html>');
    await fs.promises.writeFile(path.resolve(dirSandbox(), 'tmp/libs/b.html'), '<html><body>b</body></html>');

    const result = await execCliWithStderr([
      '--input-dir=tmp',
      '--output-dir=tmp-out',
      '--ignore-dir=libs/', // Trailing slash should be stripped
      '--collapse-whitespace'
    ]);

    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(existsFixture('tmp-out/a.html'), true);
    assert.strictEqual(existsFixture('tmp-out/libs/b.html'), false);
  });

  // `--zero` flag tests
  test('Emits a note and continues normally when `--zero` is combined with other options', async () => {
    const { stdout, stderr, status } = await spawnCli(['--zero', '--collapse-whitespace'], {
      input: '<p>  test  </p>'
    });

    assert.strictEqual(status, 0);
    assert.ok(stderr.toString().includes('`--zero` was ignored'));
    // Normal processing still runs: STDIN is minified and written to STDOUT
    assert.strictEqual(stdout.toString().trim(), '<p>test</p>');
  });

  test('Aborts `--zero` when confirmation is denied', async () => {
    const tempDir = path.resolve(dirSandbox(), 'tmp/zero-abort');
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.copyFile(
      path.resolve(dirSandbox(), 'default.html'),
      path.resolve(tempDir, 'default.html')
    );
    const original = await fs.promises.readFile(path.resolve(tempDir, 'default.html'), 'utf-8');

    const result = await spawnCli(['--zero'], {
      cwd: tempDir,
      input: 'n\n'
    });

    assert.strictEqual(result.status, 0);
    assert.ok(result.stderr.toString().includes('aborted'));
    const content = await fs.promises.readFile(path.resolve(tempDir, 'default.html'), 'utf-8');
    assert.strictEqual(content, original);
  });

  test('Aborts `--zero` when confirmation input is empty (default no)', async () => {
    const tempDir = path.resolve(dirSandbox(), 'tmp/zero-empty');
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.copyFile(
      path.resolve(dirSandbox(), 'default.html'),
      path.resolve(tempDir, 'default.html')
    );
    const original = await fs.promises.readFile(path.resolve(tempDir, 'default.html'), 'utf-8');

    const result = await spawnCli(['--zero'], {
      cwd: tempDir,
      input: '\n'
    });

    assert.strictEqual(result.status, 0);
    assert.ok(result.stderr.toString().includes('aborted'));
    const content = await fs.promises.readFile(path.resolve(tempDir, 'default.html'), 'utf-8');
    assert.strictEqual(content, original);
  });

  test('Minifies HTML files in place when `--zero` is confirmed', async () => {
    const tempDir = path.resolve(dirSandbox(), 'tmp/zero-confirm');
    await fs.promises.mkdir(tempDir, { recursive: true });
    await fs.promises.copyFile(
      path.resolve(dirSandbox(), 'default.html'),
      path.resolve(tempDir, 'default.html')
    );
    const original = await fs.promises.readFile(path.resolve(tempDir, 'default.html'), 'utf-8');

    const result = await spawnCli(['--zero'], {
      cwd: tempDir,
      input: 'y\n'
    });

    assert.strictEqual(result.status, 0);
    assert.ok(result.stderr.toString().includes('Processed'));
    const minified = await fs.promises.readFile(path.resolve(tempDir, 'default.html'), 'utf-8');
    assert.notStrictEqual(minified, original);
    assert.ok(minified.length < original.length);
  });

  test('Processes subfolders when `--zero` is confirmed', async () => {
    const tempDir = path.resolve(dirSandbox(), 'tmp/zero-subfolders');
    const subDir = path.resolve(tempDir, 'sub');
    await fs.promises.mkdir(subDir, { recursive: true });
    await fs.promises.writeFile(path.resolve(tempDir, 'a.html'), '<html>  <body>  hello  </body>  </html>');
    await fs.promises.writeFile(path.resolve(subDir, 'b.html'), '<html>  <body>  world  </body>  </html>');

    const result = await spawnCli(['--zero'], {
      cwd: tempDir,
      input: 'y\n'
    });

    assert.strictEqual(result.status, 0);
    const a = await fs.promises.readFile(path.resolve(tempDir, 'a.html'), 'utf-8');
    const b = await fs.promises.readFile(path.resolve(subDir, 'b.html'), 'utf-8');
    // Comprehensive preset collapses whitespace
    assert.ok(!a.includes('  '));
    assert.ok(!b.includes('  '));
  });

  test('Shows a confirmation prompt for `-z`', async () => {
    const tempDir = path.resolve(dirSandbox(), 'tmp/zero-prompt');
    await fs.promises.mkdir(tempDir, { recursive: true });

    const result = await spawnCli(['-z'], {
      cwd: tempDir,
      input: 'n\n'
    });

    assert.ok(result.stderr.toString().includes('in place'));
    assert.ok(result.stderr.toString().includes('version control'));
    assert.ok(result.stderr.toString().includes('[y/N]'));
  });

  // Boolean flag negation tests
  test('`--no-X` overrides a boolean option enabled by a preset', async () => {
    const input = '<p>  hello  world</p>';

    const { stdout: withPreset, status: presetStatus } = await spawnCli(['--preset=comprehensive'], {
      input
    });
    const { stdout: withNegation, status: negationStatus } = await spawnCli(['--preset=comprehensive', '--no-collapse-whitespace'], {
      input
    });

    assert.strictEqual(presetStatus, 0);
    assert.strictEqual(negationStatus, 0);
    // The comprehensive preset collapses whitespace, so the original double spaces are gone
    assert.ok(!withPreset.toString().includes('  hello  world'));
    // `--no-collapse-whitespace` disables whitespace collapsing, so whitespace is preserved
    assert.ok(withNegation.toString().includes('  hello  world'));
    // The two runs therefore differ
    assert.notStrictEqual(withPreset.toString().trim(), withNegation.toString().trim());
  });

  test('`--no-X` has no effect when the option is already disabled', async () => {
    const input = '<p>  hello  </p>';

    const { stdout: plain, status: plainStatus } = await spawnCli([], {
      input
    });
    const { stdout: withNegation, status: negationStatus } = await spawnCli(['--no-collapse-whitespace'], {
      input
    });

    assert.strictEqual(plainStatus, 0);
    assert.strictEqual(negationStatus, 0);
    // `collapseWhitespace` defaults to false, so `--no-collapse-whitespace` changes nothing
    assert.strictEqual(plain.toString().trim(), withNegation.toString().trim());
  });

  test('`--continue-on-minify-error` is recognized as the positive form of the flag', async () => {
    const input = '<p>test</p>';
    const { stdout, status } = await spawnCli(['--continue-on-minify-error'], {
      input
    });
    assert.strictEqual(status, 0);
    assert.strictEqual(stdout.toString().trim(), '<p>test</p>');
  });

  test('`--no-newlines-before-tag-close` is applied and matches the JS API', async () => {
    // This flag was previously silently ignored due to a Commander key mismatch
    const input = '<a title="x"href=" ">foo</a>';
    const expected = await minify(input, { maxLineLength: 25, noNewlinesBeforeTagClose: true });

    const { stdout, status } = await spawnCli(['--max-line-length=25', '--no-newlines-before-tag-close'], {
      input
    });

    assert.strictEqual(status, 0);
    assert.strictEqual(stdout.toString().trim(), expected);
  });
});

// Each run here starts worker threads of its own, so fewer of them share the machine at once
describe('Parallel multi-file processing', { concurrency: Math.max(1, Math.floor(os.availableParallelism() / 2)) }, () => {
  const execCliCapture = async (/** @type {string[]} */ args) => {
    const { stdout, stderr, status } = await spawnCli(args);
    return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: status };
  };

  // A page per file, varied enough that whitespace, CSS, JS, and SVG all take part,
  // and repeated enough across files to exercise the shared minification caches
  const buildInputDir = (/** @type {string} */ name, /** @type {number} */ count) => {
    const dir = path.resolve(dirSandbox(), 'tmp', name);
    fs.mkdirSync(dir, { recursive: true });
    for (let i = 0; i < count; i++) {
      fs.writeFileSync(path.join(dir, `page-${i}.html`),
        '<!doctype html>\n<html>\n  <head>\n    <title>Page ' + i + '</title>\n' +
        '    <style>  .shared { color : red ; }  </style>\n' +
        '    <style>  .p' + i + ' { color : blue ; }  </style>\n' +
        '  </head>\n  <body>\n    <p>   Page ' + i + '   </p>\n' +
        '    <svg viewBox="0 0 10 10"><rect x="0" y="0" width="10" height="10"/></svg>\n' +
        '    <script>  var shared = 1 ;  console.log( shared ) ;  </script>\n' +
        '    <script>  var local' + i + ' = ' + i + ' ;  </script>\n' +
        '  </body>\n</html>\n');
    }
    return dir;
  };

  const readOutputs = (/** @type {string} */ dir) =>
    fs.readdirSync(dir).sort().map(f => [f, fs.readFileSync(path.join(dir, f), 'utf8')]);

  // Plain filler, since these runs depend on how many bytes a file holds rather than on
  // what minifying it involves
  const buildSizedDir = (/** @type {string} */ name, /** @type {number[]} */ byteSizes) => {
    const dir = path.resolve(dirSandbox(), 'tmp', name);
    fs.mkdirSync(dir, { recursive: true });
    const block = '<section class="card"><h2>Heading</h2><p>Lorem ipsum dolor sit amet.</p></section>\n';
    byteSizes.forEach((bytes, i) => {
      fs.writeFileSync(path.join(dir, `page-${i}.html`),
        '<!doctype html>\n<html>\n  <body>\n' + block.repeat(Math.ceil(bytes / block.length)) + '  </body>\n</html>\n');
    });
    return dir;
  };

  const MB = 1024 * 1024;

  const OPTIONS_MINIFY = ['--collapse-whitespace', '--remove-comments', '--minify-css', '--minify-js', '--minify-svg'];

  test('Files are handed to the pool largest first, ties in discovery order', async () => {
    const { orderLargestFirst } = await import('../src/lib/file-pool.js');
    assert.deepStrictEqual(orderLargestFirst(['a', 'b', 'c', 'd', 'e'], [10, 300, 0, 300, 20]), ['b', 'd', 'e', 'a', 'c']);
    assert.deepStrictEqual(orderLargestFirst([], []), []);
  });

  test('A worker names the step it failed at', async () => {
    const { createFilePool } = await import('../src/lib/file-pool.js');
    const dir = path.resolve(dirSandbox(), 'tmp', 'par-stage');
    fs.mkdirSync(dir, { recursive: true });
    const pool = createFilePool({ options: { minifyJS: true, continueOnMinifyError: false }, size: 1 });

    try {
      const missing = path.join(dir, 'absent.html');
      await assert.rejects(
        pool.run({ inputFile: missing, outputFile: path.join(dir, 'out.html'), dryRun: false }),
        (/** @type {any} */ err) => err.stage === 'read'
      );

      await assert.rejects(
        pool.run({ inputFile: path.resolve(dirSandbox(), 'invalid-css-js.html'), outputFile: path.join(dir, 'out.html'), dryRun: false }),
        (/** @type {any} */ err) => err.stage === 'minify'
      );

      await assert.rejects(
        pool.run({ inputFile: path.resolve(dirSandbox(), 'default.html'), outputFile: path.join(dir, 'absent-dir', 'out.html'), dryRun: false }),
        (/** @type {any} */ err) => err.stage === 'write'
      );
    } finally {
      await pool.close();
    }
  });

  test('Parallel output is byte-identical to sequential output', async () => {
    buildInputDir('par-in', 40);

    await execCli(['--input-dir=./tmp/par-in', '--output-dir=./tmp/par-seq', '--workers=1', ...OPTIONS_MINIFY]);
    await execCli(['--input-dir=./tmp/par-in', '--output-dir=./tmp/par-par', '--workers=4', ...OPTIONS_MINIFY]);

    const sequential = readOutputs(path.resolve(dirSandbox(), 'tmp/par-seq'));
    const parallel = readOutputs(path.resolve(dirSandbox(), 'tmp/par-par'));

    assert.strictEqual(parallel.length, 40, 'Every input file is written');
    assert.deepStrictEqual(parallel, sequential);
  });

  test('A run too small to repay a worker still produces the same output', async () => {
    buildInputDir('par-small-in', 2);

    await execCli(['--input-dir=./tmp/par-small-in', '--output-dir=./tmp/par-small-a', '--workers=1', ...OPTIONS_MINIFY]);
    await execCli(['--input-dir=./tmp/par-small-in', '--output-dir=./tmp/par-small-b', '--workers=4', ...OPTIONS_MINIFY]);

    assert.deepStrictEqual(
      readOutputs(path.resolve(dirSandbox(), 'tmp/par-small-b')),
      readOutputs(path.resolve(dirSandbox(), 'tmp/par-small-a'))
    );
  });

  // Half the cores decides the default pool, so a machine this narrow has no pool to
  // form and nothing for the test below to observe
  const hasCoresForPool = os.availableParallelism() >= 4;

  (hasCoresForPool ? test : test.skip)('A small run carrying enough to share out goes wide', async () => {
    const byteSizes = [1.2 * MB, 1.2 * MB, 1.2 * MB];
    buildSizedDir('par-bytes-in', byteSizes);

    const { stderr, exitCode } = await execCliCapture([
      '--input-dir=./tmp/par-bytes-in', '--output-dir=./tmp/par-bytes-out', '--verbose', '--remove-comments'
    ]);

    assert.strictEqual(exitCode, 0);
    const reported = stderr.match(/^Worker threads: (\d+)$/m);
    assert.ok(reported, `Three sizeable files are worth sharing out, got: ${stderr}`);
    const workers = Number(reported[1]);
    // No file is split, so a pool never exceeds one worker per file
    assert.ok(
      workers >= 2 && workers <= byteSizes.length,
      `Expected between 2 and ${byteSizes.length} workers, got ${workers}`
    );
  });

  test('A run whose bytes sit in one file stays in-process', async () => {
    // The one large file cannot be split, so the pool would have only the crumbs
    // around it to work on while paying for every worker it started
    buildSizedDir('par-skew-in', [3 * MB, 1024, 1024, 1024]);

    const { stderr, exitCode } = await execCliCapture([
      '--input-dir=./tmp/par-skew-in', '--output-dir=./tmp/par-skew-out', '--verbose', '--remove-comments'
    ]);

    assert.strictEqual(exitCode, 0);
    assert.match(stderr, /Worker threads: none/);
  });

  test('A small run of small files stays in-process', async () => {
    buildInputDir('par-light-in', 4);

    const { stderr, exitCode } = await execCliCapture([
      '--input-dir=./tmp/par-light-in', '--output-dir=./tmp/par-light-out', '--verbose', '--remove-comments'
    ]);

    assert.strictEqual(exitCode, 0);
    assert.match(stderr, /Worker threads: none/);
  });

  test('A single file stays in-process even when workers are asked for', async () => {
    const dir = buildInputDir('par-single-in', 1);
    assert.strictEqual(fs.readdirSync(dir).length, 1);

    const { stderr, exitCode } = await execCliCapture([
      '--input-dir=./tmp/par-single-in', '--output-dir=./tmp/par-single-out', '--workers=4', '--verbose', '--remove-comments'
    ]);

    assert.strictEqual(exitCode, 0);
    assert.match(stderr, /Worker threads: none/, 'One file gives a pool nothing to share out');
    assert.strictEqual(fs.readdirSync(path.resolve(dirSandbox(), 'tmp/par-single-out')).length, 1);
  });

  test('`--workers=0` is read as “no workers” rather than as no work', async () => {
    buildInputDir('par-zero-in', 6);
    await execCli(['--input-dir=./tmp/par-zero-in', '--output-dir=./tmp/par-zero-out', '--workers=0', ...OPTIONS_MINIFY]);

    assert.strictEqual(fs.readdirSync(path.resolve(dirSandbox(), 'tmp/par-zero-out')).length, 6);
  });

  test('A file the minifier rejects is named, and the run does not hang', async () => {
    const dir = buildInputDir('par-bad-in', 8);
    fs.writeFileSync(path.join(dir, 'broken.html'), '<script>var = = =;</script>');

    const result = await execCliCapture([
      '--input-dir=./tmp/par-bad-in', '--output-dir=./tmp/par-bad-out',
      '--workers=4', '--minify-js', '--no-continue-on-minify-error'
    ]);

    assert.notStrictEqual(result.exitCode, 0, 'The run fails rather than reporting success');
    assert.match(result.stderr, /broken\.html/);
  });

  test('Workers and this process agree on whether a run failed', async () => {
    const dir = buildInputDir('par-parity-in', 8);
    fs.writeFileSync(path.join(dir, 'broken.html'), '<script>var = = =;</script>');

    const argsFor = (/** @type {string} */ workers, /** @type {string} */ out) => [
      '--input-dir=./tmp/par-parity-in', `--output-dir=./tmp/${out}`, `--workers=${workers}`, '--minify-js'
    ];

    // Tolerated by default, so both paths finish and leave the offending script as it is
    const lenientSequential = await execCliCapture(argsFor('1', 'par-parity-a'));
    const lenientParallel = await execCliCapture(argsFor('4', 'par-parity-b'));
    assert.strictEqual(lenientParallel.exitCode, lenientSequential.exitCode);
    assert.deepStrictEqual(
      readOutputs(path.resolve(dirSandbox(), 'tmp/par-parity-b')),
      readOutputs(path.resolve(dirSandbox(), 'tmp/par-parity-a'))
    );

    // And both stop where the option says to stop
    const strictSequential = await execCliCapture([...argsFor('1', 'par-parity-c'), '--no-continue-on-minify-error']);
    const strictParallel = await execCliCapture([...argsFor('4', 'par-parity-d'), '--no-continue-on-minify-error']);
    assert.notStrictEqual(strictSequential.exitCode, 0);
    assert.strictEqual(strictParallel.exitCode, strictSequential.exitCode);
  });

  test('A warning from a worker is worded as it is in this process', async () => {
    const dir = buildInputDir('par-warn-in', 8);
    fs.writeFileSync(path.join(dir, 'broken.html'), '<p>x</p><script>var = = =;</script>');

    const warningsFrom = async (/** @type {string} */ workers, /** @type {string} */ out) =>
      (await execCliCapture([
        '--input-dir=./tmp/par-warn-in', `--output-dir=./tmp/${out}`,
        `--workers=${workers}`, '--minify-js', '--verbose'
      ])).stderr.split('\n').filter(line => line.includes('Minification failed')).map(line => line.trim());

    const sequential = await warningsFrom('1', 'par-warn-a');
    const parallel = await warningsFrom('4', 'par-warn-b');

    // An `Error` the minifier logs is worded differently from a plain message, and that
    // wording has to survive the trip back from a worker
    assert.deepStrictEqual(parallel, sequential);
    assert.match(parallel[0] ?? '', /Warning: Minification failed, content left as-is:/);

    // Lines from several files interleave, so each has to say which file it belongs to
    assert.strictEqual(parallel.length, 1, 'Only the one broken file warns');
    assert.match(parallel[0] ?? '', /\(.*broken\.html\)$/);
  });

  test('An invalid worker count is rejected', async () => {
    await assert.rejects(
      execCli(['--input-dir=./tmp', '--output-dir=./tmp/par-invalid', '--workers=abc']),
      /Invalid number for `--workers: "abc"`/
    );
  });
});

// Sequential, as some tests here stand in for `fs.promises.open` in this process
describe('Output file integrity', () => {
  // An abrupt exit (a native crash, an OOM kill) gives no chance to clean up, so
  // content has to land somewhere else first and be moved into place in one step
  test('Output content is never written to the destination path directly', async () => {
    const dirBase = path.resolve(dirSandbox(), 'tmp-atomic');
    const dirInput = path.resolve(dirBase, 'in');
    const dirOutput = path.resolve(dirBase, 'out');
    const fileLog = path.resolve(dirBase, 'written.log');
    await fs.promises.mkdir(dirInput, { recursive: true });

    for (const name of ['a.html', 'b.html', 'c.html']) {
      await fs.promises.writeFile(path.resolve(dirInput, name), '<p   class="x"  >Text</p>');
    }

    // Record every path the CLI writes content to, before it is moved into place
    const configPath = path.resolve(dirBase, 'record.config.mjs');
    await fs.promises.writeFile(configPath, [
      "import fs from 'fs';",
      `const fileLog = ${JSON.stringify(fileLog)};`,
      'const write = fs.promises.writeFile.bind(fs.promises);',
      'fs.promises.writeFile = (file, ...rest) => {',
      '  fs.appendFileSync(fileLog, String(file) + String.fromCharCode(10));',
      '  return write(file, ...rest);',
      '};',
      'const open = fs.promises.open.bind(fs.promises);',
      'fs.promises.open = (file, flags, ...rest) => {',
      '  if (/[wa+]/.test(String(flags))) fs.appendFileSync(fileLog, String(file) + String.fromCharCode(10));',
      '  return open(file, flags, ...rest);',
      '};',
      'export default {collapseWhitespace: true};'
    ].join(String.fromCharCode(10)));

    await execCliWithStderr(['--input-dir', dirInput, '--output-dir', dirOutput, '--config-file', configPath]);

    assert.deepStrictEqual((await fs.promises.readdir(dirOutput)).sort(), ['a.html', 'b.html', 'c.html']);

    const written = (await fs.promises.readFile(fileLog, 'utf8')).split(String.fromCharCode(10)).filter(Boolean);
    const direct = written.filter(file => ['a.html', 'b.html', 'c.html'].includes(path.basename(file)));
    assert.deepStrictEqual(direct, [], `Written straight to the destination: ${direct.join(', ')}`);
  });

  test('An existing output file keeps its permissions', { skip: process.platform === 'win32' && 'POSIX file modes' }, async () => {
    const dirInput = path.resolve(dirSandbox(), 'tmp-atomic/in3');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out3');
    await fs.promises.mkdir(dirInput, { recursive: true });
    await fs.promises.mkdir(dirOutput, { recursive: true });
    await fs.promises.writeFile(path.resolve(dirInput, 'a.html'), '<p   class="x"  >Text</p>');

    await fs.promises.writeFile(path.resolve(dirInput, 'b.html'), '<p   class="x"  >Text</p>');

    // A mode the umask would clear as well as one it would not
    const modes = { 'a.html': 0o600, 'b.html': 0o664 };
    for (const [name, mode] of Object.entries(modes)) {
      const fileOutput = path.resolve(dirOutput, name);
      await fs.promises.writeFile(fileOutput, 'Previous output');
      await fs.promises.chmod(fileOutput, mode);
    }

    const { exitCode, stderr } = await execCliWithStderr(['--input-dir', dirInput, '--output-dir', dirOutput, '--collapse-whitespace']);
    assert.strictEqual(exitCode, 0, `The run is expected to succeed: ${stderr}`);

    for (const [name, mode] of Object.entries(modes)) {
      const fileOutput = path.resolve(dirOutput, name);
      // Without this the modes below would hold for a file the run never touched
      assert.notStrictEqual(await fs.promises.readFile(fileOutput, 'utf8'), 'Previous output', `${name} should have been rewritten`);

      const stats = await fs.promises.stat(fileOutput);
      assert.strictEqual(stats.mode & 0o777, mode, `${name} should stay ${mode.toString(8)}`);
    }
  });

  test('No temporary files survive a successful run', async () => {
    const dirInput = path.resolve(dirSandbox(), 'tmp-atomic/in2');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out2');
    await fs.promises.mkdir(dirInput, { recursive: true });
    await fs.promises.writeFile(path.resolve(dirInput, 'a.html'), '<p   class="x"  >Text</p>');

    await execCliWithStderr(['--input-dir', dirInput, '--output-dir', dirOutput, '--collapse-whitespace']);

    assert.deepStrictEqual(await fs.promises.readdir(dirOutput), ['a.html']);
  });

  test('A symlinked output file is written through rather than replaced', { skip: process.platform === 'win32' && 'Symlinks need elevated rights' }, async () => {
    const dirInput = path.resolve(dirSandbox(), 'tmp-atomic/in4');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out4');
    const dirTarget = path.resolve(dirSandbox(), 'tmp-atomic/target4');
    await fs.promises.mkdir(dirInput, { recursive: true });
    await fs.promises.mkdir(dirOutput, { recursive: true });
    await fs.promises.mkdir(dirTarget, { recursive: true });
    await fs.promises.writeFile(path.resolve(dirInput, 'a.html'), '<p   class="x"  >Text</p>');

    const fileTarget = path.resolve(dirTarget, 'a.html');
    const fileLink = path.resolve(dirOutput, 'a.html');
    await fs.promises.writeFile(fileTarget, 'Previous output');
    await fs.promises.symlink(path.relative(dirOutput, fileTarget), fileLink);

    const { exitCode, stderr } = await execCliWithStderr(['--input-dir', dirInput, '--output-dir', dirOutput, '--collapse-whitespace']);
    assert.strictEqual(exitCode, 0, `The run is expected to succeed: ${stderr}`);

    assert.ok((await fs.promises.lstat(fileLink)).isSymbolicLink(), 'The link should still be a link');
    assert.strictEqual(await fs.promises.readFile(fileTarget, 'utf8'), '<p class="x">Text</p>', 'The file linked to should hold the output');
    assert.deepStrictEqual(await fs.promises.readdir(dirTarget), ['a.html'], 'No temporary file should be left next to the file linked to');
  });

  test('A run on worker threads writes output the same way', { skip: process.platform === 'win32' && 'Symlinks and POSIX file modes' }, async () => {
    const dirInput = path.resolve(dirSandbox(), 'tmp-atomic/in5');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out5');
    const dirTarget = path.resolve(dirSandbox(), 'tmp-atomic/target5');
    for (const dir of [dirInput, dirOutput, dirTarget]) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    for (const name of ['a.html', 'b.html']) {
      await fs.promises.writeFile(path.resolve(dirInput, name), '<p   class="x"  >Text</p>');
    }

    const fileTarget = path.resolve(dirTarget, 'a.html');
    const fileLink = path.resolve(dirOutput, 'a.html');
    await fs.promises.writeFile(fileTarget, 'Previous output');
    await fs.promises.symlink(path.relative(dirOutput, fileTarget), fileLink);

    const fileMode = path.resolve(dirOutput, 'b.html');
    await fs.promises.writeFile(fileMode, 'Previous output');
    await fs.promises.chmod(fileMode, 0o600);
    const { ino } = await fs.promises.stat(fileMode);

    const { exitCode, stderr } = await execCliWithStderr(['--input-dir', dirInput, '--output-dir', dirOutput, '--collapse-whitespace', '--workers', '2', '--verbose']);
    assert.strictEqual(exitCode, 0, `The run is expected to succeed: ${stderr}`);
    assert.match(stderr, /Worker threads: 2/, 'Without the pool this would test the in-process path again');

    assert.ok((await fs.promises.lstat(fileLink)).isSymbolicLink(), 'The link should still be a link');
    assert.strictEqual(await fs.promises.readFile(fileTarget, 'utf8'), '<p class="x">Text</p>', 'The file linked to should hold the output');
    assert.strictEqual(await fs.promises.readFile(fileMode, 'utf8'), '<p class="x">Text</p>', 'b.html should have been rewritten');
    assert.strictEqual((await fs.promises.stat(fileMode)).mode & 0o777, 0o600, 'b.html should stay 600');
    // Writing in place keeps the inode (and the symlink and mode above along with it), so only a new one shows the output was moved into place
    assert.notStrictEqual((await fs.promises.stat(fileMode)).ino, ino, 'b.html should have been replaced rather than written through');
    assert.deepStrictEqual((await fs.promises.readdir(dirOutput)).sort(), ['a.html', 'b.html'], 'No temporary file should be left');
  });

  test('A dangling symlinked output file is written through, in-process and on worker threads', { skip: process.platform === 'win32' && 'Symlinks need elevated rights' }, async () => {
    for (const [flow, flags] of [['in-process', []], ['workers', ['--workers', '2', '--verbose']]]) {
      const dirBase = path.resolve(dirSandbox(), `tmp-atomic/dangling-${flow.replace(' ', '-')}`);
      const dirInput = path.resolve(dirBase, 'in');
      const dirOutput = path.resolve(dirBase, 'out');
      const dirTarget = path.resolve(dirBase, 'target');
      for (const dir of [dirInput, dirOutput, dirTarget]) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      for (const name of ['a.html', 'b.html']) {
        await fs.promises.writeFile(path.resolve(dirInput, name), '<p   class="x"  >Text</p>');
        // Relative, and pointing at a file that does not exist yet
        await fs.promises.symlink(path.join('..', 'target', name), path.resolve(dirOutput, name));
      }

      const { exitCode, stderr } = await execCliWithStderr(['--input-dir', dirInput, '--output-dir', dirOutput, '--collapse-whitespace', ...flags]);
      assert.strictEqual(exitCode, 0, `The run is expected to succeed (${flow}): ${stderr}`);
      if (flags.length) {
        assert.match(stderr, /Worker threads: 2/, 'Without the pool this would test the in-process path again');
      }

      for (const name of ['a.html', 'b.html']) {
        assert.ok((await fs.promises.lstat(path.resolve(dirOutput, name))).isSymbolicLink(), `${name} should still be a link (${flow})`);
        assert.strictEqual(await fs.promises.readFile(path.resolve(dirTarget, name), 'utf8'), '<p class="x">Text</p>', `The file ${name} links to should have been created (${flow})`);
      }
      assert.deepStrictEqual((await fs.promises.readdir(dirTarget)).sort(), ['a.html', 'b.html'], `No temporary file should be left (${flow})`);
    }
  });

  // Stands in for `fs.promises.open` while `run` goes, so a test can watch or steer how temporary files are created
  const withOpen = async (replacement, run) => {
    const open = fs.promises.open;
    fs.promises.open = (...args) => replacement(open.bind(fs.promises), ...args);
    try {
      return await run();
    } finally {
      fs.promises.open = open;
    }
  };

  test('Temporary files are created exclusively, under names that cannot be predicted', async () => {
    const { writeFileAtomic } = await import('../src/lib/file-write.js');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out6');
    await fs.promises.mkdir(dirOutput, { recursive: true });
    const fileOutput = path.resolve(dirOutput, 'a.html');

    const opened = [];
    await withOpen((open, file, flags, ...rest) => {
      opened.push({ file: String(file), flags });
      return open(file, flags, ...rest);
    }, async () => {
      await writeFileAtomic(fileOutput, 'First');
      await writeFileAtomic(fileOutput, 'Second');
    });

    assert.strictEqual(await fs.promises.readFile(fileOutput, 'utf8'), 'Second');
    assert.strictEqual(opened.length, 2, 'Each write should create its temporary file once');
    assert.ok(opened.every(({ flags }) => flags === 'wx'), 'A file or link already at the temporary path must not be written through');
    assert.notStrictEqual(opened[0].file, opened[1].file);
    assert.ok(opened.every(({ file }) => !path.basename(file).includes(`.${process.pid}.`)), 'A name built from the process ID can be predicted');
  });

  test('A temporary path that is already taken is retried, and what holds it is left alone', async () => {
    const { writeFileAtomic } = await import('../src/lib/file-write.js');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out7');
    await fs.promises.mkdir(dirOutput, { recursive: true });
    const fileOutput = path.resolve(dirOutput, 'a.html');

    let fileTaken = '';
    await withOpen(async (open, file, ...rest) => {
      if (!fileTaken) {
        fileTaken = String(file);
        fs.writeFileSync(fileTaken, 'Not ours');
        throw Object.assign(new Error('EEXIST: File already exists'), { code: 'EEXIST' });
      }
      return open(file, ...rest);
    }, () => writeFileAtomic(fileOutput, 'Output'));

    assert.strictEqual(await fs.promises.readFile(fileOutput, 'utf8'), 'Output');
    assert.strictEqual(await fs.promises.readFile(fileTaken, 'utf8'), 'Not ours', 'The file holding the first path should be untouched');
    assert.deepStrictEqual((await fs.promises.readdir(dirOutput)).sort(), ['a.html', path.basename(fileTaken)].sort(), 'No temporary file of ours should be left');
  });

  test('A temporary file that could not be created is not cleaned up', async () => {
    const { writeFileAtomic } = await import('../src/lib/file-write.js');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out8');
    await fs.promises.mkdir(dirOutput, { recursive: true });

    let fileTaken = '';
    await withOpen(async (open, file) => {
      fileTaken = String(file);
      fs.writeFileSync(fileTaken, 'Not ours');
      throw Object.assign(new Error('EACCES: Permission denied'), { code: 'EACCES' });
    }, () => assert.rejects(writeFileAtomic(path.resolve(dirOutput, 'a.html'), 'Output'), { code: 'EACCES' }));

    assert.strictEqual(await fs.promises.readFile(fileTaken, 'utf8'), 'Not ours', 'Only a file this write created may be removed');
  });

  test('A symlink loop is refused rather than replaced', { skip: process.platform === 'win32' && 'Symlinks need elevated rights' }, async () => {
    const { writeFileAtomic } = await import('../src/lib/file-write.js');
    const dirOutput = path.resolve(dirSandbox(), 'tmp-atomic/out9');
    await fs.promises.mkdir(dirOutput, { recursive: true });
    const fileOutput = path.resolve(dirOutput, 'a.html');
    await fs.promises.symlink('b.html', fileOutput);
    await fs.promises.symlink('a.html', path.resolve(dirOutput, 'b.html'));

    await assert.rejects(writeFileAtomic(fileOutput, 'Output'), { code: 'ELOOP' });

    assert.ok((await fs.promises.lstat(fileOutput)).isSymbolicLink(), 'The link should still be a link');
    assert.deepStrictEqual((await fs.promises.readdir(dirOutput)).sort(), ['a.html', 'b.html'], 'No temporary file should be left');
  });
});