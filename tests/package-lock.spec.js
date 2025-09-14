/**
 * package-lock.spec.js
 * Tests for package-lock.json focusing on PR diff updates (Jest 30, Rollup 4.50, Vite 7.1.5, Terser 5.44, Clean-CSS 5.3.3, etc.).
 * Testing library/framework: Jest (describe/it/expect).
 */

/* eslint-env jest */

let fsRef;
let pathRef;

beforeAll(async () => {
  try {
    // CJS environments
    // eslint-disable-next-line global-require
    fsRef = require('fs');
    // eslint-disable-next-line global-require
    pathRef = require('path');
  } catch {
    // ESM environments
    fsRef = (await import('node:fs')).default;
    pathRef = (await import('node:path')).default;
  }
});

function readLock() {
  const lockPath = pathRef.resolve(process.cwd(), 'package-lock.json');
  const raw = fsRef.readFileSync(lockPath, 'utf8');
  const json = JSON.parse(raw);
  expect(json).toBeTruthy();
  expect(typeof json).toBe('object');
  return json;
}

function hasKeys(obj, keys) {
  for (const k of keys) {
    if (!obj || !Object.prototype.hasOwnProperty.call(obj, k)) {
      return false;
    }
  }
  return true;
}

describe('package-lock.json integrity (v3 lockfile)', () => {
  let lock;
  let packages;

  beforeAll(() => {
    lock = readLock();
    packages = lock.packages || {};
  });

  it('has expected top-level metadata', () => {
    expect(lock.lockfileVersion).toBe(3);
    expect(lock.requires).toBe(true);
    expect(lock.name).toBe('html-minifier-next');
    expect(lock.version).toBe('2.1.3');
    expect(hasKeys(lock, ['packages'])).toBe(true);
  });

  it('has a root package entry with correct fields', () => {
    const root = packages[''];
    expect(root).toBeTruthy();
    expect(root.name).toBe('html-minifier-next');
    expect(root.version).toBe('2.1.3');
    expect(root.license).toBe('MIT');

    // Root bin
    expect(root.bin).toBeTruthy();
    expect(root.bin['html-minifier-next']).toBe('cli.js');

    // Root dependencies (spot-check critical ones from the diff)
    expect(root.dependencies).toBeTruthy();
    expect(root.dependencies['terser']).toBe('^5.44.0');
    expect(root.dependencies['clean-css']).toBe('~5.3.3');
    expect(root.dependencies['change-case']).toBe('^4.1.2');
    expect(root.dependencies['entities']).toBe('^6.0.1');
    expect(root.dependencies['relateurl']).toBe('^0.2.7');
    expect(root.dependencies['commander']).toBe('^14.0.0');

    // Root devDependencies (spot-check)
    expect(root.devDependencies).toBeTruthy();
    expect(root.devDependencies['jest']).toBe('^30.1.3');
    expect(root.devDependencies['@jest/globals']).toBe('^30.1.2');
    expect(root.devDependencies['rollup']).toBe('^4.50.0');
    expect(root.devDependencies['vite']).toBe('^7.1.5');
  });

  describe('terser package', () => {
    it('is installed with the expected version and metadata', () => {
      const t = packages['node_modules/terser'];
      expect(t).toBeTruthy();
      expect(t.version).toBe('5.44.0');
      expect(t.license).toBe('BSD-2-Clause');
      expect(t.bin && t.bin.terser).toBe('bin/terser');
      expect(t.engines && t.engines.node).toBe('>=10');
    });

    it('has expected dependencies and nested commander version', () => {
      const t = packages['node_modules/terser'];
      expect(t.dependencies).toBeTruthy();
      expect(t.dependencies['commander']).toBe('^2.20.0');
      expect(t.dependencies['source-map-support']).toBe('~0.5.20');
      expect(t.dependencies['acorn']).toBe('^8.15.0');
      expect(t.dependencies['@jridgewell/source-map']).toBe('^0.3.3');

      const nestedCommander = packages['node_modules/terser/node_modules/commander'];
      expect(nestedCommander).toBeTruthy();
      expect(nestedCommander.version).toBe('2.20.3');

      const sms = packages['node_modules/terser/node_modules/source-map-support'];
      expect(sms).toBeTruthy();
      expect(sms.version).toBe('0.5.21');
      expect(sms.dependencies && sms.dependencies['source-map']).toBe('^0.6.0');
    });
  });

  describe('clean-css package', () => {
    it('is installed with expected version and engine requirements', () => {
      const c = packages['node_modules/clean-css'];
      expect(c).toBeTruthy();
      expect(c.version).toBe('5.3.3');
      expect(c.engines && c.engines.node).toBe('>= 10.0');
      expect(c.dependencies && c.dependencies['source-map']).toBe('~0.6.0');
    });
  });

  describe('jest package', () => {
    it('is installed as a dev dependency with correct engine constraints', () => {
      const j = packages['node_modules/jest'];
      expect(j).toBeTruthy();
      expect(j.version).toBe('30.1.3');
      expect(j.dev).toBe(true);
      expect(j.bin && j.bin.jest).toBe('bin/jest.js');
      expect(j.engines && j.engines.node).toBe('^18.14.0 || ^20.0.0 || ^22.0.0 || >=24.0.0');

      // Peer dependency optional metadata
      expect(j.peerDependencies && j.peerDependencies['node-notifier']).toBeTruthy();
      expect(j.peerDependenciesMeta && j.peerDependenciesMeta['node-notifier'] && j.peerDependenciesMeta['node-notifier'].optional).toBe(true);
    });
  });

  describe('rollup package', () => {
    it('is installed with expected version, bin, engines, and optional deps', () => {
      const r = packages['node_modules/rollup'];
      expect(r).toBeTruthy();
      expect(r.version).toBe('4.50.0');
      expect(r.bin && r.bin.rollup).toBe('dist/bin/rollup');
      expect(r.engines && r.engines.node).toBe('>=18.0.0');

      // Optional deps (spot-check)
      expect(r.optionalDependencies).toBeTruthy();
      expect(r.optionalDependencies['fsevents']).toBe('~2.3.2');
    });
  });

  describe('vite package', () => {
    it('is installed with expected version, engine constraints, and peers', () => {
      const v = packages['node_modules/vite'];
      expect(v).toBeTruthy();
      expect(v.version).toBe('7.1.5');
      expect(v.bin && v.bin.vite).toBe('bin/vite.js');
      expect(v.engines && v.engines.node).toBe('^20.19.0 || >=22.12.0');

      // Peer deps and meta (spot-check terser)
      expect(v.peerDependencies && v.peerDependencies['terser']).toBe('^5.16.0');
      expect(v.peerDependenciesMeta && v.peerDependenciesMeta['terser'] && v.peerDependenciesMeta['terser'].optional).toBe(true);
    });

    it('bundled nested dependencies exist with expected versions', () => {
      const fdir = packages['node_modules/vite/node_modules/fdir'];
      const picomatch = packages['node_modules/vite/node_modules/picomatch'];

      expect(fdir).toBeTruthy();
      expect(fdir.version).toBe('6.5.0');

      expect(picomatch).toBeTruthy();
      expect(picomatch.version).toBe('4.0.3');
    });
  });

  describe('other notable packages from the diff', () => {
    it('wrap-ansi and wrap-ansi-cjs both present with same version', () => {
      const wa = packages['node_modules/wrap-ansi'];
      const wacjs = packages['node_modules/wrap-ansi-cjs'];
      expect(wa && wacjs).toBeTruthy();
      expect(wa.version).toBe('7.0.0');
      expect(wacjs.version).toBe('7.0.0');
    });

    it('yaml has dev/optional/peer flags and expected bin', () => {
      const yaml = packages['node_modules/yaml'];
      expect(yaml).toBeTruthy();
      expect(yaml.version).toBe('2.8.1');
      expect(yaml.dev).toBe(true);
      expect(yaml.optional).toBe(true);
      expect(yaml.peer).toBe(true);
      expect(yaml.bin && yaml.bin.yaml).toBe('bin.mjs');
      expect(yaml.engines && yaml.engines.node).toBe('>= 14.6');
    });

    it('yargs and yallist entries match expected versions', () => {
      const yargs = packages['node_modules/yargs'];

      const yallist = packages['node_modules/yallist'];
      expect(yargs).toBeTruthy();
      expect(yargs.version).toBe('17.7.2');
      expect(yargs.engines && yargs.engines.node).toBe('>=12');

      expect(yallist).toBeTruthy();
      expect(yallist.version).toBe('3.1.1');
      expect(yallist.dev).toBe(true);
    });

    it('change-case has expected license and tslib dependency', () => {
      const cc = packages['node_modules/change-case'];
      expect(cc).toBeTruthy();
      expect(cc.version).toBe('4.1.2');
      expect(cc.license).toBe('MIT');
      expect(cc.dependencies && cc.dependencies['tslib']).toBe('^2.0.3');
    });
  });

  describe('basic schema validation around critical fields', () => {
    it('ensures resolved and integrity fields are present for key packages', () => {
      for (const key of [
        'node_modules/terser',
        'node_modules/clean-css',
        'node_modules/jest',
        'node_modules/rollup',
        'node_modules/vite'
      ]) {
        const entry = packages[key];
        expect(entry).toBeTruthy();
        expect(typeof entry.resolved).toBe('string');
        expect(entry.resolved.length).toBeGreaterThan(0);
        expect(typeof entry.integrity).toBe('string');
        expect(entry.integrity.length).toBeGreaterThan(0);
      }
    });
  });
});