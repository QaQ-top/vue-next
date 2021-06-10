import {
  createApp,
  h,
  onErrorCaptured,
  nextTick,
  compile,
  registerRuntimeCompiler
} from 'vue'

/**
 * NOT GO 不太理解 这个 nextTick 应该是第一个 then 的 挂载
 * 然后再去调用vue vue内部调度任务 应该 在这个 nextTick 才对 后面 then
 * 都是执行时 确是 调度先执行 再执行 nextTick
 * 这个没看明白
 *
 */
nextTick(() => {
  console.log('')
})

import './themes/index.scss'
// import '@src/utils/storage';
// import App from '@src/pages/index.vue'
import App from '@src/pages/home/index.vue'
const root = createApp({
  render: () => {
    return h(App, () => 'App 传递')
  },
  setup: () => {
    /**
     * 传入的 函数 储存在 组件实例的 ec 属性下 ec 是一个数组
     * onErrorCaptured 可以捕获 子孙组件的错误 无法捕获自己组件实例的错误，不过祖先组件可以捕获当前组件的错误
     * return 可以阻止 捕获链 的传播到祖先级的 onErrorCaptured 和 全局的 config.errorHandler
     */

    onErrorCaptured((err, vm, info) => {
      console.log(err, vm, info)
      return false
    })
  }
  // components: App
})

/**
 * vue 内部 callWithAsyncErrorHandling 内捕获到的错误将 触发 errorHandler
 */
root.config.errorHandler = (err, vm, info) => {
  console.log('errorHandler', err, vm, info)
}

root.config.globalProperties = {
  good: 'FFFF'
}

console.log(__VITE__GLOBAL__)

root.component('GlobalComponent', {
  name: 'GlobalComponent',
  render: () => {
    return 'GlobalComponent'
  }
})

root.directive('foo', {
  mounted: el => {}
})

root.config

root.mount('#root')
