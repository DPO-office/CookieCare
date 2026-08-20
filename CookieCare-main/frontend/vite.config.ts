import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cloudRunHost = 'cookiecare-git-855346886001.asia-southeast1.run.app';
const allowedHosts = [cloudRunHost, '.run.app'];
const standaloneVite = process.env.VITE_MIDDLEWARE !== '1';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
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