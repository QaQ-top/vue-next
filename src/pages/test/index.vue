<template>
  <div>
    {{modelValue}}
    <slot name="title" ></slot>
    <div class="box"><slot></slot></div>
    <slot name="footer"></slot>
    <Go />
  </div>
</template>

<script lang="ts" >
import { defineComponent, h, provide } from 'vue';

export default defineComponent({
  name: "Test",
  props: {
    name: {
      type: String,
      default: "54"
    },
    modelValue: {

    }
  },
  emits: {
    foo: (...arr: any[]) => {
      if(arr.length){
        return true;
      }
      return false;
    },
    'update:modelValue': () => {
      return true
    }
  },
  provide: {
    foo: {
      value: 487
    }
  },
  directives: {
    focus: {
    
    }
  },
  filters: {
    timr() {

    }
  },
  mixins:[
    {
      
    }
  ],
  components: {
    Go: {
      name: "GO",
      render: () => {
        return h('span', 'go')
      }
    }
  },
  deactivated() {
    console.log(this)
  },
  setup(props, ctx) {
    ctx.emit('foo', 1,2,3,4,5)
    ctx.emit('update:modelValue', 100)
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