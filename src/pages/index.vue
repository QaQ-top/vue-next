<template>
  <div>
    Vue {{count}} {{ss}}
  </div>
  <button @click="() => ss++" class="bg">
    +++
  </button>
  <input type="range" v-model="r" min="0" max="255" />
  <input type="range" v-model="g" min="0" max="255" />
  <input type="range" v-model="b" min="0" max="255" />
  <template v-for="(item, index) in 'abcdefg'" :key="index">
    <br />
    {{item}}
  </template>
</template>

<script lang="ts" setup>
import { ref, defineProps, reactive, watchEffect } from 'vue';

const props = defineProps({
  num: {
    type: String,
    default: 99,
  }
})

const count = ref(0);
const r = ref(0);
const g = ref(0);
const b = ref(0);

ref: ss = 145;


</script>

<style>
.bg {
  width: 100px;
  height: 100px;
  background-color: rgb(v-bind(r), v-bind(g) , v-bind(b) );
}
</style>