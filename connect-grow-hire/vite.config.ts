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
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: true,
      port: 8080,
      allowedHosts: allowed,
      // Optional: smoother HMR over https/ngrok
      hmr: NGROK_HOST
        ? { protocol: 'wss', host: NGROK_HOST, clientPort: 443 }
        : undefined,
    },
  }
})