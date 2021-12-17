<template>
  <div class="flex">
    <h3><slot name="title"></slot></h3>
    <div>
      <slot name="content" ></slot>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  name: 'content',
  setup(props, { slots }) {
    // console.log(slots)
    return {

    }
  }
})
</script>

<style lang="scss" scoped>
.flex {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  padding: 24px;
  > h3 {
    margin-bottom: 12px;
  }
}
</style>