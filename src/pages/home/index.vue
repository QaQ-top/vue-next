<template>
  <div>
    
    <div 
      :style='{backgroundColor: `rgb(${r},${g},${b})`, width: "100px", height: "100px"}'
      @click="() => {
        status = !status
      }" 
    >

    </div>
    <Test v-if="status" ref='test' :onVnodeBeforeUnmount='um' />
    <input type="range" v-model="r" />
    <input type="text" v-model="g" />
    <input type="range" v-model="b" />
    <!-- ref 获取多dom -->
    <!-- 函数写法接收两值 (el, refs) 第一个也能是组件， refs 是当前组件内全部 ref 绑定 -->
    <div :ref='el=>{dom.push(el)}' v-for="(_ , n) in 9" :key="n"  >{{_}}</div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent, h, Fragment, } from 'vue';

const Test = defineComponent({
  setup() {
    return () => h(Fragment,{},[ h("div", { class: "test"}, "测试"), h("div", { class: "test"}, "测试")]) 
  }
})

export default defineComponent({
  name: 'Home',

  setup(props, ctx) {
    const test = ref();
    // 获取多 dom
    const dom = ref<Element[]>([]);

    const b = ref(0);

    const status = ref(false);

    
    return {
      test,
      dom,
      r: ref(0),
      g: ref(0),
      b,
      status,
      um: (...arr: any[]) => {
        console.log(arr)
      }
    }
  },
  components: {
    Test
  }
})
</script>

<style scoped>

</style>