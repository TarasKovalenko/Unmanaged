import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The code runner (runner/, `npm run runner`) listens on :8080. The app calls
// it at /api, which this proxy forwards in dev and preview. In production,
// nginx does the same (see docker/nginx.conf).
const runnerProxy = {
  '/api': {
    target: process.env.RUNNER_ORIGIN ?? 'http://localhost:8080',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  // Relative base so the build works from any static host or subdirectory.
  base: './',
  plugins: [react(), tailwindcss()],
  server: { proxy: runnerProxy },
  preview: { proxy: runnerProxy },
})
