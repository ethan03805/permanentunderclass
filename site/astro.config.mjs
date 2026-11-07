import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://permanentunderclass.me',
  // Separate CSS and JS files only, so the Content-Security-Policy in vercel.json
  // can forbid inline styles and scripts.
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
});
