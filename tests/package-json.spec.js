/**
 * Tests for package.json focusing on the PR diff changes.
 * Testing library/framework: Jest 30 (ESM) with @jest/globals.
 * We use dynamic import with JSON assertion to read package.json.
 */

import { describe, it, expect } from '@jest/globals';

const loadPkg = async () => (await import('../package.json', { assert: { type: 'json' } })).default;

describe('package.json (PR diff conformance)', () => {
  it('has expected name, type, main, module, and semver-ish version', async () => {
    const pkg = await loadPkg();
    expect(pkg.name).toBe('html-minifier-next');
    expect(pkg.type).toBe('module');
    expect(pkg.main).toBe('./dist/htmlminifier.cjs');
    expect(pkg.module).toBe('./src/htmlminifier.js');
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('declares bin mapping for "html-minifier-next" -> "./cli.js"', async () => {
    const pkg = await loadPkg();
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin['html-minifier-next']).toBe('./cli.js');
    expect(pkg.bin['html-minifier-next']).toMatch(/^\.\//);
    expect(pkg.bin['html-minifier-next']).toMatch(/\.js$/);
  });

  it('exports correct entry points', async () => {
    const pkg = await loadPkg();
    expect(pkg.exports).toBeDefined();
    expect(pkg.exports['.']).toBeDefined();
    expect(pkg.exports['.'].import).toBe('./src/htmlminifier.js');
    expect(pkg.exports['.'].require).toBe('./dist/htmlminifier.cjs');
    expect(pkg.exports['./dist/*']).toBe('./dist/*.js');
    expect(pkg.exports['./package.json']).toBe('./package.json');
  });

  it('scripts include jest and expected NODE_OPTIONS flags', async () => {
    const pkg = await loadPkg();
    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts.test).toContain('jest');
    expect(pkg.scripts.test).toContain('--experimental-vm-modules');
    expect(pkg.scripts.test).toContain('--no-warnings');
    expect(pkg.scripts['test:watch']).toContain('--watch');
  });

  it('declares expected dependency versions (subset)', async () => {
    const pkg = await loadPkg();
    const expectedDeps = {
      'change-case': '^4.1.2',
      'clean-css': '~5.3.3',
      'commander': '^14.0.0',
      'entities': '^6.0.1',
      'relateurl': '^0.2.7',
      'terser': '^5.44.0',
    };
    for (const [name, version] of Object.entries(expectedDeps)) {
      expect(pkg.dependencies?.[name]).toBe(version);
    }
  });

  it('declares expected devDependency versions (subset)', async () => {
    const pkg = await loadPkg();
    const expectedDevDeps = {
      '@jest/globals': '^30.1.2',
      'jest': '^30.1.3',
      'eslint': '^9.33.0',
      '@eslint/js': '^9.33.0',
      'rollup': '^4.50.0',
      '@rollup/plugin-commonjs': '^28.0.6',
      '@rollup/plugin-json': '^6.1.0',
      '@rollup/plugin-node-resolve': '^16.0.1',
      '@rollup/plugin-terser': '^0.4.4',
      'rollup-plugin-polyfill-node': '^0.13.0',
      'vite': '^7.1.5',
      '@commitlint/cli': '^19.8.1',
      'alpinejs': '^3.14.9',
    };
    for (const [name, version] of Object.entries(expectedDevDeps)) {
      expect(pkg.devDependencies?.[name]).toBe(version);
    }
  });

  it('enforces overrides for glob and inflight and documents the reason', async () => {
    const pkg = await loadPkg();
    expect(pkg.overrides?.glob).toBe('^10.0.0');
    expect(pkg.overrides?.inflight).toBe('npm:@nodelib/fs.stat@^3.0.0');
    expect(pkg.overrides_comment).toMatch(/Remove when Jest fixes deprecated glob@7\.2\.3 and inflight dependencies/);
  });

  it('packages the expected files and keeps paths relative', async () => {
    const pkg = await loadPkg();
    expect(pkg.files).toEqual(expect.arrayContaining(['cli.js', 'dist/', 'src/']));
    const relPaths = [
      pkg.main, pkg.module,
      pkg.bin?.['html-minifier-next'],
      pkg.exports?.['.']?.import,
      pkg.exports?.['.']?.require
    ].filter(Boolean);
    for (const p of relPaths) {
      expect(p.startsWith('./')).toBe(true);
      expect(p).not.toContain('..');
    }
  });

  it('keeps exports and top-level fields consistent', async () => {
    const pkg = await loadPkg();
    expect(pkg.main).toBe(pkg.exports['.'].require);
    expect(pkg.module).toBe(pkg.exports['.'].import);
  });

  it('contains core metadata fields as per diff', async () => {
    const pkg = await loadPkg();
    expect(pkg.author).toBe('Jens Oliver Meiert');
    expect(pkg.license).toBe('MIT');
    expect(pkg.repository).toBe('https://github.com/j9t/html-minifier-next.git');
    expect(pkg.homepage).toBe('https://j9t.github.io/html-minifier-next/');
    expect(pkg.bugs).toBe('https://github.com/j9t/html-minifier-next/issues');
  });

  it('includes essential lifecycle and tooling scripts', async () => {
    const pkg = await loadPkg();
    expect(pkg.scripts.build).toBe('rollup -c');
    expect(pkg.scripts['build:docs']).toBe('vite build --base /html-minifier-next/ --outDir build');
    expect(pkg.scripts.deploy).toBe('npm run build && npm run build:docs');
    expect(pkg.scripts.prepack).toBe('npm run build');
    expect(pkg.scripts.prepare).toMatch(/git config core\.hooksPath \.githooks/);
    expect(pkg.scripts.serve).toMatch(/^npm run build && vite$/);
  });

  it('keywords include core terms', async () => {
    const pkg = await loadPkg();
    const required = ['html', 'minify', 'terser', 'uglify', 'javascript'];
    for (const k of required) {
      expect(pkg.keywords).toContain(k);
    }
  });
});