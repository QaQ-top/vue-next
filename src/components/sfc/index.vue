<template>
  <Content>
    <template #title > sfc </template>
    <template #content>
      <div class="box">
        <div v-if="templateResult.errors.length > 0" class="error">
          <div v-for="(item, index) in templateResult.errors" :key="index" >
            {{item.stack}}
            {{item.loc}}
          </div>
        </div>
        <div v-else-if="templateResult.tips.length > 0">
          <div v-for="(item, index) in templateResult.tips" :key="index" >
          // fsadfasdf {{item}}
          </div>
        </div>
        <div v-else>
          <Highlight :code='templateResult.code' />
        </div>
        <div>
          <Highlight :code='mainRef' />
        </div>
        </div>
    </template>
  </Content>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue';
import * as compiler from 'vue/compiler-sfc';
import source from './index.vue?raw';
import { MyVitePluginVue } from '@utils/vite/vitePlugin';
import { rawOptions, transformMain } from '@utils/vite/plugin-vue';
import { compile as templateCompile } from '@utils/vite/plugin-vue/template';
import { transformStyle } from '@utils/vite/plugin-vue/style';
import { hash } from '@src/utils/vite/plugin-vue/utils/descriptorCache';
const SLFE_URL = new URL("./index.vue", import.meta.url);

export default defineComponent({
  name: "testSfc",
})

</script>

<script lang="ts" setup >
import Highlight from '../highlight/index.vue';


// import impUrl from './test?url';
// import impWorker from './test?worker';

let options: MyVitePluginVue.ResolvedOptions = {
    ...rawOptions,
    include: [],
    exclude: [],
    sourceMap: true
  };
const parse = compiler.parse(source, {
      ...options
    })
    parse.descriptor.id = hash(SLFE_URL.href + (options.isProduction ? source : ''))
    const templateResult = templateCompile(parse.descriptor, options, false);
    const styleResult = transformStyle(parse.descriptor, 0, options);
    styleResult.then((res) => {
      // console.log(parse.descriptor.id, res, VITE_ROOT)
    })
    const mainRef = ref('');
    const main = transformMain(source, SLFE_URL.pathname, options, false);
    main.then(res => {
      mainRef.value = res?.code!
    })
    console.log(templateResult)
</script>

<style lang="scss" scoped>
.box {
  white-space: pre;
}
.error {
  color: rgb(238, 76, 76) !important;
}
</style>