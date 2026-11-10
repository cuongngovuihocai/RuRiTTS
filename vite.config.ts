import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    base: '/RuRiTTS/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'apple-touch-icon.png',
          'icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'hamchoi-logo.png',
          'hamchoi-logo-light.png',
        ],
        manifest: {
          id: '/RuRiTTS/',
          name: 'RÙ RÌ TTS - Trình đọc sách nói tiếng Việt',
          short_name: 'RÙ RÌ TTS',
          description: 'Trình đọc sách và chuyển đổi văn bản sang giọng đọc tiếng Việt truyền cảm, hoạt động offline.',
          theme_color: '#0A0A0C',
          background_color: '#0A0A0C',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/RuRiTTS/',
          scope: '/RuRiTTS/',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
