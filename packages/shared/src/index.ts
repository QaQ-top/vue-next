import { makeMap } from './makeMap'

export { makeMap }
export * from './patchFlags'
export * from './shapeFlags'
export * from './slotFlags'
export * from './globalsWhitelist'
export * from './codeframe'
export * from './normalizeProp'
export * from './domTagConfig'
export * from './domAttrConfig'
export * from './escapeHtml'
export * from './looseEqual'
export * from './toDisplayString'

/**
 * List of @babel/parser plugins that are used for template expression
 * transforms and SFC script transforms. By default we enable proposals slated
 * for ES2020. This will need to be updated as the spec moves forward.
 * Full list at https://babeljs.io/docs/en/next/babel-parser#plugins
 */
export const babelParserDefaultPlugins = [
  'bigInt',
  'optionalChaining',
  'nullishCoalescingOperator'
] as const

export const EMPTY_OBJ: { readonly [key: string]: any } = __DEV__
  ? Object.freeze({})
  : {}
export const EMPTY_ARR = __DEV__ ? Object.freeze([]) : []

export const NOOP = () => {}

/**
 * Always return false.
 */
export const NO = () => false

const onRE = /^on[^a-z]/
/**
 * 用来判断 字符串 是否是 on+(非小写字母) 开头
 */
export const isOn = (key: string) => onRE.test(key)

/**
 * 是否是 v-model 更新事件
 * onUpdate:modelValue
 */
export const isModelListener = (key: string) => key.startsWith('onUpdate:')

/**
 * extend 就是 Object.assign 合并对象
 */
export const extend = Object.assign

export const remove = <T>(arr: T[], el: T) => {
  const i = arr.indexOf(el)
  if (i > -1) {
    arr.splice(i, 1)
  }
}

const hasOwnProperty = Object.prototype.hasOwnProperty

/**
 * 对象是否 拥有该属性 key
 */
export const hasOwn = (
  val: object,
  key: string | symbol
): key is keyof typeof val => hasOwnProperty.call(val, key)

/**
 * 是否是 Array
 */
export const isArray = Array.isArray
/**
 * 是否是 Map
 */
export const isMap = (val: unknown): val is Map<any, any> =>
  toTypeString(val) === '[object Map]'
/**
 * 是否是 Set
 */
export const isSet = (val: unknown): val is Set<any> =>
  toTypeString(val) === '[object Set]'

/**
 * 是否是 Date(时间对象)
 */
export const isDate = (val: unknown): val is Date => val instanceof Date
/**
 * 是否是函数
 */
export const isFunction = (val: unknown): val is Function =>
  typeof val === 'function'
/**
 * 是否是字符串
 */
export const isString = (val: unknown): val is string => typeof val === 'string'
/**
 * 是否是 symbol
 */
export const isSymbol = (val: unknown): val is symbol => typeof val === 'symbol'
/**
 * 是否是 Object
 */
export const isObject = (val: unknown): val is Record<any, any> =>
  val !== null && typeof val === 'object'
/**
 * 是否是 Promise
 */
export const isPromise = <T = any>(val: unknown): val is Promise<T> => {
  return isObject(val) && isFunction(val.then) && isFunction(val.catch)
}

export const objectToString = Object.prototype.toString
export const toTypeString = (value: unknown): string =>
  objectToString.call(value)

export const toRawType = (value: unknown): string => {
  // extract "RawType" from strings like "[object RawType]"
  return toTypeString(value).slice(8, -1)
}

export const isPlainObject = (val: unknown): val is object =>
  toTypeString(val) === '[object Object]'

export const isIntegerKey = (key: unknown) =>
  isString(key) &&
  key !== 'NaN' &&
  key[0] !== '-' &&
  '' + parseInt(key, 10) === key

export const isReservedProp = /*#__PURE__*/ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ',key,ref,' +
    'onVnodeBeforeMount,onVnodeMounted,' +
    'onVnodeBeforeUpdate,onVnodeUpdated,' +
    'onVnodeBeforeUnmount,onVnodeUnmounted'
)

/**
 * @introduction 接收一个函数 返回一个 函数
 * @introduction 创建一个 cache 闭包变量
 * @introduction cache 用于缓存 解析结果 避免 重复解析
 */
const cacheStringFunction = <T extends (str: string) => string>(fn: T): T => {
  const cache: Record<string, string> = Object.create(null)
  return ((str: string) => {
    // 访问存储
    const hit = cache[str]
    // 没有存储的时候调用解析函数，并且存储解析的值
    return hit || (cache[str] = fn(str))
  }) as any
}

const camelizeRE = /-(\w)/g
/**
 * @description 用来解析带 - 的字符串 转为驼峰
 */
export const camelize = cacheStringFunction(
  (str: string): string => {
    return str.replace(camelizeRE, (_, c) => (c ? c.toUpperCase() : ''))
  }
)

const hyphenateRE = /\B([A-Z])/g
/**
 * @description 将字符串非第一个单词并且是大写的单词 转为 - 加 小写 (fontSize -> font-size)
 */
export const hyphenate = cacheStringFunction((str: string) =>
  str.replace(hyphenateRE, '-$1').toLowerCase()
)

/**
 * @description 将字符串 第一个字符转为 大写
 */
export const capitalize = cacheStringFunction(
  (str: string) => str.charAt(0).toUpperCase() + str.slice(1)
)

/**
 * @description
 */
export const toHandlerKey = cacheStringFunction(
  (str: string) => (str ? `on${capitalize(str)}` : ``)
)

// compare whether a value has changed, accounting for NaN.
export const hasChanged = (value: any, oldValue: any): boolean =>
  value !== oldValue && (value === value || oldValue === oldValue)

export const invokeArrayFns = (fns: Function[], arg?: any) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](arg)
  }
}

export const def = (obj: object, key: string | symbol, value: any) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    value
  })
}

export const toNumber = (val: any): any => {
  const n = parseFloat(val)
  return isNaN(n) ? val : n
}

let _globalThis: any
/**
 * 获取 全局对象
 */
export const getGlobalThis = (): any => {
  return (
    _globalThis ||
    (_globalThis =
      typeof globalThis !== 'undefined'
        ? globalThis
        : typeof self !== 'undefined'
          ? self
          : typeof window !== 'undefined'
            ? window
            : typeof global !== 'undefined'
              ? global
              : {})
  )
}
