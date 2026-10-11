import path from 'node:path';
import tailwind from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;

export default defineConfig({
  plugins: [
    react(),
    tailwind(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'NOCTURNE',
        short_name: 'NOCTURNE',
        description: 'Red-team operations console',
        theme_color: '#0e0f11',
        background_color: '#0e0f11',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      // Consume the workspace package as TypeScript source (no build step).
      '@nocturne/api-client': path.resolve(root, '../../packages/api-client/src/index.ts'),
      '@': path.resolve(root, 'src'),
    },
  },
  server: {
    port: 5183,
    // Bind all interfaces so the UI is reachable over the Tailscale IP
    // (e.g. http://100.96.171.62:5183), not just localhost on this machine.
    host: true,
    // vite blocks requests whose Host header is an unknown name (anti DNS
    // rebinding). IP literals and localhost are always allowed; this also
    // permits Tailscale MagicDNS names (*.ts.net).
    allowedHosts: ['.ts.net'],
    // allow importing files from the monorepo root (the api-client package)
    fs: { allow: ['../..'] },
    // Proxy the API (and its WebSockets) so the browser talks to one origin
    // (:5183). This keeps the session cookie same-site regardless of whether
    // the UI is opened via localhost, 127.0.0.1, or a LAN IP.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  // es2022 so @novnc/novnc's top-level await survives both the production build
  // and the dev-server dependency pre-bundling (all target browsers support it).
  build: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Unit tests only: stores, lib helpers, and the mock client. No backend.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
