import {
  camelize,
  EMPTY_OBJ,
  toHandlerKey,
  extend,
  hasOwn,
  hyphenate,
  isArray,
  isFunction,
  isOn,
  toNumber
} from '@vue/shared'
import {
  ComponentInternalInstance,
  ComponentOptions,
  ConcreteComponent,
  formatComponentName
} from './component'
import { callWithAsyncErrorHandling, ErrorCodes } from './errorHandling'
import { warn } from './warning'
import { UnionToIntersection } from './helpers/typeUtils'
import { devtoolsComponentEmit } from './devtools'
import { AppContext } from './apiCreateApp'
import { emit as compatInstanceEmit } from './compat/instanceEventEmitter'
import {
  compatModelEventPrefix,
  compatModelEmit
} from './compat/componentVModel'

export type ObjectEmitsOptions = Record<
  string,
  ((...args: any[]) => any) | null
>
export type EmitsOptions = ObjectEmitsOptions | string[]

export type EmitFn<
  Options = ObjectEmitsOptions,
  Event extends keyof Options = keyof Options
> = Options extends Array<infer V>
  ? (event: V, ...args: any[]) => void
  : {} extends Options // if the emit is empty object (usually the default value for emit) should be converted to function
    ? (event: string, ...args: any[]) => void
    : UnionToIntersection<
        {
          [key in Event]: Options[key] extends ((...args: infer Args) => any)
            ? (event: key, ...args: Args) => void
            : (event: key, ...args: any[]) => void
        }[Event]
      >

/**
 * > emit 方法
 * @description 触发 组件自定义 事件 (cxt.emit, this.$emit)
 * @param {ComponentInternalInstance} instance 当前实例 (在创建实例时会使用 bind() 绑定该实例)
 * @param {string} event 事件名称
 * @param {...any[]} rawArgs 参数
 * @returns
 */
export function emit(
  instance: ComponentInternalInstance,
  event: string,
  ...rawArgs: any[]
) {
  /**
   * 获取当前 组件 的 vnode (vnode 上有 绑定的 父组件自定义的事件)
   */
  const props = instance.vnode.props || EMPTY_OBJ

  /**
   * 开发环境的处理 不需要考虑 验证 emits 内有没有配置 这个事件的配置项
   */
  if (__DEV__) {
    const {
      emitsOptions,
      propsOptions: [propsOptions]
    } = instance
    if (emitsOptions) {
      if (
        !(event in emitsOptions) &&
        !(
          __COMPAT__ &&
          (event.startsWith('hook:') ||
            event.startsWith(compatModelEventPrefix))
        )
      ) {
        if (!propsOptions || !(toHandlerKey(event) in propsOptions)) {
          warn(
            `Component emitted event "${event}" but it is neither declared in ` +
              `the emits option nor as an "${toHandlerKey(event)}" prop.`
          )
        }
      } else {
        const validator = emitsOptions[event]
        if (isFunction(validator)) {
          const isValid = validator(...rawArgs)
          if (!isValid) {
            warn(
              `Invalid event arguments: event validation failed for event "${event}".`
            )
          }
        }
      }
    }
  }

  let args = rawArgs
  // 判断是否要触发 v-model (v-model再编译成 vnode 时,会props添加 onUpdate:modelValue, modelValue)
  const isModelListener = event.startsWith('update:')

  // for v-model update:xxx events, apply modifiers on args
  // 获取到 update: 后面的 名称
  const modelArg = isModelListener && event.slice(7)

  // 判断 是否存在, 并且 modelArg 是 props 的一个属性
  if (modelArg && modelArg in props) {
    /**
     * 如果是 v-model 的绑定值，就获取 modelModifiers (这个是存储 v-model 后缀的 配置项)
     */
    const modifiersKey = `${
      modelArg === 'modelValue' ? 'model' : modelArg
    }Modifiers`
    // 获取 v-model.number v-model.trim 的配置项
    const { number, trim } = props[modifiersKey] || EMPTY_OBJ
    // trim = true
    if (trim) {
      // 将 emit 参数 全部掉首尾空格
      args = rawArgs.map(a => a.trim())

      // number = true
    } else if (number) {
      // 将 emit 参数 全部转 number 类型
      args = rawArgs.map(toNumber)
    }
  }

  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    devtoolsComponentEmit(instance, event, args)
  }

  if (__DEV__) {
    const lowerCaseEvent = event.toLowerCase()
    if (lowerCaseEvent !== event && props[toHandlerKey(lowerCaseEvent)]) {
      warn(
        `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(
            instance,
            instance.type
          )} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
      )
    }
  }

  /**
   * 处理后的 事件名称 (`foo -> onFoo`  `update:modelValue -> onUpdate:modelValue`)
   * @info 因为只有处理后 才能 在props 上访问到 方法
   */
  let handlerName
  /**
   * 获取到 父组件 绑定的函数 (就是当前实例的 vnode 上的 props)
   * @info 名称解析 `toHandlerKey(event)` -> `foo -> onFoo`
   * @info 名称解析 `toHandlerKey(camelize(event))` -> `go-foo -> onGoFoo`
   */
  let handler =
    props[(handlerName = toHandlerKey(event))] ||
    // also try camelCase event handler (#2249)
    props[(handlerName = toHandlerKey(camelize(event)))]
  // for v-model update:xxx events, also trigger kebab-case equivalent
  // for props passed via kebab-case
  if (!handler && isModelListener) {
    handler = props[(handlerName = toHandlerKey(hyphenate(event)))]
  }

  // 如果事件存在 就在 错误捕获函数 内执行 自定义绑定事件
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args
    )
  }

  // 处理 .once (一次性事件)
  const onceHandler = props[handlerName + `Once`]
  if (onceHandler) {
    // 如果 当前实例上 不存在 emitted
    if (!instance.emitted) {
      // 设置 emitted 存储 一次性事件的 key 并且表示 已经执行
      ;(instance.emitted = {} as Record<string, boolean>)[handlerName] = true
    } else if (instance.emitted[handlerName]) {
      // 如果已经 执行过 就直接 结束 emit 函数
      return
    }
    // 在 错误捕获函数 内执行 自定义绑定事件
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      ErrorCodes.COMPONENT_EVENT_HANDLER,
      args
    )
  }

  // 兼容 vue 2.0
  if (__COMPAT__) {
    compatModelEmit(instance, event, args)
    return compatInstanceEmit(instance, event, args)
  }
}

/**
 * > 合并 emits 和 mixins extends 中的 emits 配置
 * @description 标准化 emitsOptions
 * @param {ConcreteComponent} comp 组件的 配置项
 * @param {AppContext} appContext 全局上下文(全局配置)
 * @param {boolean} [asMixin=false] 是否 mixin
 * @returns {NormalizedPropsOptions} 返回 emitsOptions
 */
export function normalizeEmitsOptions(
  comp: ConcreteComponent,
  appContext: AppContext,
  asMixin = false
): ObjectEmitsOptions | null {
  // 判断是否 存在缓存 避免重复处理
  const cache = appContext.emitsCache
  const cached = cache.get(comp)
  if (cached !== undefined) {
    return cached
  }

  /**
   * emits
   */
  const raw = comp.emits
  /**
   * 处理后的 emits
   */
  let normalized: ObjectEmitsOptions = {}

  // apply mixin/extends props
  let hasExtends = false

  // 非函数时处理 mixins
  if (__FEATURE_OPTIONS_API__ && !isFunction(comp)) {
    /**
     * 用来 处理 mixins 和 extends 中的 emits
     */
    const extendEmits = (raw: ComponentOptions) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw, appContext, true)
      if (normalizedFromExtend) {
        hasExtends = true
        extend(normalized, normalizedFromExtend)
      }
    }
    // 主要是 过滤多次处理 全局 mixins (因为默认第一次处理，后续递归函数 不需要处理了)
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits)
    }
    // 处理 extends
    if (comp.extends) {
      extendEmits(comp.extends)
    }
    // 处理组件 组件的 mixins
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits)
    }
  }
  // emits 为空 并且 也没有进行 mixins extends 合并
  if (!raw && !hasExtends) {
    cache.set(comp, null)
    return null
  }

  // 处理 emits 不同类型的值 {emits: ['foo', 'end']} {emits: {foo: () => boolean, end: () => boolean}}
  if (isArray(raw)) {
    raw.forEach(key => (normalized[key] = null))
  } else {
    extend(normalized, raw)
  }
  // 设置当前 组件的 emits 处理后的 缓存
  cache.set(comp, normalized)
  // 返回处理后的 emits
  return normalized
}

// Check if an incoming prop key is a declared emit event listener.
// e.g. With `emits: { click: null }`, props named `onClick` and `onclick` are
// both considered matched listeners.

/**
 * @description 判断 是否是 emit 事件
 * @param {(ObjectEmitsOptions | null)} options emistOptions 配置项
 * @param {string} key 属性的名称
 * @returns {boolean} true || false
 */
export function isEmitListener(
  options: ObjectEmitsOptions | null,
  key: string
): boolean {
  // 没有配置项 或者 key 不是 on开头 就不是 事件
  if (!options || !isOn(key)) {
    return false
  }

  if (__COMPAT__ && key.startsWith(compatModelEventPrefix)) {
    return true
  }

  key = key.slice(2).replace(/Once$/, '')
  return (
    hasOwn(options, key[0].toLowerCase() + key.slice(1)) ||
    hasOwn(options, hyphenate(key)) ||
    hasOwn(options, key)
  )
}
