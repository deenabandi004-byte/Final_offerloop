import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const NGROK_HOST = env.NGROK_HOST || '' // e.g. 2f8651b5bfbe.ngrok-free.app
  const allowed = ['localhost', '127.0.0.1', 'd33d83bb2e38.ngrok-free.app']
  if (NGROK_HOST) allowed.push(NGROK_HOST)

  return {
    plugins: [react()],
    base: '/',                      // ✅ ensure asset URLs resolve at root
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    build: { 
      outDir: 'dist', 
      assetsDir: 'assets',
      // ✅ Optimize chunk splitting to reduce number of concurrent requests
      rollupOptions: {
        output: {
          // Strategy: Create fewer, larger chunks to reduce concurrent requests
          manualChunks: (id) => {
            // Group all node_modules into vendor chunk
            if (id.includes('node_modules')) {
              // Separate Firebase into its own chunk (large library)
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              // Group all Radix UI components together
              if (id.includes('@radix-ui')) {
                return 'vendor-ui';
              }
              // Group React ecosystem together
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'vendor-react';
              }
              // Group other vendor libraries together
              return 'vendor';
            }
          },
          // Limit chunk size to encourage better splitting
          chunkSizeWarningLimit: 1000,
        },
      },
      // Optimize chunk size limits
      chunkSizeWarningLimit: 1000,
    },
    server: {
      host: true,
      port: 8080,
      allowedHosts: allowed,
      hmr: NGROK_HOST ? { protocol: 'wss', host: NGROK_HOST, clientPort: 443 } : undefined,
    },
  }
})
