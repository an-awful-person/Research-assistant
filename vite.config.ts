import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/ollama': {
        target: `http://127.0.0.1:${process.env.PORT ?? 3001}`,
      },
      '/research-api': {
        target: `http://127.0.0.1:${process.env.PORT ?? 3001}`,
        rewrite: (path) => path.replace(/^\/research-api/, ''),
      },
    },
  },
})
