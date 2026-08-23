import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { DEV_API_PORT } from './src/shared/constants'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 与 tsconfig.json 的 paths 保持一致（仅前端打包/测试解析；服务端编译不走 vite）
      '@': path.resolve(import.meta.dirname, 'src/client'),
      '@shared': path.resolve(import.meta.dirname, 'src/shared')
    }
  },
  build: {
    outDir: 'dist/web',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${DEV_API_PORT}`
    }
  },
  test: {
    // 前端组件测试（服务端测试仍走 node:test，见 test/*.test.ts）
    environment: 'happy-dom',
    include: ['test/client/**/*.test.{ts,tsx}']
  }
})
