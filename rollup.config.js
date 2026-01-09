import { defineConfig } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import nodePolyfills from 'rollup-plugin-polyfill-node';

// Suppress known harmless warnings from dependencies
const onwarn = (warning, warn) => {
  // Ignore Terser comment parsing warnings
  if (warning.message && warning.message.includes('#__PURE__ comments')) {
    return;
  }

  // Ignore circular dependency warnings from Node polyfills and Terser internals
  if (warning.code === 'CIRCULAR_DEPENDENCY' &&
     (warning.message.includes('polyfill-node') ||
      warning.message.includes('node_modules/terser'))) {
    return;
  }

  // Show all other warnings
  warn(warning);
};

// Browser bundle plugins (with polyfills for Node.js APIs)
const browserBundlePlugins = [
  commonjs(),
  nodePolyfills(),
  nodeResolve({
    preferBuiltins: false
  }),
  json()
];

const config = defineConfig([
  // ESM bundle for browser demo (GitHub Pages)
  // Bundles all dependencies except those requiring Node.js native bindings
  // Used by: demo/main.js
  {
    input: 'src/htmlminifier.js',
    output: {
      file: 'dist/htmlminifier.esm.bundle.js',
      format: 'es',
      inlineDynamicImports: true
    },
    external: ['lightningcss', '@swc/core'],
    plugins: browserBundlePlugins,
    onwarn
  },
  // CommonJS build for npm package (Node.js users)
  // All dependencies external (installed via npm)
  // Used by: require('html-minifier-next')
  {
    input: 'src/htmlminifier.js',
    output: {
      file: 'dist/htmlminifier.cjs',
      format: 'cjs',
      exports: 'named',
      inlineDynamicImports: true
    },
    external: ['lightningcss', 'terser', 'entities', 'relateurl', '@swc/core'],
    onwarn
  }
]);

export default config;