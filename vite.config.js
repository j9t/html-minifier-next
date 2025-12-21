import { defineConfig } from 'vite';

const config = defineConfig({
  root: 'demo',
  build: {
    outDir: 'build'
  },
  server: {
    port: 3456
  },
  define: {
    'process.env': {},
    'process.platform': JSON.stringify(process.platform)
  },
  resolve: {
    alias: {
      // Replace Lightning CSS with inline stub for browser builds
      // Lightning CSS requires Node.js native bindings and cannot run in-browser
      'lightningcss': '\0virtual:lightningcss-stub',
      // Replace SWC with inline stub for browser builds
      // SWC requires Node.js native bindings and cannot run in-browser
      '@swc/core': '\0virtual:swc-stub'
    }
  },
  plugins: [{
    name: 'native-stub',
    resolveId(id) {
      if (id === '\0virtual:lightningcss-stub' || id === '\0virtual:swc-stub') {
        return id;
      }
    },
    load(id) {
      if (id === '\0virtual:lightningcss-stub') {
        return `export function transform() {
  throw new Error('Lightning CSS is not available in browser environments. CSS minification is disabled in the demo.');
}`;
      }
      if (id === '\0virtual:swc-stub') {
        return `export function minify() {
  throw new Error('SWC is not available in browser environments. JavaScript minification requires Terser in the demo.');
}`;
      }
    }
  }]
});

export default config;