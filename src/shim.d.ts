/// <reference types="vite/client" />

// 解决 ts 文件引入vue 模块 报错的问题
declare module '*.vue' {
  import { Component } from 'vue'

  const component: Component
  export default component
}

declare module 'vue/dist/vue.esm-bundler.js' {
  import * as Vue from 'vue';
  export default Vue;
}

declare const GLOBAL_ENV: string;
declare const VITE_ROOT: string;

