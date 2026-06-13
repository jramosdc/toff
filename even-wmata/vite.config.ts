import { defineConfig } from 'vite'

// In dev/simulator the WebView is a normal browser, so WMATA's missing CORS
// headers would block direct calls. This proxy forwards `/api/wmata/*` to the
// real API from the dev server (no CORS in server-to-server requests).
//
// In the packaged .ehpk there is no Vite server — the app talks to your
// deployed Cloudflare Worker instead (see VITE_WMATA_BASE in .env / README).
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api/wmata': {
        target: 'https://api.wmata.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/wmata/, ''),
      },
    },
  },
  build: { target: 'esnext' },
  // Pin an empty PostCSS config so Vite never walks up the tree looking for one.
  css: { postcss: {} },
})
