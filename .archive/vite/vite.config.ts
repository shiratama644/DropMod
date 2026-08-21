import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import devServer from '@hono/vite-dev-server';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    allowedHosts: true
  },
  plugins: [
    react(),
    tailwindcss(),
    devServer({
      entry: 'server/index.ts',
      exclude: [/^\/(?!api\/).*/]
    })
  ]
});
