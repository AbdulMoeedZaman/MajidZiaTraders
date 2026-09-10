import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias },
    // Keep better-sqlite3 (a native module) out of the bundle.
    build: { externalizeDeps: true },
  },
  preload: {
    resolve: { alias },
    build: { externalizeDeps: true },
  },
  renderer: {
    resolve: { alias },
    plugins: [react()],
  },
})
