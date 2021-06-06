<template>
  <div>
    <slot name="title" ></slot>
    <div class="box"><slot></slot></div>
    <slot name="footer"></slot>
  </div>
</template>

<script lang="ts" >
import { defineComponent, provide } from 'vue';

export default defineComponent({
  name: "Test",
  props: {
    name: {
      type: String
    }
  },
  emits: {
    foo: (...arr: any[]) => {
      if(arr.length){
        return true;
      }
      return false;
    }
  },
  provide: {
    foo: {
      value: 487
    }
  },
  deactivated() {
    console.log(this)
  },
  setup(props, ctx) {
    provide('test_provide', {
      value: 999
    });
  }
})
</script>

<style lang="scss" scoped>
  .box {
    color: blueviolet;
  }
</style>