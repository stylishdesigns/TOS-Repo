import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  // Expose ONLY these public Firebase web identifiers to the client bundle.
  // Everything else in the environment (service account, AI key) stays
  // server-side and can never reach the browser bundle.
  const env = {...loadEnv(mode, process.cwd(), ''), ...process.env} as Record<string, string | undefined>;
  const pub = (key: string) => JSON.stringify(env[key] ?? '');
  return {
    define: {
      'import.meta.env.FIREBASE_API_KEY': pub('FIREBASE_API_KEY'),
      'import.meta.env.FIREBASE_APP_ID': pub('FIREBASE_APP_ID'),
      'import.meta.env.FIREBASE_PROJECT_ID': pub('FIREBASE_PROJECT_ID'),
      'import.meta.env.FIREBASE_AUTH_DOMAIN': pub('FIREBASE_AUTH_DOMAIN'),
      'import.meta.env.FIREBASE_STORAGE_BUCKET': pub('FIREBASE_STORAGE_BUCKET'),
      'import.meta.env.FIREBASE_MESSAGING_SENDER_ID': pub('FIREBASE_MESSAGING_SENDER_ID'),
      'import.meta.env.FIREBASE_OAUTH_CLIENT_ID': pub('FIREBASE_OAUTH_CLIENT_ID'),
      'import.meta.env.FIRESTORE_DATABASE_ID': pub('FIRESTORE_DATABASE_ID'),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'Excellence Tutorial Centre',
          short_name: 'Excellence',
          description:
            'Multi-Tenant Tutorial Centre Management System, CBT Testing Engine & Student Mobile Portal.',
          theme_color: '#EA580C',
          background_color: '#0F172A',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/images\.unsplash\.com\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'unsplash-images-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
          type: 'module',
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
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true' ? { overlay: false } : false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      warmup: {
        clientFiles: ['./src/main.tsx', './src/App.tsx', './src/index.css'],
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'lucide-react',
        'motion/react',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'canvas-confetti',
      ],
    },
  };
});
