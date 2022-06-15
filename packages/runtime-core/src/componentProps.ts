import {
  toRaw,
  shallowReactive,
  trigger,
  TriggerOpTypes
} from '@vue/reactivity'
import {
  EMPTY_OBJ,
  camelize,
  hyphenate,
  capitalize,
  isString,
  isFunction,
  isArray,
  isObject,
  hasOwn,
  toRawType,
  PatchFlags,
  makeMap,
  isReservedProp,
  EMPTY_ARR,
  def,
  extend,
  isOn,
  IfAny
} from '@vue/shared'
import { warn } from './warning'
import {
  Data,
  ComponentInternalInstance,
  ComponentOptions,
  ConcreteComponent,
  setCurrentInstance,
  unsetCurrentInstance
} from './component'
import { isEmitListener } from './componentEmits'
import { InternalObjectKey } from './vnode'
import { AppContext } from './apiCreateApp'
import { createPropsDefaultThis } from './compat/props'
import { isCompatEnabled, softAssertCompatEnabled } from './compat/compatConfig'
import { DeprecationTypes } from './compat/compatConfig'
import { shouldSkipAttr } from './compat/attrsFallthrough'

export type ComponentPropsOptions<P = Data> =
  | ComponentObjectPropsOptions<P>
  | string[]

export type ComponentObjectPropsOptions<P = Data> = {
  [K in keyof P]: Prop<P[K]> | null
}

export type Prop<T, D = T> = PropOptions<T, D> | PropType<T>

type DefaultFactory<T> = (props: Data) => T | null | undefined

export interface PropOptions<T = any, D = T> {
  type?: PropType<T> | true | null
  required?: boolean
  default?: D | DefaultFactory<D> | null | undefined | object
  validator?(value: unknown): boolean
}

export type PropType<T> = PropConstructor<T> | PropConstructor<T>[]

type PropConstructor<T = any> =
  | { new (...args: any[]): T & {} }
  | { (): T }
  | PropMethod<T>

type PropMethod<T, TConstructor = any> = [T] extends [
  ((...args: any) => any) | undefined
] // if is function with args, allowing non-required functions
  ? { new (): TConstructor; (): T; readonly prototype: TConstructor } // Create Function like constructor
  : never

type RequiredKeys<T> = {
  [K in keyof T]: T[K] extends
    | { required: true }
    | { default: any }
    // don't mark Boolean props as undefined
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? T[K] extends { default: undefined | (() => undefined) }
      ? never
      : K
    : never
}[keyof T]

type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>

type DefaultKeys<T> = {
  [K in keyof T]: T[K] extends
    | { default: any }
    // Boolean implicitly defaults to false
    | BooleanConstructor
    | { type: BooleanConstructor }
    ? T[K] extends { type: BooleanConstructor; required: true } // not default if Boolean is marked as required
      ? never
      : K
    : never
}[keyof T]

type InferPropType<T> = [T] extends [null]
  ? any // null & true would fail to infer
  : [T] extends [{ type: null | true }]
  ? any // As TS issue https://github.com/Microsoft/TypeScript/issues/14829 // somehow `ObjectConstructor` when inferred from { (): T } becomes `any` // `BooleanConstructor` when inferred from PropConstructor(with PropMethod) becomes `Boolean`
  : [T] extends [ObjectConstructor | { type: ObjectConstructor }]
  ? Record<string, any>
  : [T] extends [BooleanConstructor | { type: BooleanConstructor }]
  ? boolean
  : [T] extends [DateConstructor | { type: DateConstructor }]
  ? Date
  : [T] extends [(infer U)[] | { type: (infer U)[] }]
  ? U extends DateConstructor
    ? Date | InferPropType<U>
    : InferPropType<U>
  : [T] extends [Prop<infer V, infer D>]
  ? unknown extends V
    ? IfAny<V, V, D>
    : V
  : T

export type ExtractPropTypes<O> = {
  // use `keyof Pick<O, RequiredKeys<O>>` instead of `RequiredKeys<O>` to support IDE features
  [K in keyof Pick<O, RequiredKeys<O>>]: InferPropType<O[K]>
} & {
  // use `keyof Pick<O, OptionalKeys<O>>` instead of `OptionalKeys<O>` to support IDE features
  [K in keyof Pick<O, OptionalKeys<O>>]?: InferPropType<O[K]>
}

const enum BooleanFlags {
  shouldCast,
  shouldCastTrue
}

// extract props which defined with default from prop options
export type ExtractDefaultPropTypes<O> = O extends object
  ? // use `keyof Pick<O, DefaultKeys<O>>` instead of `DefaultKeys<O>` to support IDE features
    { [K in keyof Pick<O, DefaultKeys<O>>]: InferPropType<O[K]> }
  : {}

type NormalizedProp =
  | null
  | (PropOptions & {
      [BooleanFlags.shouldCast]?: boolean
      [BooleanFlags.shouldCastTrue]?: boolean
    })

// normalized value is a tuple of the actual normalized options
// and an array of prop keys that need value casting (booleans and defaults)
export type NormalizedProps = Record<string, NormalizedProp>
export type NormalizedPropsOptions = [NormalizedProps, string[]] | []

/**
 * @description 初始化 props(shallowReactive 代理) 和 attrs (这个是 实例的 props 状态, 不是组件的配置props)
 * @param {ComponentInternalInstance} instance 组件实例
 * @param {(Data | null)} rawProps 当前组件 vnode 的 props
 * @param {number} isStateful 是否是 状态组件
 * @param {boolean} [isSSR=false] 是否是 ssr
 */
export function initProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  isStateful: number, // result of bitwise flag comparison
  isSSR = false
) {
  const props: Data = {}
  const attrs: Data = {}
  def(attrs, InternalObjectKey, 1)

  instance.propsDefaults = Object.create(null)

  setFullProps(instance, rawProps, props, attrs)

  // ensure all declared prop keys are present
  // 解决 https://github.com/vuejs/vue-next/issues/3288
  // 这里是将父组件没有定义 并且 没有默认值的 prop 设置为 undefined
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = undefined
    }
  }

  // validation
  if (__DEV__) {
    validateProps(rawProps || {}, props, instance)
  }
  // 更新 props attrs
  if (isStateful) {
    // stateful
    // 如果不是ssr 就给 props 浅响应式代理
    instance.props = isSSR ? props : shallowReactive(props)
  } else {
    // 函数组件
    if (!instance.type.props) {
      // functional w/ optional props, props === attrs
      instance.props = attrs
    } else {
      // functional w/ declared props
      instance.props = props
    }
  }
  // attrs 直接处理就好了
  instance.attrs = attrs
}

/**
 * @description 更新 props attrs
 */
export function updateProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  rawPrevProps: Data | null,
  optimized: boolean
) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance
  const rawCurrentProps = toRaw(props)
  const [options] = instance.propsOptions
  let hasAttrsChanged = false

  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    !(
      __DEV__ &&
      (instance.type.__hmrId ||
        (instance.parent && instance.parent.type.__hmrId))
    ) &&
    (optimized || patchFlag > 0) &&
    !(patchFlag & PatchFlags.FULL_PROPS)
  ) {
    if (patchFlag & PatchFlags.PROPS) {
      // Compiler-generated props & no keys change, just set the updated
      // the props.
      const propsToUpdate = instance.vnode.dynamicProps!
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i]
        // skip if the prop key is a declared emit event listener
        if (isEmitListener(instance.emitsOptions, key)) {
          continue
        }
        // PROPS flag guarantees rawProps to be non-null
        const value = rawProps![key]
        if (options) {
          // attr / props separation was done on init and will be consistent
          // in this code path, so just check if attrs have it.
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value
              hasAttrsChanged = true
            }
          } else {
            const camelizedKey = camelize(key)
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false /* isAbsent */
            )
          }
        } else {
          if (__COMPAT__) {
            if (isOn(key) && key.endsWith('Native')) {
              key = key.slice(0, -6) // remove Native postfix
            } else if (shouldSkipAttr(key, instance)) {
              continue
            }
          }
          if (value !== attrs[key]) {
            attrs[key] = value
            hasAttrsChanged = true
          }
        }
      }
    }
  } else {
    // full props update.
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true
    }
    // in case of dynamic props, check if we need to delete keys from
    // the props object
    let kebabKey: string
    for (const key in rawCurrentProps) {
      if (
        !rawProps ||
        // for camelCase
        (!hasOwn(rawProps, key) &&
          // it's possible the original props was passed in as kebab-case
          // and converted to camelCase (#955)
          ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey)))
      ) {
        if (options) {
          if (
            rawPrevProps &&
            // for camelCase
            (rawPrevProps[key] !== undefined ||
              // for kebab-case
              rawPrevProps[kebabKey!] !== undefined)
          ) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              undefined,
              instance,
              true /* isAbsent */
            )
          }
        } else {
          delete props[key]
        }
      }
    }
    // in the case of functional component w/o props declaration, props and
    // attrs point to the same object so it should already have been updated.
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (
          !rawProps ||
          (!hasOwn(rawProps, key) &&
            (!__COMPAT__ || !hasOwn(rawProps, key + 'Native')))
        ) {
          delete attrs[key]
          hasAttrsChanged = true
        }
      }
    }
  }

  // trigger updates for $attrs in case it's used in component slots
  if (hasAttrsChanged) {
    trigger(instance, TriggerOpTypes.SET, '$attrs')
  }

  if (__DEV__) {
    validateProps(rawProps || {}, props, instance)
  }
}

/**
 * @description 区分 父组件绑定的属性是  props状态 还是 attrs 状态
 * @param {ComponentInternalInstance} instance 组件实例
 * @param {(Data | null)} rawProps 当前组件 vnode 的 props当前组件 vnode 的 props (绑定的全部属性)
 * @param {Data} props 实例的 props
 * @param {Data} attrs 实例的 attrs
 * @returns 返回 attrs 是否更新了
 */
function setFullProps(
  instance: ComponentInternalInstance,
  rawProps: Data | null,
  props: Data,
  attrs: Data
) {
  // 获取配置项 和 需要进行 默认值 Boolean值 处理的 keys
  const [options, needCastKeys] = instance.propsOptions
  /**
   * 表示 attrs 是否有改变
   */
  let hasAttrsChanged = false
  let rawCastValues: Data | undefined
  if (rawProps) {
    for (let key in rawProps) {
      // key, ref are reserved and never passed down\
      // 保留字段直接 跳过区分 处理
      if (isReservedProp(key)) {
        continue
      }

      // 兼容性处理
      if (__COMPAT__) {
        if (key.startsWith('onHook:')) {
          softAssertCompatEnabled(
            DeprecationTypes.INSTANCE_EVENT_HOOKS,
            instance,
            key.slice(2).toLowerCase()
          )
        }
        if (key === 'inline-template') {
          continue
        }
      }
      /**
       * 组件上属性 绑定的值
       */
      const value = rawProps[key]
      // prop option names are camelized during normalization, so to support
      // kebab -> camel conversion here we need to camelize the key.
      /**
       * camelize(key) 目的是 - 转 驼峰名命 主要是 在我们标准化 props 配置时 提前转驼峰处理了 (normalizePropsOptions)
       * 再判断 propsOptions 配置项是否操作 并且 key 在 propsOptions配置项内
       */
      let camelKey
      if (options && hasOwn(options, (camelKey = camelize(key)))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          // 没有 needCastKeys 并且 key 不在 needCastKeys内 直接赋值给 props
          props[camelKey] = value
        } else {
          // 如果 key 有默认值 或者 是Boolean类型 先放入到另外一个对象中存储
          ;(rawCastValues || (rawCastValues = {}))[camelKey] = value
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        // Any non-declared (either as a prop or an emitted event) props are put
        // into a separate `attrs` object for spreading. Make sure to preserve
        // original key casing
        // 如果不是 事件 都加到 attrs
        if (__COMPAT__) {
          if (isOn(key) && key.endsWith('Native')) {
            key = key.slice(0, -6) // remove Native postfix
          } else if (shouldSkipAttr(key, instance)) {
            continue
          }
        }
        // 如果旧的attr上不存在这个key 或者 当前的 值 不等于 旧值时 才重新赋值
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value
          hasAttrsChanged = true
        }
      }
    }
  }

  // 再配置 拥有 默认值的 props
  if (needCastKeys) {
    const rawCurrentProps = toRaw(props)
    const castValues = rawCastValues || EMPTY_OBJ

    // 这里循环 的 全部需要处理 默认值、Boolean 的 key
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i]
      // 处理 显示 默认值 还是 父组件给的值
      // 处理 Boolean 正确显示
      props[key] = resolvePropValue(
        options!,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key) // castValues 循环父组件 父组件传递了 拥有默认值 或者 Boolean 的值
      )
    }
  }

  return hasAttrsChanged
}

/**
 * @description 返回 配置项 中的 默认值
 * @param {NormalizedProps} options 组件 props 的配置项
 * @param {Data} props 当前 组件的 props
 * @param {string} key 拥有默认值的 key 或者 类型是 Boolean 的 key
 * @param {unknown} value 对应key 的值 (其实是 父组件给 当前组件 该属性的 值)
 * @param {ComponentInternalInstance} instance 当前props的 组件实例
 * @param {boolean} isAbsent 是否缺少这个 key (意思是 父组件 没有传递该属性)
 * @returns 返回 父组件传递的值 或者 默认值
 */
function resolvePropValue(
  options: NormalizedProps,
  props: Data,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance,
  isAbsent: boolean
) {
  /**
   * 当前 key 在props配置项 中的 配置
   */
  const opt = options[key]
  if (opt != null) {
    /**
     * key 是否 有默认值
     */
    const hasDefault = hasOwn(opt, 'default')
    // default values
    // 如果存在默认属性 并且 父组件没有传递 该值
    if (hasDefault && value === undefined) {
      const defaultValue = opt.default
      // 如果 props配置里 这个key的 值不是还是 当是值 确是函数
      if (opt.type !== Function && isFunction(defaultValue)) {
        const { propsDefaults } = instance
        // 判断当前 key 的 值是否存在 propsDefaults 中
        if (key in propsDefaults) {
          value = propsDefaults[key]
        } else {
          // 如果不存在 就 执行一次 默认函数 得到 值 并且 存储在 propsDefaults 中
          // 这里设置 当前实例 是因为开发人员函数 可能使用 `getCurrentInstance` 保证获取实例正确
          setCurrentInstance(instance)
          value = propsDefaults[key] = defaultValue.call(
            __COMPAT__ &&
              isCompatEnabled(DeprecationTypes.PROPS_DEFAULT_THIS, instance)
              ? createPropsDefaultThis(instance, props, key)
              : null,
            props
          )
          unsetCurrentInstance()
        }
      } else {
        // 否则 value 直接就 的默认值
        value = defaultValue
      }
    }
    // boolean casting
    // 处理 Boolean 类型 的 key
    if (opt[BooleanFlags.shouldCast]) {
      // 没有默认值 并且 父组件也没定义
      if (isAbsent && !hasDefault) {
        value = false

        // 如果 不存在 或者 Boolean应用在String 就将 空字符串 和 key同名的值 可以直接 转成 true
      } else if (
        opt[BooleanFlags.shouldCastTrue] &&
        (value === '' || value === hyphenate(key))
      ) {
        value = true
      }
    }
  }
  return value
}

/**
 * @description 处理 全局mixins 和 组件自己的 mixins extends, 再验证 props的格式是否正确
 * @param {ConcreteComponent} comp 组件的 配置项
 * @param {AppContext} appContext 全局上下文(全局配置)
 * @param {boolean} [asMixin=false] 是否 mixin
 * @returns {NormalizedPropsOptions} 返回 propsOptions
 */
export function normalizePropsOptions(
  comp: ConcreteComponent,
  appContext: AppContext,
  asMixin = false
): NormalizedPropsOptions {
  // 判断是否 存在缓存 避免重复处理
  const cache = appContext.propsCache
  const cached = cache.get(comp)
  if (cached) {
    return cached
  }
  /**
   * props 配置
   * ``` js
   * {
   *   props: {
   *     foo: {
   *       type: String,
   *       default: "45"
   *     }
   *   }
   * }
   * ```
   */
  const raw = comp.props

  /**
   * props
   */
  const normalized: NormalizedPropsOptions[0] = {}
  /**
   * props 中的 key (类型是 Boolean 或者 有默认值的 key都会放入到这个数组)
   */
  const needCastKeys: NormalizedPropsOptions[1] = []

  // apply mixin/extends props
  let hasExtends = false

  // 非函数时处理 (主要是 在判断里面 处理 mixins extend)
  if (__FEATURE_OPTIONS_API__ && !isFunction(comp)) {
    /**
     * 用来 处理 mixins 和 extends 中的 props
     */
    const extendProps = (raw: ComponentOptions) => {
      if (__COMPAT__ && isFunction(raw)) {
        raw = raw.options
      }
      hasExtends = true
      const [props, keys] = normalizePropsOptions(raw, appContext, true)
      // 合并 props
      extend(normalized, props)
      // keys 可能 undefined
      if (keys) needCastKeys.push(...keys)
    }
    // 主要是 过滤多次处理 全局 mixins (因为默认第一次处理，后续递归函数 不需要处理了)
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps)
    }
    // 处理 extends
    if (comp.extends) {
      extendProps(comp.extends)
    }
    // 处理组件 组件的 mixins
    if (comp.mixins) {
      comp.mixins.forEach(extendProps)
    }
  }

  // 没有 props 并且 不是进行递归 获取 mixnis dxteds 的 props
  if (!raw && !hasExtends) {
    // 直接返回 comp 并且表示 已经处理 __props
    cache.set(comp, EMPTY_ARR as any)
    return EMPTY_ARR as any
  }

  // 如果 props 数组 ( props: ["name", "title"] )
  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      if (__DEV__ && !isString(raw[i])) {
        // 开发环境下同时 使用数组语法时，props 必须是字符串。
        warn(`props must be strings when using array syntax.`, raw[i])
      }
      // 用来解析带 - 的字符串 转为驼峰
      const normalizedKey = camelize(raw[i])
      // 验证 props 名称 是否标准
      if (validatePropName(normalizedKey)) {
        // 设置 props
        normalized[normalizedKey] = EMPTY_OBJ
      }
    }
  } else if (raw) {
    // 不是 数组 就只能是对象了
    if (__DEV__ && !isObject(raw)) {
      warn(`invalid props options`, raw)
    }
    // 循环处理 对象的 key
    for (const key in raw) {
      // 处理 - 为 驼峰名命
      const normalizedKey = camelize(key)
      // 验证 props 的 key 是否 标准
      if (validatePropName(normalizedKey)) {
        /**
         * key 的值
         */
        const opt = raw[key]
        /**
         * 值为 函数或者数组 的 处理成对象 ( props: { name: Number, hobby: [Number, String ...] } )
         * @info 处理后 的 opt
         */
        const prop: NormalizedProp = (normalized[normalizedKey] =
          isArray(opt) || isFunction(opt) ? { type: opt } : opt)
        if (prop) {
          const booleanIndex = getTypeIndex(Boolean, prop.type)
          const stringIndex = getTypeIndex(String, prop.type)
          // prop[0] = 是否存在 Boolean 类型
          // prop[1] = 不存在 String 或者 String Boolean 都操作 但是 String 出现的索引要 大于 Boolean
          prop[BooleanFlags.shouldCast] = booleanIndex > -1
          prop[BooleanFlags.shouldCastTrue] =
            stringIndex < 0 || booleanIndex < stringIndex
          // if the prop needs boolean casting or default value
          if (booleanIndex > -1 || hasOwn(prop, 'default')) {
            // 如果 有默认值 或者 类型是 Boolean
            needCastKeys.push(normalizedKey)
          }
        }
      }
    }
  }

  const res: NormalizedPropsOptions = [normalized, needCastKeys]
  // 设置 处理后 props 的缓存
  cache.set(comp, res)
  return res
}

/**
 * @description 验证 props 名称 (保证不能是 $ 开头)
 * @param {string} key props 的名称
 * @returns boolean
 */
function validatePropName(key: string) {
  if (key[0] !== '$') {
    return true
  } else if (__DEV__) {
    warn(`Invalid prop name: "${key}" is a reserved property.`)
  }
  return false
}

// use function string name to check type constructors
// so that it works across vms / iframes.
/**
 * @description 获取类型 (Number, Map, Set ...)
 */
function getType(ctor: Prop<any>): string {
  const match = ctor && ctor.toString().match(/^\s*function (\w+)/)
  return match ? match[1] : ctor === null ? 'null' : ''
}

/**
 * @description 判断两个类型 是否相等
 */
function isSameType(a: Prop<any>, b: Prop<any>): boolean {
  return getType(a) === getType(b)
}

/**
 * @description 判断 类型是否符合 -1 不符合 其它大于 -1 都是符合
 * @param {Prop<any>} type 类型
 * @param {(PropType<any> | void | null | true)} expectedTypes props key的 type
 * @returns {number} -1 | 任意大于 -1 的数
 */
function getTypeIndex(
  type: Prop<any>,
  expectedTypes: PropType<any> | void | null | true
): number {
  if (isArray(expectedTypes)) {
    return expectedTypes.findIndex(t => isSameType(t, type))
  } else if (isFunction(expectedTypes)) {
    return isSameType(expectedTypes, type) ? 0 : -1
  }
  return -1
}

/**
 * dev only
 */
function validateProps(
  rawProps: Data,
  props: Data,
  instance: ComponentInternalInstance
) {
  const resolvedValues = toRaw(props)
  const options = instance.propsOptions[0]
  for (const key in options) {
    let opt = options[key]
    if (opt == null) continue
    validateProp(
      key,
      resolvedValues[key],
      opt,
      !hasOwn(rawProps, key) && !hasOwn(rawProps, hyphenate(key))
    )
  }
}

/**
 * dev only
 */
function validateProp(
  name: string,
  value: unknown,
  prop: PropOptions,
  isAbsent: boolean
) {
  const { type, required, validator } = prop
  // required!
  if (required && isAbsent) {
    warn('Missing required prop: "' + name + '"')
    return
  }
  // missing but optional
  if (value == null && !prop.required) {
    return
  }
  // type check
  if (type != null && type !== true) {
    let isValid = false
    const types = isArray(type) ? type : [type]
    const expectedTypes = []
    // value is valid as long as one of the specified types match
    for (let i = 0; i < types.length && !isValid; i++) {
      const { valid, expectedType } = assertType(value, types[i])
      expectedTypes.push(expectedType || '')
      isValid = valid
    }
    if (!isValid) {
      warn(getInvalidTypeMessage(name, value, expectedTypes))
      return
    }
  }
  // custom validator
  if (validator && !validator(value)) {
    warn('Invalid prop: custom validator check failed for prop "' + name + '".')
  }
}

const isSimpleType = /*#__PURE__*/ makeMap(
  'String,Number,Boolean,Function,Symbol,BigInt'
)

type AssertionResult = {
  valid: boolean
  expectedType: string
}

/**
 * dev only
 */
function assertType(value: unknown, type: PropConstructor): AssertionResult {
  let valid
  const expectedType = getType(type)
  if (isSimpleType(expectedType)) {
    const t = typeof value
    valid = t === expectedType.toLowerCase()
    // for primitive wrapper objects
    if (!valid && t === 'object') {
      valid = value instanceof type
    }
  } else if (expectedType === 'Object') {
    valid = isObject(value)
  } else if (expectedType === 'Array') {
    valid = isArray(value)
  } else if (expectedType === 'null') {
    valid = value === null
  } else {
    valid = value instanceof type
  }
  return {
    valid,
    expectedType
  }
}

/**
 * dev only
 */
function getInvalidTypeMessage(
  name: string,
  value: unknown,
  expectedTypes: string[]
): string {
  let message =
    `Invalid prop: type check failed for prop "${name}".` +
    ` Expected ${expectedTypes.map(capitalize).join(' | ')}`
  const expectedType = expectedTypes[0]
  const receivedType = toRawType(value)
  const expectedValue = styleValue(value, expectedType)
  const receivedValue = styleValue(value, receivedType)
  // check if we need to specify expected value
  if (
    expectedTypes.length === 1 &&
    isExplicable(expectedType) &&
    !isBoolean(expectedType, receivedType)
  ) {
    message += ` with value ${expectedValue}`
  }
  message += `, got ${receivedType} `
  // check if we need to specify received value
  if (isExplicable(receivedType)) {
    message += `with value ${receivedValue}.`
  }
  return message
}

/**
 * dev only
 */
function styleValue(value: unknown, type: string): string {
  if (type === 'String') {
    return `"${value}"`
  } else if (type === 'Number') {
    return `${Number(value)}`
  } else {
    return `${value}`
  }
}

/**
 * dev only
 */
function isExplicable(type: string): boolean {
  const explicitTypes = ['string', 'number', 'boolean']
  return explicitTypes.some(elem => type.toLowerCase() === elem)
}

/**
 * dev only
 */
function isBoolean(...args: string[]): boolean {
  return args.some(elem => elem.toLowerCase() === 'boolean')
}
