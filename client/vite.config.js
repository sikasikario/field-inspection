import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // În dezvoltare, cererile /api sunt redirecționate către serverul Express.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
