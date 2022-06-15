import {
  ComponentInternalInstance,
  Data,
  getExposeProxy,
  isStatefulComponent
} from './component'
import { nextTick, queueJob } from './scheduler'
import { instanceWatch, WatchOptions, WatchStopHandle } from './apiWatch'
import {
  EMPTY_OBJ,
  hasOwn,
  isGloballyWhitelisted,
  NOOP,
  extend,
  isString,
  isFunction,
  UnionToIntersection
} from '@vue/shared'
import {
  toRaw,
  shallowReadonly,
  track,
  TrackOpTypes,
  ShallowUnwrapRef,
  UnwrapNestedRefs
} from '@vue/reactivity'
import {
  ExtractComputedReturns,
  ComponentOptionsBase,
  ComputedOptions,
  MethodOptions,
  ComponentOptionsMixin,
  OptionTypesType,
  OptionTypesKeys,
  resolveMergedOptions,
  shouldCacheAccess,
  MergedComponentOptionsOverride
} from './componentOptions'
import { EmitsOptions, EmitFn } from './componentEmits'
import { Slots } from './componentSlots'
import { markAttrsAccessed } from './componentRenderUtils'
import { currentRenderingInstance } from './componentRenderContext'
import { warn } from './warning'
import { installCompatInstanceProperties } from './compat/instance'

/**
 * Custom properties added to component instances in any way and can be accessed through `this`
 *
 * @example
 * Here is an example of adding a property `$router` to every component instance:
 * ```ts
 * import { createApp } from 'vue'
 * import { Router, createRouter } from 'vue-router'
 *
 * declare module '@vue/runtime-core' {
 *   interface ComponentCustomProperties {
 *     $router: Router
 *   }
 * }
 *
 * // effectively adding the router to every component instance
 * const app = createApp({})
 * const router = createRouter()
 * app.config.globalProperties.$router = router
 *
 * const vm = app.mount('#app')
 * // we can access the router from the instance
 * vm.$router.push('/')
 * ```
 */
export interface ComponentCustomProperties {}

type IsDefaultMixinComponent<T> = T extends ComponentOptionsMixin
  ? ComponentOptionsMixin extends T
    ? true
    : false
  : false

type MixinToOptionTypes<T> = T extends ComponentOptionsBase<
  infer P,
  infer B,
  infer D,
  infer C,
  infer M,
  infer Mixin,
  infer Extends,
  any,
  any,
  infer Defaults
>
  ? OptionTypesType<P & {}, B & {}, D & {}, C & {}, M & {}, Defaults & {}> &
      IntersectionMixin<Mixin> &
      IntersectionMixin<Extends>
  : never

// ExtractMixin(map type) is used to resolve circularly references
type ExtractMixin<T> = {
  Mixin: MixinToOptionTypes<T>
}[T extends ComponentOptionsMixin ? 'Mixin' : never]

type IntersectionMixin<T> = IsDefaultMixinComponent<T> extends true
  ? OptionTypesType<{}, {}, {}, {}, {}>
  : UnionToIntersection<ExtractMixin<T>>

type UnwrapMixinsType<
  T,
  Type extends OptionTypesKeys
> = T extends OptionTypesType ? T[Type] : never

type EnsureNonVoid<T> = T extends void ? {} : T

export type ComponentPublicInstanceConstructor<
  T extends ComponentPublicInstance<
    Props,
    RawBindings,
    D,
    C,
    M
  > = ComponentPublicInstance<any>,
  Props = any,
  RawBindings = any,
  D = any,
  C extends ComputedOptions = ComputedOptions,
  M extends MethodOptions = MethodOptions
> = {
  __isFragment?: never
  __isTeleport?: never
  __isSuspense?: never
  new (...args: any[]): T
}

export type CreateComponentPublicInstance<
  P = {},
  B = {},
  D = {},
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  Mixin extends ComponentOptionsMixin = ComponentOptionsMixin,
  Extends extends ComponentOptionsMixin = ComponentOptionsMixin,
  E extends EmitsOptions = {},
  PublicProps = P,
  Defaults = {},
  MakeDefaultsOptional extends boolean = false,
  PublicMixin = IntersectionMixin<Mixin> & IntersectionMixin<Extends>,
  PublicP = UnwrapMixinsType<PublicMixin, 'P'> & EnsureNonVoid<P>,
  PublicB = UnwrapMixinsType<PublicMixin, 'B'> & EnsureNonVoid<B>,
  PublicD = UnwrapMixinsType<PublicMixin, 'D'> & EnsureNonVoid<D>,
  PublicC extends ComputedOptions = UnwrapMixinsType<PublicMixin, 'C'> &
    EnsureNonVoid<C>,
  PublicM extends MethodOptions = UnwrapMixinsType<PublicMixin, 'M'> &
    EnsureNonVoid<M>,
  PublicDefaults = UnwrapMixinsType<PublicMixin, 'Defaults'> &
    EnsureNonVoid<Defaults>
> = ComponentPublicInstance<
  PublicP,
  PublicB,
  PublicD,
  PublicC,
  PublicM,
  E,
  PublicProps,
  PublicDefaults,
  MakeDefaultsOptional,
  ComponentOptionsBase<P, B, D, C, M, Mixin, Extends, E, string, Defaults>
>

// public properties exposed on the proxy, which is used as the render context
// in templates (as `this` in the render option)
export type ComponentPublicInstance<
  P = {}, // props type extracted from props option
  B = {}, // raw bindings returned from setup()
  D = {}, // return from data()
  C extends ComputedOptions = {},
  M extends MethodOptions = {},
  E extends EmitsOptions = {},
  PublicProps = P,
  Defaults = {},
  MakeDefaultsOptional extends boolean = false,
  Options = ComponentOptionsBase<any, any, any, any, any, any, any, any, any>
> = {
  $: ComponentInternalInstance
  $data: D
  $props: MakeDefaultsOptional extends true
    ? Partial<Defaults> & Omit<P & PublicProps, keyof Defaults>
    : P & PublicProps
  $attrs: Data
  $refs: Data
  $slots: Slots
  $root: ComponentPublicInstance | null
  $parent: ComponentPublicInstance | null
  $emit: EmitFn<E>
  $el: any
  $options: Options & MergedComponentOptionsOverride
  $forceUpdate: () => void
  $nextTick: typeof nextTick
  $watch(
    source: string | Function,
    cb: Function,
    options?: WatchOptions
  ): WatchStopHandle
} & P &
  ShallowUnwrapRef<B> &
  UnwrapNestedRefs<D> &
  ExtractComputedReturns<C> &
  M &
  ComponentCustomProperties

export type PublicPropertiesMap = Record<
  string,
  (i: ComponentInternalInstance) => any
>

/**
 * #2437 In Vue 3, functional components do not have a public instance proxy but
 * they exist in the internal parent chain. For code that relies on traversing
 * public $parent chains, skip functional ones and go to the parent instead.
 */
const getPublicInstance = (
  i: ComponentInternalInstance | null
): ComponentPublicInstance | ComponentInternalInstance['exposed'] | null => {
  if (!i) return null
  if (isStatefulComponent(i)) return getExposeProxy(i) || i.proxy
  return getPublicInstance(i.parent)
}
  /**
   * 公共属性 映射
   * $: 获取当前组件实例
   * $el: 获取当前组件 根dom
   * $data: 获取代理后的 data
   * $props: 获取代理后的 props
   * $attrs: 获取 attrs
   * $slots: 获取 slots
   * $refs: 获取 refs (当前组件内所有 ref)
   * $parent: 获取 当前实例的 父实例
   * $root: 获取 vue 根实例
   * $emit: 获取 当前实例 的 emit方法
   * $options: 获取 当前实例的配置项
   * $forceUpdate: 强制当前实例渲染，这个更新函数会加入到 调度事件中 的 主任务
   * $nextTick: 返回 nextTick 并且把 代理实例 传入
   * $watch: 返回 instanceWatch 并且绑定当前实例为 this
   */
export const publicPropertiesMap: PublicPropertiesMap =
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /*#__PURE__*/ extend(Object.create(null), {
    $: i => i,
    $el: i => i.vnode.el,
    $data: i => i.data,
    $props: i => (__DEV__ ? shallowReadonly(i.props) : i.props),
    $attrs: i => (__DEV__ ? shallowReadonly(i.attrs) : i.attrs),
    $slots: i => (__DEV__ ? shallowReadonly(i.slots) : i.slots),
    $refs: i => (__DEV__ ? shallowReadonly(i.refs) : i.refs),
    $parent: i => getPublicInstance(i.parent),
    $root: i => getPublicInstance(i.root),
    $emit: i => i.emit,
    $options: i => (__FEATURE_OPTIONS_API__ ? resolveMergedOptions(i) : i.type),
    $forceUpdate: i => i.f || (i.f = () => queueJob(i.update)),
    $nextTick: i => i.n || (i.n = nextTick.bind(i.proxy!)),
    $watch: i => (__FEATURE_OPTIONS_API__ ? instanceWatch.bind(i) : NOOP)
  } as PublicPropertiesMap)

if (__COMPAT__) {
  installCompatInstanceProperties(publicPropertiesMap)
}

const enum AccessTypes {
  /**
   * 代表其它
   */
  OTHER,
  /**
   * 表示 setup 返回的数据
   */
  SETUP,
  /**
   * 表示 data 返回的数据
   */
  DATA,
  /**
   * 表示 props 的数据
   */
  PROPS,
  /**
   * 表示 ctx
   */
  CONTEXT
}

export interface ComponentRenderContext {
  [key: string]: any
  _: ComponentInternalInstance
}


export const isReservedPrefix = (key: string) => key === '_' || key === '$'
/**
 * @description 实例代理处理
 */
export const PublicInstanceProxyHandlers: ProxyHandler<any> = {
  get({ _: instance }: ComponentRenderContext, key: string) {
    const { ctx, setupState, data, props, accessCache, type, appContext } =
      instance

    // for internal formatters to know that this is a Vue instance
    if (__DEV__ && key === '__isVue') {
      return true
    }

    // prioritize <script setup> bindings during dev.
    // this allows even properties that start with _ or $ to be used - so that
    // it aligns with the production behavior where the render fn is inlined and
    // indeed has access to all declared variables.
    if (
      __DEV__ &&
      setupState !== EMPTY_OBJ &&
      setupState.__isScriptSetup &&
      hasOwn(setupState, key)
    ) {
      return setupState[key]
    }

    // data / props / ctx
    // This getter gets called for every property access on the render context
    // during render and is a major hotspot. The most expensive part of this
    // is the multiple hasOwn() calls. It's much faster to do a simple property
    // access on a plain object, so we use an accessCache object (with null
    // prototype) to memoize what access type a key corresponds to.
    let normalizedProps
    // 如果访问 的 不是$开头的属性
    if (key[0] !== '$') {
      /**
       * 目标数据存储位置
       */
      const n = accessCache![key]
      // 如果 有缓存 访问位置
      if (n !== undefined) {
        switch (n) {
          // 0 代表setupState (setup 返回)
          case AccessTypes.SETUP:
            return setupState[key]

          // 1 代表 data 中的数据
          case AccessTypes.DATA:
            return data[key]

          // 3 代表 ctx 中的数据
          case AccessTypes.CONTEXT:
            return ctx[key]

          // 2 代表 props 中的数据
          case AccessTypes.PROPS:
            return props![key]
          // default: just fallthrough
        }
      } else if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
        // 如果 setupState 不是 空对象 并且 setupState 中 存在这个 key
        // 保存 访问路径然后 返回数据
        accessCache![key] = AccessTypes.SETUP
        return setupState[key]
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        // 如果 data 不是 空对象 并且 data 中 存在这个 key
        // 保存 访问路径然后 返回数据
        accessCache![key] = AccessTypes.DATA
        return data[key]
      } else if (
        // only cache other properties when instance has declared (thus stable)
        // props
        (normalizedProps = instance.propsOptions[0]) &&
        hasOwn(normalizedProps, key)
      ) {
        // 这里不同的是 必须保证 组件实例上 props配置项 里面有配置这个 key 才让你 访问组件的 props
        accessCache![key] = AccessTypes.PROPS
        return props![key]
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache![key] = AccessTypes.CONTEXT
        return ctx[key]
      } else if (!__FEATURE_OPTIONS_API__ || shouldCacheAccess) {
        accessCache![key] = AccessTypes.OTHER
      }
    }

    // 代理 $开头的 属性和 方法
    const publicGetter = publicPropertiesMap[key]
    let cssModule, globalProperties
    // public $xxx properties
    if (publicGetter) {
      if (key === '$attrs') {
        track(instance, TrackOpTypes.GET, key)
        __DEV__ && markAttrsAccessed()
      }
      return publicGetter(instance)
    } else if (
      // css module (injected by vue-loader)
      // 判断 是否 是 cssModule ($style 访问时)
      (cssModule = type.__cssModules) &&
      (cssModule = cssModule[key])
    ) {
      return cssModule
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      // user may set custom properties to `this` that start with `$`
      // 访问 自定义 $ 开头的 属性
      accessCache![key] = AccessTypes.CONTEXT
      return ctx[key]
    } else if (
      // global properties
      ((globalProperties = appContext.config.globalProperties),
      hasOwn(globalProperties, key))
    ) {
      // 在去访问 全局 属性
      if (__COMPAT__) {
        const desc = Object.getOwnPropertyDescriptor(globalProperties, key)!
        if (desc.get) {
          return desc.get.call(instance.proxy)
        } else {
          const val = globalProperties[key]
          return isFunction(val)
            ? Object.assign(val.bind(instance.proxy), val)
            : val
        }
      } else {
        return globalProperties[key]
      }
    } else if (
      __DEV__ &&
      currentRenderingInstance &&
      (!isString(key) ||
        // #1091 avoid internal isRef/isVNode checks on component instance leading
        // to infinite warning loop
        key.indexOf('__v') !== 0)
    ) {
      // 开发获取下 提示 没有该属性的错误
      if (data !== EMPTY_OBJ && isReservedPrefix(key[0]) && hasOwn(data, key)) {
        warn(
          `Property ${JSON.stringify(
            key
          )} must be accessed via $data because it starts with a reserved ` +
            `character ("$" or "_") and is not proxied on the render context.`
        )
      } else if (instance === currentRenderingInstance) {
        warn(
          `Property ${JSON.stringify(key)} was accessed during render ` +
            `but is not defined on instance.`
        )
      }
    }
  },

  set(
    { _: instance }: ComponentRenderContext,
    key: string,
    value: any
  ): boolean {
    // set 代理后 方法 只能 设置  data, setupState, ctx
    const { data, setupState, ctx } = instance
    if (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) {
      setupState[key] = value
      return true
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value
      return true
    } else if (hasOwn(instance.props, key)) {
      __DEV__ &&
        warn(
          `Attempting to mutate prop "${key}". Props are readonly.`,
          instance
        )
      return false
    }
    if (key[0] === '$' && key.slice(1) in instance) {
      __DEV__ &&
        warn(
          `Attempting to mutate public property "${key}". ` +
            `Properties starting with $ are reserved and readonly.`,
          instance
        )
      return false
    } else {
      if (__DEV__ && key in instance.appContext.config.globalProperties) {
        Object.defineProperty(ctx, key, {
          enumerable: true,
          configurable: true,
          value
        })
      } else {
        ctx[key] = value
      }
    }
    return true
  },

  has(
    {
      _: { data, setupState, accessCache, ctx, appContext, propsOptions }
    }: ComponentRenderContext,
    key: string
  ) {
    let normalizedProps
    return (
      !!accessCache![key] ||
      (data !== EMPTY_OBJ && hasOwn(data, key)) ||
      (setupState !== EMPTY_OBJ && hasOwn(setupState, key)) ||
      ((normalizedProps = propsOptions[0]) && hasOwn(normalizedProps, key)) ||
      hasOwn(ctx, key) ||
      hasOwn(publicPropertiesMap, key) ||
      hasOwn(appContext.config.globalProperties, key)
    )
  },

  defineProperty(
    target: ComponentRenderContext,
    key: string,
    descriptor: PropertyDescriptor
  ) {
    if (descriptor.get != null) {
      // invalidate key cache of a getter based property #5417
      target._.accessCache![key] = 0
    } else if (hasOwn(descriptor, 'value')) {
      this.set!(target, key, descriptor.value, null)
    }
    return Reflect.defineProperty(target, key, descriptor)
  }
}

if (__DEV__ && !__TEST__) {
  PublicInstanceProxyHandlers.ownKeys = (target: ComponentRenderContext) => {
    warn(
      `Avoid app logic that relies on enumerating keys on a component instance. ` +
        `The keys will be empty in production mode to avoid performance overhead.`
    )
    return Reflect.ownKeys(target)
  }
}

export const RuntimeCompiledPublicInstanceProxyHandlers = /*#__PURE__*/ extend(
  {},
  PublicInstanceProxyHandlers,
  {
    get(target: ComponentRenderContext, key: string) {
      // fast path for unscopables when using `with` block
      if ((key as any) === Symbol.unscopables) {
        return
      }
      return PublicInstanceProxyHandlers.get!(target, key, target)
    },
    has(_: ComponentRenderContext, key: string) {
      const has = key[0] !== '_' && !isGloballyWhitelisted(key)
      if (__DEV__ && !has && PublicInstanceProxyHandlers.has!(_, key)) {
        warn(
          `Property ${JSON.stringify(
            key
          )} should not start with _ which is a reserved prefix for Vue internals.`
        )
      }
      return has
    }
  }
)

// dev only
// In dev mode, the proxy target exposes the same properties as seen on `this`
// for easier console inspection. In prod mode it will be an empty object so
// these properties definitions can be skipped.
export function createDevRenderContext(instance: ComponentInternalInstance) {
  const target: Record<string, any> = {}

  // expose internal instance for proxy handlers
  Object.defineProperty(target, `_`, {
    configurable: true,
    enumerable: false,
    get: () => instance
  })

  // expose public properties
  Object.keys(publicPropertiesMap).forEach(key => {
    Object.defineProperty(target, key, {
      configurable: true,
      enumerable: false,
      get: () => publicPropertiesMap[key](instance),
      // intercepted by the proxy so no need for implementation,
      // but needed to prevent set errors
      set: NOOP
    })
  })

  return target as ComponentRenderContext
}

// dev only
export function exposePropsOnRenderContext(
  instance: ComponentInternalInstance
) {
  const {
    ctx,
    propsOptions: [propsOptions]
  } = instance
  if (propsOptions) {
    Object.keys(propsOptions).forEach(key => {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => instance.props[key],
        set: NOOP
      })
    })
  }
}

// dev only
export function exposeSetupStateOnRenderContext(
  instance: ComponentInternalInstance
) {
  const { ctx, setupState } = instance
  Object.keys(toRaw(setupState)).forEach(key => {
    if (!setupState.__isScriptSetup) {
      if (isReservedPrefix(key[0])) {
        warn(
          `setup() return property ${JSON.stringify(
            key
          )} should not start with "$" or "_" ` +
            `which are reserved prefixes for Vue internals.`
        )
        return
      }
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => setupState[key],
        set: NOOP
      })
    }
  })
}
