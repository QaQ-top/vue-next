<template>
  <Content>
    <template v-slot:title >Suspense 异步组件</template>
    <template v-slot:content>
      <div >{{ content }}</div>
    </template>
  </Content>
</template>

<script lang="ts">
import { seept } from '@src/utils/seept';
import { defineComponent } from 'vue';
export default defineComponent({
  name: "Sus",

  async setup() {
    const content = await seept(3000);

    return {
      content,
    }
  },
})
</script>

<style>
</style>