<template>
  <Content>
    <template v-slot:title> ref </template>
    <template v-slot:content>
      <div ref="htmlDiv" >htmlDiv</div>
      <!-- ref 获取多dom -->
      <!-- 函数写法接收两值 (el, refs) 第一个也能是组件， refs 是当前组件内全部 ref 绑定 -->
      <span :ref="getHtmlDom" v-for="(item, index) in 10" :key="index" >{{item}}</span>
    </template>
  </Content>
</template>

<script lang="ts">
import { defineComponent, onMounted, ref } from 'vue';
export default defineComponent({
  name: "testRef",
  setup() {
    const htmlDiv = ref<HTMLDivElement>();
    const spans = new Set<HTMLElement>();
    onMounted(() => {
      // console.log(htmlDiv.value);
      // console.log(spans);
    });
    return {
      htmlDiv,
      getHtmlDom(el: HTMLElement, refs: {[k:string]: HTMLElement}) {
        spans.add(el);
      }
    }
  }
})
</script>

<style>

</style>