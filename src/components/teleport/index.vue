<template>
  <Content>
    <template v-slot:title> teleport 传送组件 </template>
    <template v-slot:content>
      <!-- <teleport to="#tele">  -->
        <!-- 这个 teleport 组件 <br /> -->
        <!-- 
          Failed to locate Teleport target with selector "#tele". 
          Note the target element must exist before the component is mounted - i.e. 
          the target cannot be rendered by the component itself, 
          and ideally should be outside of the entire Vue component tree. 
        -->
      <!-- </teleport> -->
      <Suspense>
        <template #default>
          <AsyncComponent />
        </template>
        <template #fallback>Loadding...</template>
      </Suspense>
      
      <div id="tele"></div>
      <p>
        转移 >>> <br />
        目标元素必须事先存在 <br />
        比如 在 suspense 组件内部 就可以异步 插入到任意位置 <br />
      </p>
    </template>
  </Content>
</template>

<script lang="ts">
import { seept } from "@src/utils/seept";
import { defineComponent, h, Teleport } from "vue";

export default defineComponent({
  name: "testTele",
  
  components: {
    AsyncComponent: {
      name: "AsyncComponent",
      render() {
        return h("div", {}, h(Teleport, {to: '#tele'}, "通过 Suspense 异步插入"))
      },
      async setup() {
        await seept(3000)
      }
    }
  }
})
</script>

<style>

</style>