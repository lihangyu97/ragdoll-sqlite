import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 开发模式下后端固定端口（与 cli.ts 的 --dev 默认端口保持一致）
const DEV_API_PORT = 7860

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/web',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${DEV_API_PORT}`
    }
  }
})
