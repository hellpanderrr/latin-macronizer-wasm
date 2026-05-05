import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist-vite',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'LatinMacronizer',
      fileName: (format) => `latin-macronizer.${format}.js`,
      formats: ['es', 'umd']
    },
    rollupOptions: {
      external: ['fs', 'path'],
      output: {
        globals: {
          fs: 'fs',
          path: 'path'
        }
      }
    }
  },
  server: {
    port: 8080,
    open: '/public/index.html'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
