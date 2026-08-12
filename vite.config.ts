import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Output build terus ke docs/ (folder yang dihidangkan oleh GitHub Pages di
// sifulaser.com). emptyOutDir: false supaya docs/images/, favicon.svg dan CNAME
// tidak dipadam — skrip "build" memadam asset index-* lama secara manual.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  publicDir: false,
  build: {
    outDir: 'docs',
    emptyOutDir: false,
  },
})
