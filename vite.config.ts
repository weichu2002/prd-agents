import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  },
  server: {
    proxy: {
      // 关键配置：解决本地开发时的 Network Error
      // 请将 target 替换为您在阿里云 ESA 部署后的实际公网访问域名
      // 例如：'https://prd-agents.your-domain.com'
      '/api': {
        target: 'https://REPLACE_WITH_YOUR_ESA_DEPLOY_DOMAIN.com', 
        changeOrigin: true,
        secure: false
      }
    }
  }
})