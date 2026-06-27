import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build so the whole review UI embeds into one HTML the server can serve
// (mirrors ContextBridge's vite-plugin-singlefile + binary-embed approach).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
  },
});
