import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const srcDir = path.resolve(rootDir, 'src')

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, rootDir, '')
  const apiTarget = (
    env.VITE_DEV_API_PROXY_TARGET ||
    'http://127.0.0.1:3001'
  ).replace(/\/$/, '')

  return {
    plugins: [react()],
    resolve: {
      alias: [
        { find: '@', replacement: srcDir },
        { find: /^@\//, replacement: `${srcDir}/` },
      ],
    },
    server: {
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  }
})
