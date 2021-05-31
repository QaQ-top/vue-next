<template>
  <div>
    <Test ref='test' />
    <div :style='{backgroundColor: `rgb(${r},${g},${b})`, width: "100px", height: "100px"}'>

    </div>
    <input type="range" v-model="r" />
    <input type="text" v-model="g" />
    <input type="range" v-model="b" />


    <!-- ref 获取多dom -->
    <!-- 函数写法接收两值 (el, refs) 第一个也能是组件， refs 是当前组件内全部 ref 绑定 -->
    <div :ref='el=>{dom.push(el)}' v-for="(_ , n) in 9" :key="n"  >{{_}}</div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent, h, onMounted, nextTick } from 'vue';

const Test = defineComponent({
  setup() {
    return () => h("div", { class: "test"}, "测试")
  }
})

export default defineComponent({
  name: 'Home',

  setup(props, ctx) {
    const test = ref();
    // 获取多 dom
    const dom = ref<Element[]>([]);
    console.log("start")
    nextTick(() => {
      console.log("nextTick 2222")
    })
    onMounted(() => {
      console.log("onMounted")
    });

    
    console.log("end")
    // localStorage.setItem("token", "99999")

    const b = ref(0);
    // onUpdated(() => {
    //   console.log("onUpdated")
    //   b.value = b.value++
    // });

    // setTimeout(() => {
    //   // Storage.token = "77777777";
    //   // console.log("FFFFFFFF")

    //   localStorage.setItem("token", "77777777")
    // }, 3000)
    
    return {
      test,
      dom,
      r: ref(0),
      g: ref(0),
      b,
    }
  },
  components: {
    Test
  }
})
</script>

<style scoped>

</style>