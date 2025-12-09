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
      // Ensure React is deduplicated
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      // Pre-bundle React to avoid multiple instances
      include: ['react', 'react-dom'],
      // Ensure React is properly resolved
      esbuildOptions: {
        target: 'esnext',
      },
    },
    build: { 
      outDir: 'dist', 
      assetsDir: 'assets',
      // Production-specific optimizations
      minify: 'esbuild', // Use esbuild (faster, more reliable than terser)
      sourcemap: false, // Disable sourcemaps in production to reduce size
      // ✅ Optimize chunk splitting to reduce number of concurrent requests
      rollupOptions: {
        // Don't preserve entry signatures in production - let Rollup optimize
        // This prevents "Cannot access before initialization" errors
        preserveEntrySignatures: false,
        output: {
          // Strategy: Create fewer, larger chunks to reduce concurrent requests
          // while ensuring proper initialization order
          manualChunks: (id) => {
            // Group all node_modules into vendor chunk
            if (id.includes('node_modules')) {
              // CRITICAL: React and React-DOM must be in the same chunk as UI components
              // that depend on them (like @radix-ui) to avoid "forwardRef is undefined" errors
              if (id.includes('react') || id.includes('react-dom')) {
                // Keep React with UI components that use forwardRef
                return 'vendor-react';
              }
              // Separate Firebase into its own chunk (large library)
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              // Group all Radix UI components with React to ensure React is available
              // Note: This ensures React.forwardRef is accessible to Radix components
              if (id.includes('@radix-ui')) {
                return 'vendor-react'; // Put Radix UI in same chunk as React
              }
              // Group React Router with React
              if (id.includes('react-router')) {
                return 'vendor-react';
              }
              // Group React ecosystem libraries to avoid circular dependencies
              if (id.includes('react-hook-form') || 
                  id.includes('@tanstack/react-query') ||
                  id.includes('react-day-picker') ||
                  id.includes('embla-carousel-react') ||
                  id.includes('react-resizable-panels')) {
                return 'vendor-react';
              }
              // Group utility libraries that might have circular deps separately
              if (id.includes('clsx') || 
                  id.includes('tailwind-merge') ||
                  id.includes('class-variance-authority') ||
                  id.includes('lucide-react')) {
                return 'vendor-utils';
              }
              // Group other vendor libraries together
              return 'vendor';
            }
          },
          // Ensure proper module format to prevent initialization issues
          format: 'es',
          // Ensure proper chunk loading order
          generatedCode: {
            constBindings: true, // Use const instead of var to prevent hoisting issues
          },
        },
      },
      // Optimize chunk size limits
      chunkSizeWarningLimit: 1000,
      // Ensure React is properly deduplicated
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
    },
    server: {
      host: true,
      port: 8080,
      allowedHosts: allowed,
      hmr: NGROK_HOST ? { protocol: 'wss', host: NGROK_HOST, clientPort: 443 } : undefined,
    },
  }
})
