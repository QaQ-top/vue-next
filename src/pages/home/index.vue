<template>
  <div>
    <Test ref='test' />
    <div :style='{backgroundColor: `rgb(${r},${g},${b})`, width: "100px", height: "100px"}'>

    </div>
    <input type="range" v-model="r" />
    <input type="text" v-model="g" />
    <input type="range" v-model="b" />


    <!-- ref 获取多dom -->
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
    onMounted(() => {
      console.log(test.value)
    });

    nextTick(() => {
      console.log(dom.value)
    })
    // localStorage.setItem("token", "99999")


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
      b: ref(0),
    }
  },
  components: {
    Test
  }
})
</script>

<style scoped>

</style>