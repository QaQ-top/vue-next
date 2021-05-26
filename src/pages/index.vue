<template>
  <main>
    <div>Vue {{ count }} {{ num }}</div>
    <button @click="() => {
      count++;
      backgroundColor = backgroundColor == 255 ? 0 : 255;
    }" class="bg">+++</button>
    <template v-for="(item, index) in iter" :key="index">
      <br />
      {{ item }} - {{ index }}
    </template>
  </main>
</template>

<script lang="ts">
import { ref, defineComponent, computed } from 'vue'

export default defineComponent({
  name: 'App',
  props: {
    num: {
      type: String,
      default: "99",
    },
  },
  setup() {
    const count = ref(0);
    const backgroundColor = ref(0);

    return {
      count,
      backgroundColor,
      iter: [...'abcdefg'],
      fontColor: computed(() => Math.abs(backgroundColor.value - 255)),
    }
  },
})
</script>

<style>
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