import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // G|Wired always uses 5180 so it never clashes with dbp-app on 5173/5174
  server: { port: 5180, strictPort: true },
  plugins: [
    react(),
    // Installable app that opens from the device's cache with no signal (built app only, not npm run dev).
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon-64.png', 'brand/gwired-logo.png'],
      manifest: {
        name: 'G|Wired Electrical Services',
        short_name: 'G|Wired',
        description: 'G|Wired Electrical Services job management',
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { importScripts: ['/push-sw.js'], navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
})
