<template>
  <div>
    <StyleAndClass />
    <PropsAndEmits v-model="propsModel" types="12" name="ck" @foo="log" />
    <RefCmponent />
    <Suspense>
      <template v-slot:default>
        <SuspenseCmponent />
      </template>
      <template #fallback>
        <Content>
          <template #title>Loading...</template>
          <template #content>Loading...</template>
        </Content>
      </template>
    </Suspense>
    <TeleportCmponent />
    <Vmodel v-model="propsModel" />
    <Sfc />
    <Template />
  </div>
</template>

<script lang="ts">
import { defineComponent, ref} from "vue";
import StyleAndClass from '@components/style-and-class/index.vue';
import PropsAndEmits from '@components/props-and-emits/index.vue';
import RefCmponent from '@components/ref/index.vue';
import SuspenseCmponent from '@components/suspense/index.vue';
import TeleportCmponent from '@components/teleport/index.vue';
import Vnode from '@components/vnode/index.vue';
import Vmodel from '@components/directive/vmodel.vue';
import Sfc from '@components/sfc/index.vue';
import Template from '@components/template/index.vue';

export default defineComponent({
  name: "App",
  setup() {
    return {
      propsModel: ref(0),
      log(...data: number[]) {
        // console.log('PropsAndEmits: onFoo', data)
      },
    }
  },
  components: {
    StyleAndClass,
    PropsAndEmits,
    RefCmponent,
    SuspenseCmponent,
    TeleportCmponent,
    Vnode,
    Vmodel,
    Sfc,
    Template
  }
})
</script>

<style>
</style>