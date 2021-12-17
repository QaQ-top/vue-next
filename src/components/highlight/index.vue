<template>
  <div class="box">
    <div class="hljs code" v-html="value" ></div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, defineProps } from 'vue';
import hljs from 'highlight.js';
export default defineComponent({
  name: "highlight"
})
</script>
<script setup lang="ts">
const props = defineProps({
  code: {
    type: String
  }
});
const value = computed(() => {
  return hljs.highlight(props.code!, {
    language: "typescript",
  }).value
})
</script>

<style lang="scss" scoped>
.box {
  margin: 0 auto;
  overflow: auto;
  box-shadow: 0 0 12px 0 #c5c5c5;
  margin: 10px;
  font-family: 'JetBrains';
}
.code {
  width: auto;
  padding: 10px;
  border-radius: 4px;
  white-space: pre-wrap;
}
</style>