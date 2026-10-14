import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const cloudRunHost = 'cookiecare-git-855346886001.asia-southeast1.run.app';
const allowedHosts = [cloudRunHost, '.run.app'];
const standaloneVite = process.env.VITE_MIDDLEWARE !== '1';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: __dirname,
  // Prefer the monorepo root install so Vite does not pick up a second React
  // from frontend/node_modules (blank white screen / Invalid hook call).
  cacheDir: path.resolve(repoRoot, 'node_modules/.vite'),
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  optimizeDeps: {
    // pdfjs-dist ships pre-built ESM — pre-bundling it causes the worker
    // version mismatch and double-loading issues. Exclude it so Vite uses
    // the package's own build artefacts directly.
    exclude: ['pdfjs-dist'],
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router-dom'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      react: path.resolve(repoRoot, 'node_modules/react'),
      'react-dom': path.resolve(repoRoot, 'node_modules/react-dom'),
      'react-router-dom': path.resolve(repoRoot, 'node_modules/react-router-dom'),
    },
  },
  server: {
    allowedHosts,
    // Required for client-side routing: serve index.html for all 404s in dev
    historyApiFallback: true,
    watch: {
      ignored: [
        '**/scripts/**',
        '**/*.py',
        '**/.git/**',
        '**/node_modules/**',
      ],
    },
    ...(standaloneVite
      ? {
          proxy: {
            '/api': {
              target: 'http://127.0.0.1:3000',
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  preview: {
    allowedHosts,
  },
});
