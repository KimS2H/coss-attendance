import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// 개발 중에는 /api 요청을 API 서버(localhost:3000)로 넘긴다.
// 서버 PC에서는 Nginx가 같은 일을 한다 (docker/nginx).
export default defineConfig({
  plugins: [
    react(),
    // 홈 화면에 추가(PWA). 출석 API는 절대 캐시하지 않는다.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.png'],
      manifest: {
        name: 'IoT 혁신융합대학 비교과 출석체크',
        short_name: '출석체크',
        description: 'IoT 혁신융합대학 비교과 출석체크',
        lang: 'ko',
        theme_color: '#0F1F4D',
        background_color: '#F5F7FB',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: '/logo.png', sizes: '203x192', type: 'image/png' }],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000' },
  },
});
