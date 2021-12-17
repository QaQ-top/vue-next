// 配置信息接口
import { defineConfig } from 'vite'
import { resolve } from 'path'
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  mode: 'development',
  root: resolve(__dirname),
  base: '/',
  resolve:{
    alias: {
      '@src': resolve(__dirname),
      '@assets': resolve(__dirname, 'assets'),
      '@models': resolve(__dirname, 'models'),
      '@pages': resolve(__dirname, 'pages'),
      '@route': resolve(__dirname, 'route'),
      '@themes': resolve(__dirname, 'themes'),
      '@utils': resolve(__dirname, 'utils'),
      '@components': resolve(__dirname, 'components')
    },
  },
  define: {
    GLOBAL_ENV: JSON.stringify('全局变量'),
    VITE_ROOT: JSON.stringify(resolve(__dirname)),
    __VUE_PROD_DEVTOOLS__: true,
  },
  plugins: [vue()],

  css: {
    modules: {
      scopeBehaviour: 'local',
      // generateScopedName: '[name]-[local]-[hash:base64:5]',
      generateScopedName: '[local]-[hash:6]',
      localsConvention: 'camelCase'
    },
  },
  
  json: {
    namedExports: true,
    stringify: false
  },
  assetsInclude: [
    // images
    'png',
    'jpe?g',
    'gif',
    'svg',
    'ico',
    'webp',
    'avif',

    // media
    'mp4',
    'webm',
    'ogg',
    'mp3',
    'wav',
    'flac',
    'aac',

    // fonts
    'woff2?',
    'eot',
    'ttf',
    'otf',

    // other
    'wasm'
  ],

  server: {
    base: '/',
    host: 'localhost',
    port: 6412,
    strictPort: true,
    middlewareMode: false,
    open: false,
    proxy: {
      '/music': {
        target: 'http://39.108.182.125:3000',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/music/, '')
      }
    },
    cors: {
      origin: '*',
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
      optionsSuccessStatus: 204
    }
  }
})
