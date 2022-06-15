import {
  createApp,
  h,
  onErrorCaptured,
  nextTick,
} from 'vue'
import './themes/index.scss';
import App from '@src/pages/index.vue';

import Content from '@components/content/index.vue';

import 'highlight.js/styles/atom-one-dark.css';


/**
 * 这个 nextTick 应该是第一个 then 的 挂载
 *
 */
nextTick(() => {
  console.log('')
});

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
});

root.component("Content", Content);

root.directive('foo', {
  mounted: el => {}
})

/**
 * vue 内部 callWithAsyncErrorHandling 内捕获到的错误将 触发 errorHandler
 */
root.config.errorHandler = (err, vm, info) => {
  console.log('errorHandler', err, vm, info)
}

root.config.globalProperties = {
  good: '全局属性'
}

console.log({
  GLOBAL_ENV,
  "import.meta": import.meta
})




root.mount('#root');
