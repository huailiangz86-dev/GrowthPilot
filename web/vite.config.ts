import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4000,
    proxy: {
      '/api': {
        target: process.env.GROWTHPILOT_API_TARGET || 'http://localhost:8002',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4000,
  },
})
