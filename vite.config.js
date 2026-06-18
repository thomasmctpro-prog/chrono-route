import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Base path pour GitHub Pages : github.com/thomasmctpro-prog/chrono-route
  base: '/chrono-route/',
})
