<template>
  <Content>
    <template v-slot:title>props 和 emits</template>
    <template v-slot:content>
      <div>
        types >> {{types}} <br />
        modelValue >> {{modelValue}} <br />
        <Go />
      </div>
    </template>
  </Content>
</template>

<script lang="ts" >
import { defineComponent, h } from 'vue';

export default defineComponent({
  name: "props-and-emits",
  props: {
    name: {
      type: String,
      default: "54"
    },
    types: {
      type: [String, Boolean],
    },
    modelValue: {
      type: Number,
    },
    eky: {
      default: (props: any) => {
        // console.log(props.eky)
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
    "update:modelValue": (...data: any[]) => {
      return true
    }
  },
  mixins:[
    {
      props: ["mixins"],
      emits: ["golt"]
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
  setup(props, ctx) {
    ctx.emit('foo', 1,2,3,4,5)
    ctx.emit('update:modelValue', 100)
  }
})
</script>

<style lang="scss" scoped module>
  .box {
    color: blueviolet;
  }
</style>