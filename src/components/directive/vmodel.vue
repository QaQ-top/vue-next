<template>
  <Content>
    <template v-slot:title > v-model </template>
    <template v-slot:content >
      {{modelValue}} <br />
      <input type="text" :value="modelValue" @input="change" />
    </template>
  </Content>
</template>

<script lang="ts" >
import { defineComponent } from 'vue';

export default defineComponent({
  name: "vmodel",
  props: {
    modelValue: {
      type: Number,
    }
  },
  emits: {
    "update:modelValue": function (...params: any[]) {
      const [value] = params;
      console.log("update:modelValue", value)
      return true
    }
  },
  setup(props, ctx) {
    return {
      change(e: Event ) {
        const value = +(e.target as unknown as HTMLInputElement).value;

        ctx.emit('update:modelValue', isNaN(value) ? props.modelValue : value)
      }
    }
  }
})
</script>

<style>

</style>