/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  server: {
    // 绑定到所有 IPv4 接口：本机可用 127.0.0.1:5173 / localhost:5173 / 局域网 IP:5173 访问
    // 使用 '0.0.0.0' 明确 IPv4，避免 Node 18+ 在不同启动上下文下把 localhost
    // 优先解析成 IPv6 (::1) 导致 127.0.0.1 被拒绝
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
