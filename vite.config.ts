import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages project site: https://devkokoape.github.io/openhood/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.VITE_BASE_PATH || '/openhood/',
  server: {
    // Proxy OpenSea so local browser requests omit Origin → stats work without API key
    proxy: {
      '/opensea-api': {
        target: 'https://api.opensea.io',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/opensea-api/, '/api/v2'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
            proxyReq.setHeader('accept', 'application/json')
            const key = process.env.VITE_OPENSEA_API_KEY || process.env.OPENSEA_API_KEY
            if (key) proxyReq.setHeader('X-API-KEY', key)
          })
        },
      },
    },
  },
})
