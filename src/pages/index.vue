<template>
  <main>
    <div>Vue {{ count }} {{ num }}</div>
    <input type="text" v-model="classBg">
    <button 
      :class="classBg" 
      :style="[{'background-color': backgroundColorStr, },{fontSize: '18px'}, {fontSize: ['99px', '20px', '12px']}]" 

      @click="() => {
        backgroundColorStr = '#fff';backgroundColor = backgroundColor === 255 ? 0 : 255;
        return Promise.reject('结果错误')
        
      }"
    >
      <span>+</span>
      <span>+</span>
      <span>+</span>
    </button>
    <template v-for="(item, index) in iter" :key="index">
      <br />
      {{ item }} - {{ index }}
    </template>
  </main>
</template>

<script lang="ts">
import { ref, defineComponent, computed, onErrorCaptured } from 'vue'

export default defineComponent({
  name: 'App',
  props: {
    num: {
      type: String,
      default: "99",
    },
  },

  created() {
    // this 其实就是当前组件实例的 proxy
    console.log(this)
  },
  setup(props, ctx,) {
    const count = ref(0);
    const backgroundColor = ref(0);
    const backgroundColorStr = ref('#000');
    onErrorCaptured((err, vm, info) =>{
      console.log(err, vm, info)
      return false;
    })
    return {
      count,
      backgroundColor,
      iter: [...'abcdefg'],
      fontColor: computed(() => Math.abs(backgroundColor.value - 255)),
      classBg: 'bg',
      backgroundColorStr,
    }
  },
})
</script>

<style scoped>
main {
  min-height: 100vh;
  background-color: rgb(v-bind(backgroundColor), v-bind(backgroundColor), v-bind(backgroundColor));
  color: rgb(v-bind(fontColor), v-bind(fontColor), v-bind(fontColor));
}
.bg {
  width: 75px;
  height: 35px;
  border-radius: 4px;
  border: none;
  transition: all 0.2s;
}
.bg:active {
  outline-width: 4px;
}
</style>