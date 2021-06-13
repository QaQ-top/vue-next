import { ref, reactive, watchEffect, toRefs } from 'vue'

const storage = localStorage

let len = storage.length

const initStore: any = {}

function getKeys(fn: (key: string) => void) {
  for (let index = 0; index < len; index++) {
    let key = storage.key(index) as string
    fn(key)
  }
}

getKeys(key => {
  initStore[key] = storage.getItem(key)
})

// let get = storage.getItem
let set = storage.setItem

let Store: any = toRefs(reactive(initStore))

console.log(Store)

// 创建 数据缓存 函数
const getCache = (fn: (...agn: any[]) => any) => {
  const cache: any = {}
  return (key: string, watch: () => any) => {
    const value = cache[key]
    return value || (cache[key] = fn(watch))
  }
}

// 创建防抖 函数
const aks = (item: number) => {
  let a = {} as NodeJS.Timeout
  return (fn: () => void) => {
    clearTimeout(a)
    a = setTimeout(() => {
      fn()
    }, item)
  }
}

// 避免 多次同 一个属性值 的 watch
const getWatchStopHandles = getCache(watch => {
  return watchEffect(watch)
})

// 设置 本地存储 防抖
const s = aks(200)

// 初始化 基本数据 监听
getKeys(key => {
  getWatchStopHandles(key, () => {
    const { value } = Store[key]
    s(set.bind(storage, key, value))
  })
})

// const getComputed = getCache((watch) => {
//   return computed(watch)
// });

/**
 * 重写 get
 */
storage.getItem = key => {
  return Storage[key]
}

/**
 * 重写 set
 */
storage.setItem = (key, value) => {
  getWatchStopHandles(key, () => {
    const { value } = Store[key]
    s(set.bind(storage, key, value))
  })
  set.call(storage, key, value)
  Store[key] = ref(value)
}

export const Storage = Store

export function useAjax(url: string) {
  let data = ref<any>(null)
  let loading = ref(true)

  new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('msg')
    }, 5000)
  })
    .then(res => {
      data.value = { data: res }
    })
    .finally(() => {
      loading.value = false
    })
  return {
    data,
    loading
  }
}
