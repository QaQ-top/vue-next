<template>
  <Content>
    <template v-slot:title >vnode 对象</template>
    <template v-slo:content>
      <div class="flex nowarp flex-col items-start justify-around" :onVnodeBeforeMount="log('div:onVnodeBeforeMount')" >
        <div>
          <div v-if="show">
            普通的dom元素
          </div>
          <VnodeComponent v-if="show" />
        </div>
        <button @click="toggleShow" > toggleShow </button>
      </div>
    </template>
  </Content>
</template>

<script lang="ts">
import { defineComponent, ref, h } from 'vue';

const VnodeComponent = defineComponent({
  name: 'vnodeComponent',
  render:() => h("div", {}, h("span", {}, "vnodeComponent"))
});

export default defineComponent({
  name: "VnodeIndex",
  setup() {
    const show = ref(true);
    return {
      show,
      toggleShow() {
        show.value = !show.value;

      },
      log(value: any) {
        console.log(value)
      }
    }
  },
  components: {
    VnodeComponent,
  }
})
</script>

<style>

</style>