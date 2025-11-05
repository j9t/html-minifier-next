import { defineConfig } from 'vite';

const config = defineConfig({
  root: 'demo',
  build: {
    outDir: 'build',
    rollupOptions: {
      external: ['lightningcss']
    }
  },
  server: {
    port: 3456
  },
  define: {
    'process.env': {},
    'process.platform': JSON.stringify(process.platform)
  },
  optimizeDeps: {
    exclude: ['lightningcss']
  }
});

export default config;
