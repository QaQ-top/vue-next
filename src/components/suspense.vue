<template>
  <teleport to='#teleport'>
    {{content}}
  </teleport>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  name: "Sus",
  
  async setup () {

    const seept = () => {
      return new Promise((resolve, reject) => {
        setTimeout(() => resolve("Vue 异步组件"), 3000)
      })
    };

    const content = await seept();

    return {
      content,
    }
  }
})
</script>

<style>

</style>