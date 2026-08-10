import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    allowedHosts: ['finance-dutiful-unbounded.ngrok-free.dev'],
    proxy: {
      // The default local runtime is the Docker/nginx server on port 80.
      // Set VITE_PROXY_TARGET=http://127.0.0.1:3000 when running Nest directly.
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://127.0.0.1',
        changeOrigin: true,
      },
    },
  },
})
