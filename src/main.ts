import { createApp } from 'vue'
import './themes/index.scss'
import App from '@src/pages/index.vue'

console.log(import.meta.env.VITE_FAST)

const root = createApp(App)

// console.log(__VITE_GLOBAL);

root.mount('#root')
