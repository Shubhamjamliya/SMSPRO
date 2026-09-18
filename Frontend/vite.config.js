import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const foodSrc = path.resolve(__dirname, './src/modules/Food')
const servicesApi = path.resolve(__dirname, './src/services/api')
const sharedSrc = path.resolve(__dirname, './src/shared')
const coreSrc = path.resolve(__dirname, './src/core')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // More specific first so @food/api/* resolves to services (no backend)
      '@food/api/axios': path.resolve(servicesApi, 'axios.js'),
      '@food/api/config': path.resolve(servicesApi, 'config.js'),
      '@food/api': servicesApi,
      '@food': foodSrc,
      '@shared': sharedSrc,
      '@core': coreSrc,
      '@quickCommerce': path.resolve(__dirname, './src/modules/quickCommerce'),
      '@porter': path.resolve(__dirname, './src/modules/porter'),
      '@taxi': path.resolve(__dirname, './src/modules/taxi'),
      '@delivery': path.resolve(__dirname, './src/modules/DeliveryV2'),
      '@common': path.resolve(__dirname, './src/modules/common'),
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom', 'react-router-dom'],
  },
  optimizeDeps: {
    include: [
      '@emotion/react',
      '@emotion/styled',
      '@mui/material',
      '@mui/x-date-pickers',
    ],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router-dom/') ||
              id.includes('node_modules/react-router/') ||
              id.includes('node_modules/scheduler/')) {
            return 'vendor-react'
          }

          if (id.includes('node_modules/framer-motion/')) {
            return 'vendor-motion'
          }

          if (id.includes('node_modules/gsap/') ||
              id.includes('node_modules/lottie-react/') ||
              id.includes('node_modules/lenis/')) {
            return 'vendor-animation'
          }

          if (id.includes('node_modules/lucide-react/') ||
              id.includes('node_modules/react-icons/')) {
            return 'vendor-icons'
          }

          if (id.includes('node_modules/@radix-ui/')) {
            return 'vendor-radix'
          }

          if (id.includes('node_modules/class-variance-authority/') ||
              id.includes('node_modules/clsx/') ||
              id.includes('node_modules/tailwind-merge/') ||
              id.includes('node_modules/canvas-confetti/')) {
            return 'vendor-ui-utils'
          }

          if (id.includes('node_modules/@mui/') ||
              id.includes('node_modules/@emotion/')) {
            return 'vendor-mui'
          }

          if (id.includes('node_modules/firebase/') ||
              id.includes('node_modules/@firebase/')) {
            return 'vendor-firebase'
          }

          if (id.includes('node_modules/recharts/') ||
              id.includes('node_modules/d3') ||
              id.includes('node_modules/victory-')) {
            return 'vendor-charts'
          }

          if (id.includes('node_modules/jspdf/') ||
              id.includes('node_modules/jspdf-autotable/') ||
              id.includes('node_modules/pdfkit/')) {
            return 'vendor-pdf'
          }

          if (id.includes('node_modules/html2canvas/')) {
            return 'vendor-html2canvas'
          }

          if (id.includes('node_modules/leaflet/') ||
              id.includes('node_modules/react-leaflet/') ||
              id.includes('node_modules/@googlemaps/') ||
              id.includes('node_modules/@react-google-maps/')) {
            return 'vendor-maps'
          }

          if (id.includes('node_modules/date-fns/') ||
              id.includes('node_modules/dayjs/') ||
              id.includes('node_modules/react-day-picker/')) {
            return 'vendor-dates'
          }

          if (id.includes('node_modules/axios/') ||
              id.includes('node_modules/socket.io-client/') ||
              id.includes('node_modules/@reduxjs/') ||
              id.includes('node_modules/react-redux/') ||
              id.includes('node_modules/zustand/') ||
              id.includes('node_modules/redux/') ||
              id.includes('node_modules/zod/') ||
              id.includes('node_modules/joi/')) {
            return 'vendor-utils'
          }

          if (id.includes('node_modules/xlsx/') ||
              id.includes('node_modules/exceljs/')) {
            return 'vendor-excel'
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
    proxy: {
      '/api/v1': {
        target: process.env.VITE_BACKEND_PROXY_TARGET || 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },
})