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
      includeAssets: ['brand/icon.svg'],
      manifest: {
        name: 'G|Wired Electrical Services',
        short_name: 'G|Wired',
        description: 'G|Wired Electrical Services job management',
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'brand/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
})
