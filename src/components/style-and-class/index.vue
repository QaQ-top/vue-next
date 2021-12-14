<template>
  <Content>
    <template v-slot:title> style 和 class </template>
    <template v-slot:content>
      <button
        :class="className"
        :style="[
          {
            'background-color': backgroundColorStr,
            color: backgroundColorStr === '#fff' ? '#000' : '#fff'
          },
          { fontSize: '18px' },
          { fontSize: ['99px', '20px', `${fontSize}px`] }
        ]"
        :inck="backgroundColorStr"
        @click="
          () => {
            backgroundColorStr = backgroundColorStr === '#fff' ? '#000' : '#fff'
          }
        "
      >
        click
      </button>
    </template>
  </Content>
</template>

<script lang="ts">
import { ref, defineComponent } from 'vue'
export default defineComponent({
  created() {
    // this 其实就是当前组件实例的 proxy
    // console.log(this)
  },
  setup(props, ctx) {
    const count = ref(0)
    const fontSize = ref(24)
    const backgroundColorStr = ref('#000')
    return {
      count,
      fontSize,
      className: 'bg',
      backgroundColorStr,
    }
  },

})
</script>

<style scoped lang="scss">
.bg {
  width: 75px;
  height: 35px;
  border-radius: 4px;
  border: none;
  transition: all 0.2s;
}
</style>