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
      'lightningcss': '\0virtual:lightningcss-stub'
    }
  },
  plugins: [{
    name: 'lightningcss-stub',
    resolveId(id) {
      if (id === '\0virtual:lightningcss-stub') {
        return id;
      }
    },
    load(id) {
      if (id === '\0virtual:lightningcss-stub') {
        return `export function transform() {
  throw new Error('Lightning CSS is not available in browser environments. CSS minification is disabled in the demo.');
}`;
      }
    }
  }]
});

export default config;