<template>
  <div>
    {{types}}
    <slot name="title" ></slot>
    <div :class="$style.box" :onVnodeBeforeMount="()=>{}" ><slot></slot></div>
    <slot name="footer"></slot>
    <Go />
  </div>
</template>

<script lang="ts" >
import { defineComponent, h, provide, useCssModule } from 'vue';

export default defineComponent({
  name: "Test",
  props: {
    name: {
      type: String,
      default: "54"
    },
    types: {
      type: [String,Boolean],
    },
    modelValue: {
      
    },
    eky: {
      default: (props: any) => {
        console.log(props.eky)
        return "454"
      }
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
      props: ["mixins"]
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
  setup(...arr) {
    console.log(arr)
    const [props, ctx] = arr;
    ctx.emit('foo', 1,2,3,4,5)
    ctx.emit('update:modelValue', 100)
    provide('test_provide', {
      value: 999
    });
  }
})
</script>

<style lang="scss" scoped module>
  .box {
    color: blueviolet;
  }
</style>