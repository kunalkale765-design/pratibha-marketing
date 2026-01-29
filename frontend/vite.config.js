import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src', // Set root to src/ so index.html files are found easily
  publicDir: '../public', // We don't have this yet, acts as static folder
  envDir: resolve(__dirname, '..'), // Load .env from project root
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/index.html'),
        orders: resolve(__dirname, 'src/pages/orders/index.html'),
        customers: resolve(__dirname, 'src/pages/customers/index.html'),
        products: resolve(__dirname, 'src/pages/products/index.html'),
        marketRates: resolve(__dirname, 'src/pages/market-rates/index.html'),
        login: resolve(__dirname, 'src/pages/auth/login.html'),
        signup: resolve(__dirname, 'src/pages/auth/signup.html'),
        resetPassword: resolve(__dirname, 'src/pages/auth/reset-password.html'),
        orderForm: resolve(__dirname, 'src/pages/order-form/index.html'),
        packing: resolve(__dirname, 'src/pages/packing/index.html'),
        reconciliation: resolve(__dirname, 'src/pages/reconciliation/index.html'),
      }
    }
  },
  resolve: {
    alias: {
      '/css': resolve(__dirname, 'src/assets/css'),
      '/js': resolve(__dirname, 'src/js'),
      '/icons': resolve(__dirname, 'src/assets/icons'),
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  }
});
