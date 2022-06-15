import { VNode, VNodeChild, isVNode } from './vnode'
import {
  pauseTracking,
  resetTracking,
  shallowReadonly,
  proxyRefs,
  EffectScope,
  markRaw,
  track,
  TrackOpTypes,
  ReactiveEffect
} from '@vue/reactivity'
import {
  ComponentPublicInstance,
  PublicInstanceProxyHandlers,
  createDevRenderContext,
  exposePropsOnRenderContext,
  exposeSetupStateOnRenderContext,
  ComponentPublicInstanceConstructor,
  publicPropertiesMap,
  RuntimeCompiledPublicInstanceProxyHandlers
} from './componentPublicInstance'
import {
  ComponentPropsOptions,
  NormalizedPropsOptions,
  initProps,
  normalizePropsOptions
} from './componentProps'
import { Slots, initSlots, InternalSlots } from './componentSlots'
import { warn } from './warning'
import { ErrorCodes, callWithErrorHandling, handleError } from './errorHandling'
import { AppContext, createAppContext, AppConfig } from './apiCreateApp'
import { Directive, validateDirectiveName } from './directives'
import {
  applyOptions,
  ComponentOptions,
  ComputedOptions,
  MethodOptions
} from './componentOptions'
import {
  EmitsOptions,
  ObjectEmitsOptions,
  EmitFn,
  emit,
  normalizeEmitsOptions
} from './componentEmits'
import {
  EMPTY_OBJ,
  isFunction,
  NOOP,
  isObject,
  NO,
  makeMap,
  isPromise,
  ShapeFlags,
  extend
} from '@vue/shared'
import { SuspenseBoundary } from './components/Suspense'
import { CompilerOptions } from '@vue/compiler-core'
import { markAttrsAccessed } from './componentRenderUtils'
import { currentRenderingInstance } from './componentRenderContext'
import { startMeasure, endMeasure } from './profiling'
import { convertLegacyRenderFn } from './compat/renderFn'
import {
  CompatConfig,
  globalCompatConfig,
  validateCompatConfig
} from './compat/compatConfig'
import { SchedulerJob } from './scheduler'

export type Data = Record<string, unknown>

/**
 * For extending allowed non-declared props on components in TSX
 */
export interface ComponentCustomProps {}

/**
 * Default allowed non-declared props on component in TSX
 */
export interface AllowedComponentProps {
  class?: unknown
  style?: unknown
}

// Note: can't mark this whole interface internal because some public interfaces
// extend it.
export interface ComponentInternalOptions {
  /**
   * @internal
   */
  __scopeId?: string
  /**
   * @internal
   */
  __cssModules?: Data
  /**
   * @internal
   */
  __hmrId?: string
  /**
   * Compat build only, for bailing out of certain compatibility behavior
   */
  __isBuiltIn?: boolean
  /**
   * This one should be exposed so that devtools can make use of it
   */
  __file?: string
  /**
   * name inferred from filename
   */
  __name?: string
}

export interface FunctionalComponent<P = {}, E extends EmitsOptions = {}>
  extends ComponentInternalOptions {
  // use of any here is intentional so it can be a valid JSX Element constructor
  (props: P, ctx: Omit<SetupContext<E>, 'expose'>): any
  props?: ComponentPropsOptions<P>
  emits?: E | (keyof E)[]
  inheritAttrs?: boolean
  displayName?: string
  compatConfig?: CompatConfig
}

export interface ClassComponent {
  new (...args: any[]): ComponentPublicInstance<any, any, any, any, any>
  __vccOpts: ComponentOptions
}

/**
 * Concrete component type matches its actual value: it's either an options
 * object, or a function. Use this where the code expects to work with actual
 * values, e.g. checking if its a function or not. This is mostly for internal
 * implementation code.
 */
export type ConcreteComponent<
  Props = {},
  RawBindings = any,
  D = any,
  C extends ComputedOptions = ComputedOptions,
  M extends MethodOptions = MethodOptions
> =
  | ComponentOptions<Props, RawBindings, D, C, M>
  | FunctionalComponent<Props, any>

/**
 * A type used in public APIs where a component type is expected.
 * The constructor type is an artificial type returned by defineComponent().
 */
export type Component<
  Props = any,
  RawBindings = any,
  D = any,
  C extends ComputedOptions = ComputedOptions,
  M extends MethodOptions = MethodOptions
> =
  | ConcreteComponent<Props, RawBindings, D, C, M>
  | ComponentPublicInstanceConstructor<Props>

export { ComponentOptions }

type LifecycleHook<TFn = Function> = TFn[] | null

export const enum LifecycleHooks {
  /**
   * beforeCreate 创建前
   */
  BEFORE_CREATE = 'bc',
  /**
   * created 创建后
   */
  CREATED = 'c',
  /**
   * beforeMount 挂载前
   */
  BEFORE_MOUNT = 'bm',
  /**
   * mounted 挂载后
   */
  MOUNTED = 'm',
  /**
   * beforeUpdate 更新前
   */
  BEFORE_UPDATE = 'bu',
  /**
   * updated 更新后
   */
  UPDATED = 'u',
  /**
   * beforeUnmount 卸载前
   */
  BEFORE_UNMOUNT = 'bum',
  /**
   * unmounted 卸载后
   */
  UNMOUNTED = 'um',
  /**
   * deactivated 停用后
   */
  DEACTIVATED = 'da',
  /**
   * activated 启用后
   */
  ACTIVATED = 'a',
  /**
   * renderTriggered 数据更新时 跟踪依赖
   */
  RENDER_TRIGGERED = 'rtg',
  /**
   * renderTracked 渲染时 跟踪依赖
   */
  RENDER_TRACKED = 'rtc',
  /**
   * errorCaptured 错误捕获
   */
  ERROR_CAPTURED = 'ec',
  /**
   * serverPrefetch ssr 的钩子
   */
  SERVER_PREFETCH = 'sp'
}

export interface SetupContext<E = EmitsOptions> {
  attrs: Data
  slots: Slots
  emit: EmitFn<E>
  expose: (exposed?: Record<string, any>) => void
}

/**
 * @internal
 */
export type InternalRenderFunction = {
  (
    ctx: ComponentPublicInstance,
    cache: ComponentInternalInstance['renderCache'],
    // for compiler-optimized bindings
    $props: ComponentInternalInstance['props'],
    $setup: ComponentInternalInstance['setupState'],
    $data: ComponentInternalInstance['data'],
    $options: ComponentInternalInstance['ctx']
  ): VNodeChild
  _rc?: boolean // isRuntimeCompiled

  // __COMPAT__ only
  _compatChecked?: boolean // v3 and already checked for v2 compat
  _compatWrapped?: boolean // is wrapped for v2 compat
}

/**
 * @interface Vue 组件实例
 * @info We expose a subset of properties on the internal instance as they are
 * useful for advanced external libraries and tools.
 */
export interface ComponentInternalInstance {
  /**
   * @info 自增唯一id标示
   */
  uid: number
  /**
   * @info 组件类型 (其实就个组件的 配置项)
   */
  type: ConcreteComponent
  /**
   * @info 当前组件的父组件实例
   */
  parent: ComponentInternalInstance | null
  /**
   * @info vue 根组件实例
   */
  root: ComponentInternalInstance
  /**
   * @info 应用上下文(全局配置)
   */
  appContext: AppContext
  /**
   * Vnode representing this component in its parent's vdom tree
   * @info 该组件的虚拟节点
   */
  vnode: VNode
  /**
   * The pending new vnode from parent updates
   * @internal
   */
  next: VNode | null
  /**
   * Root vnode of this component's own vdom tree
   * @info 当前组件自己 的根 vnode (模板语法的根，或者 render setup 返回的 dom)
   */
  subTree: VNode
  /**
  /**
   * The reactive effect for rendering and patching the component. Callable.
   * @info 会引起更新和渲染的响应式的副作用
   * Render effect instance
   */
  effect: ReactiveEffect
  /**
   * Bound effect runner to be passed to schedulers
   */
  update: SchedulerJob
  /**
   * The render function that returns vdom tree.
   * @internal
   * @info 返回 vdom 提供给浏览器渲染成真实dom
   */
  render: InternalRenderFunction | null
  /**
   * SSR render function
   * @internal
   */
  ssrRender?: Function | null
  /**
   * Object containing values this component provides for its descendents
   * @info `provide` 嵌入的 对象
   */
  provides: Data
  /**
   * Tracking reactive effects (e.g. watchers) associated with this component
   * so that they can be automatically stopped on component unmount
   * @info 记录所有的副作用`effect`，比如你的`watch` `watchEffect` ...，这样在组件被卸载的时候就能自动解除这些监听
   */
  scope: EffectScope
  /**
   * cache for proxy access type to avoid hasOwnProperty calls
   * @info 渲染代理的属性访问缓存
   */
  accessCache: Data | null
  /**
   * cache for render function values that rely on _ctx but won't need updates
   * after initialized (e.g. inline handlers)
   *  @info 渲染缓存
   */
  renderCache: (Function | VNode)[]

  /**
   * Resolved component registry, only for components with mixins or extends
   * @info 当前组件注册的 `组件`
   */
  components: Record<string, ConcreteComponent> | null
  /**
   * Resolved directive registry, only for components with mixins or extends
   * @info 当前组件注册的 `指令`
   */
  directives: Record<string, Directive> | null
  /**
   * Resolved filters registry, v2 compat only
   * @info 当前组件注册的 `过滤器`
   */
  filters?: Record<string, Function>
  /**
   * resolved props options
   * @info 就是组件自己的 `props` 配置项
   */
  propsOptions: NormalizedPropsOptions
  /**
   * resolved emits options
   * @info 就是组件自己的 `emits` 配置项
   */
  emitsOptions: ObjectEmitsOptions | null
  /**
   * resolved inheritAttrs options
   * @internal
   */
  inheritAttrs?: boolean
  /**
   * is custom element?
   */
  isCE?: boolean
  /**
   * custom element specific HMR method
   */
  ceReload?: (newStyles?: string[]) => void

  // the rest are only for stateful components ---------------------------------

  // main proxy that serves as the public instance (`this`)
  /**
   * @info 作为公共实例的主要代理（`this`）
   * @info 开发人员可访问的 "实例"(`this`)
   */
  proxy: ComponentPublicInstance | null

  // exposed properties via expose()
  /**
   * 通过 expose() 暴露的属性
   */
  exposed: Record<string, any> | null
  exposeProxy: Record<string, any> | null

  /**
   * alternative proxy used only for runtime-compiled render functions using
   * `with` block
   * @info 在使用 `runtime-compiled(template配置项)` 会用这个代替 proxy 使用 `with` 块
   */
  withProxy: ComponentPublicInstance | null
  /**
   * This is the target for the public instance proxy. It also holds properties
   * injected by user options (computed, methods etc.) and user-attached
   * custom properties (via `this.x = ...`)
   * @info 公共实例代理的目标 ( 实例的proxy = new Proxy(实例的ctx, {...}))
   */
  ctx: Data

  // state
  /**
   * @info data 函数返回的 数据
   */
  data: Data
  /**
   * @info 接受父组件的参数 (setup 第一个参数)
   */
  props: Data
  /**
   * @info 过滤掉 `props 属性` `绑定事件` 后 剩下的 属性绑定
   */
  attrs: Data
  /**
   * @info 插槽绑定
   */
  slots: InternalSlots
  /**
   * @info 当前组件内的全部 模板元素 ref 绑定
   */
  refs: Data
  /**
   * @info 触发 父组件 自定义事件
   */
  emit: EmitFn
  /**
   * used for keeping track of .once event handlers on components
   * @info 用于跟踪组件上的.once事件处理程序
   */
  emitted: Record<string, boolean> | null
  /**
   * used for caching the value returned from props default factory functions to
   * avoid unnecessary watcher trigger
   * @info propsOptions 中配置项 默认值是 函数时 会在第一次执行 然后将返回值 存储在 propsDefaults，以避免不必要的观察者触发
   */
  propsDefaults: Data
  /**
   * setup related
   * @internal
   */
  setupState: Data
  /**
   * devtools access to additional info
   * @internal
   */
  devtoolsRawSetupState?: any
  /**
   * @info 这个就是 setup 第二个参数
   */
  setupContext: SetupContext | null

  /**
   * suspense related
   * @info suspense组件 相关
   */
  suspense: SuspenseBoundary | null
  /**
   * suspense pending batch id
   * @info suspense组件 id
   */
  suspenseId: number
  /**
   * @info 异步 setup的返回值 异步依赖
   */
  asyncDep: Promise<any> | null
  /**
   * @info 异步依赖是否都已处理
   */
  asyncResolved: boolean

  // lifecycle
  /**
   * 是否挂载
   */
  isMounted: boolean
  /**
   * 是否卸载  KeepAlive时无法使用
   */
  isUnmounted: boolean
  /**
   * 是否禁用  KeepAlive时才能使用
   */
  isDeactivated: boolean
  /**
   * @internal 创建前
   */
  [LifecycleHooks.BEFORE_CREATE]: LifecycleHook
  /**
   * @internal 创建后
   */
  [LifecycleHooks.CREATED]: LifecycleHook
  /**
   * @internal 挂载前
   */
  [LifecycleHooks.BEFORE_MOUNT]: LifecycleHook
  /**
   * @internal 挂载后
   */
  [LifecycleHooks.MOUNTED]: LifecycleHook
  /**
   * @internal 更新前
   */
  [LifecycleHooks.BEFORE_UPDATE]: LifecycleHook
  /**
   * @internal 更新后
   */
  [LifecycleHooks.UPDATED]: LifecycleHook
  /**
   * @internal 卸载前
   */
  [LifecycleHooks.BEFORE_UNMOUNT]: LifecycleHook
  /**
   * @internal 卸载后
   */
  [LifecycleHooks.UNMOUNTED]: LifecycleHook
  /**
   * @internal 渲染依赖跟踪
   */
  [LifecycleHooks.RENDER_TRACKED]: LifecycleHook
  /**
   * @internal 更新后 依赖跟踪
   */
  [LifecycleHooks.RENDER_TRIGGERED]: LifecycleHook
  /**
   * @internal 启用后
   */
  [LifecycleHooks.ACTIVATED]: LifecycleHook
  /**
   * @internal 禁用后
   */
  [LifecycleHooks.DEACTIVATED]: LifecycleHook
  /**
   * @internal 错误捕获
   */
  [LifecycleHooks.ERROR_CAPTURED]: LifecycleHook
  /**
   * @internal ssr钩子
   */
  [LifecycleHooks.SERVER_PREFETCH]: LifecycleHook<() => Promise<unknown>>

  /**
   * For caching bound $forceUpdate on public proxy access
   */
  f?: () => void
  /**
   * For caching bound $nextTick on public proxy access
   */
  n?: () => Promise<void>
}

const emptyAppContext = createAppContext()

let uid = 0

/**
 * > 创建组件实例
 * @description 通过 vnode 创建组件实例
 * @param {VNode} vnode 当前组件的 vnode
 * @param {(ComponentInternalInstance | null)} parent 当前组件的 父组件实例
 * @param {(SuspenseBoundary | null)} suspense 似乎都是 null
 * @returns 当前 vnode 对应的 组件实例
 */
export function createComponentInstance(
  vnode: VNode,
  parent: ComponentInternalInstance | null,
  suspense: SuspenseBoundary | null
) {
  const type = vnode.type as ConcreteComponent
  // inherit parent app context - or - if root, adopt from root vnode
  // 继承 全局上下文 (全局配置) 如果没有父级 或者 vnode 没有配置 appContext
  // 默认 emptyAppContext
  const appContext =
    (parent ? parent.appContext : vnode.appContext) || emptyAppContext

  const instance: ComponentInternalInstance = {
    // 组件id (根据创建次数自增)
    uid: uid++,
    // 组件的 vnode
    vnode,
    // 组件的 类型
    type,
    // 组件的 父组件
    parent,
    // 全局配置
    appContext,
    root: null!, // to be immediately set
    next: null,
    subTree: null!, // will be set synchronously right after creation
    effect: null!,
    update: null!, // will be set synchronously right after creation
    scope: new EffectScope(true /* detached */),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    // 继承 父级 parent.provides
    provides: parent ? parent.provides : Object.create(appContext.provides),
    accessCache: null!,
    renderCache: [],

    // local resolved assets
    components: null,
    directives: null,

    // resolved props and emits options
    // 解析 并且 验证 props配置项 emits配置项
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),

    // emit
    emit: null!, // to be set immediately
    emitted: null,

    // props default value
    propsDefaults: EMPTY_OBJ,

    // inheritAttrs
    inheritAttrs: type.inheritAttrs,

    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,

    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,

    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  }
  if (__DEV__) {
    instance.ctx = createDevRenderContext(instance)
  } else {
    // 将实例设置 在 ctx._ 上
    instance.ctx = { _: instance }
  }
  // 设置根目录
  instance.root = parent ? parent.root : instance
  // 设置 emit 事件
  instance.emit = emit.bind(null, instance)

  // apply custom element special handling
  if (vnode.ce) {
    vnode.ce(instance)
  }

  return instance
}

/**
 * 当前实例
 */
export let currentInstance: ComponentInternalInstance | null = null

/**
 * @description 获取 当前 实例 || 当前渲染实例
 */
export const getCurrentInstance: () => ComponentInternalInstance | null = () =>
  currentInstance || currentRenderingInstance

/**
 * @description 设置当前 实例
 * @param instance 组件实例
 */
export const setCurrentInstance = (instance: ComponentInternalInstance) => {
  currentInstance = instance
  instance.scope.on()
}

export const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off()
  currentInstance = null
}

/**
 * @description 判断 组件名称是否 是保留字段
 * @param key 名称
 */
const isBuiltInTag = /*#__PURE__*/ makeMap('slot,component')

/**
 * @description 验证组件名称 是否是保留字段 或者 自定义HTML元素名称
 */
export function validateComponentName(name: string, config: AppConfig) {
  const appIsNativeTag = config.isNativeTag || NO
  if (isBuiltInTag(name) || appIsNativeTag(name)) {
    warn(
      'Do not use built-in or reserved HTML elements as component id: ' + name
    )
  }
}
/**
 * @description 判断组件 是否是 stateful 组件 而不是 函数组件
 */
export function isStatefulComponent(instance: ComponentInternalInstance) {
  return instance.vnode.shapeFlag & ShapeFlags.STATEFUL_COMPONENT
}

/**
 * 是否是 ssr 组件
 */
export let isInSSRComponentSetup = false

/**
 * > 初始化实例数据
 * @description 先初始化 props attrs 的数据 ，再初始化 slots 的数据，然后调用 setupStatefulComponent (这个方法会 初始化 proxy 执行 setup, 这个函数内会调用 配置render的方法)
 * @param {ComponentInternalInstance} instance 组件实例
 * @param {boolean} [isSSR=false] 是否是 ssr
 * @returns 返回 异步 ssr 的处理结果 (非异步ssr的 setup 都不会返回)
 */
export function setupComponent(
  instance: ComponentInternalInstance,
  isSSR = false
) {
  isInSSRComponentSetup = isSSR

  const { props, children } = instance.vnode
  /**
   * 判断组件 是否是 状态组件(正常写法 非函数 组件)
   */
  const isStateful = isStatefulComponent(instance)

  // 根据 父组件传递的props 和 props配置项 初始化 props 状态
  initProps(instance, props, isStateful, isSSR)
  //
  initSlots(instance, children)

  const setupResult = isStateful
    ? setupStatefulComponent(instance, isSSR)
    : undefined
  isInSSRComponentSetup = false
  return setupResult
}

/**
 * > 执行setup
 * @description 生成 代理实例 执行 setup 配置 render
 * @param {ComponentInternalInstance} instance 组件实例
 * @param {boolean} isSSR 是否是 ssr
 * @returns 返回 异步 ssr 的处理结果 (非异步ssr的 setup 都不会返回)
 */
function setupStatefulComponent(
  instance: ComponentInternalInstance,
  isSSR: boolean
) {
  /**
   * 开发人员 提供的 配置项
   */
  const Component = instance.type as ComponentOptions

  if (__DEV__) {
    // 验证 组件名称
    if (Component.name) {
      validateComponentName(Component.name, instance.appContext.config)
    }
    // 验证 当前组件挂载的 子组件 的名称
    if (Component.components) {
      const names = Object.keys(Component.components)
      for (let i = 0; i < names.length; i++) {
        validateComponentName(names[i], instance.appContext.config)
      }
    }

    // 验证 指令 的名称
    if (Component.directives) {
      const names = Object.keys(Component.directives)
      for (let i = 0; i < names.length; i++) {
        validateDirectiveName(names[i])
      }
    }
    if (Component.compilerOptions && isRuntimeOnly()) {
      warn(
        `"compilerOptions" is only supported when using a build of Vue that ` +
          `includes the runtime compiler. Since you are using a runtime-only ` +
          `build, the options should be passed via your build tool config instead.`
      )
    }
  }
  // 0. create render proxy property access cache
  // 创建渲染代理属性访问缓存
  instance.accessCache = Object.create(null)
  // 1. create public instance / render proxy
  // also mark it raw so it's never observed
  // 创建公共实例/渲染代理
  // 这里 ctx 还是 { _: instance } 对象
  // 代理后的 实例 赋值给 instance.proxy
  instance.proxy = markRaw(new Proxy(instance.ctx, PublicInstanceProxyHandlers))
  if (__DEV__) {
    exposePropsOnRenderContext(instance)
  }
  // 2. call setup()
  const { setup } = Component
  if (setup) {
    /**
     * 通过 开发人员 通过的 setup 函数 获取到使用的参数长度
     * 只有一个 参数时 只传入 props
     * 所以当你使用 setup(...array) 最后的参数会是 [props, null]
     * 因为剩余参数不计算长度
     */
    const setupContext = (instance.setupContext =
      setup.length > 1 ? createSetupContext(instance) : null)

    // 设置当前实例 保证 setup 中 `getCurrentInstance` 正确的获取到当前实例
    setCurrentInstance(instance)
    // 关闭依赖收集
    pauseTracking()
    /**
     * 在错误 捕获里面执行 setup，并且获取 setup 的返回值
     */
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      ErrorCodes.SETUP_FUNCTION,
      [__DEV__ ? shallowReadonly(instance.props) : instance.props, setupContext]
    )
    // 恢复依赖收集
    resetTracking()
    unsetCurrentInstance()
    // 判断结果 是否是 异步的 setup
    if (isPromise(setupResult)) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance)
      if (isSSR) {
        // 如果是 ssr
        // return the promise so server-renderer can wait on it
        return setupResult
          .then((resolvedResult: unknown) => {
            handleSetupResult(instance, resolvedResult, isSSR)
          })
          .catch(e => {
            handleError(e, instance, ErrorCodes.SETUP_FUNCTION)
          })
      } else if (__FEATURE_SUSPENSE__) {
        // async setup returned Promise. bail here and wait for re-entry.
        // 否则就是 异步组件
        // 设置异步依赖
        instance.asyncDep = setupResult
        if (__DEV__ && !instance.suspense) {
          const name = Component.name ?? 'Anonymous'
          warn(
            `Component <${name}>: setup function returned a promise, but no ` +
              `<Suspense> boundary was found in the parent component tree. ` +
              `A component with async setup() must be nested in a <Suspense> ` +
              `in order to be rendered.`
          )
        }
      } else if (__DEV__) {
        warn(
          `setup() returned a Promise, but the version of Vue you are using ` +
            `does not support it yet.`
        )
      }
    } else {
      // setup 返回 非 promise
      handleSetupResult(instance, setupResult, isSSR)
    }
  } else {
    // 不存在 setup 时 直接 配置 render
    finishComponentSetup(instance, isSSR)
  }
}

/**
 * > 挂载渲染函数
 * @description 对返回值进行处理 返回值 `函数`就挂载到实例的 render `对象`就进行解包代理后 挂载到setupState
 * @param {ComponentInternalInstance} instance 当前组件实例
 * @param {unknown} setupResult 当前组件实例 setup 的返回值
 * @param {boolean} isSSR 是否是 ssr
 */
export function handleSetupResult(
  instance: ComponentInternalInstance,
  setupResult: unknown,
  isSSR: boolean
) {
  // 如果返回值是 函数 代表是 返回值是渲染函数
  if (isFunction(setupResult)) {
    /**
     * 正常sfc组件的 模板 在模板编译阶段会被处理 并且 在compiler阶段 会自动生成 render 这个配置项 (instance.type.render)
     *
     * 这里 是配置的 组件实例上的 render 在后续`finishComponentSetup`设置 render 时会优先使用现在的
     * 所以 setup 返回的 渲染函数 优先级比 配置项的 render 大
     *
     */
    // setup returned an inline render function
    if (__SSR__ && (instance.type as ComponentOptions).__ssrInlineRender) {
      // when the function's name is `ssrRender` (compiled by SFC inline mode),
      // set it as ssrRender instead.
      // ssr 渲染函数处理
      instance.ssrRender = setupResult
    } else {
      // 渲染函数
      instance.render = setupResult as InternalRenderFunction
    }
  } else if (isObject(setupResult)) {
    if (__DEV__ && isVNode(setupResult)) {
      warn(
        `setup() should not return VNodes directly - ` +
          `return a render function instead.`
      )
    }
    // setup returned bindings.
    // assuming a render function compiled from template is present.
    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      instance.devtoolsRawSetupState = setupResult
    }
    // 如果是对象 设置 setupState 并且进行解包代理
    instance.setupState = proxyRefs(setupResult)
    if (__DEV__) {
      exposeSetupStateOnRenderContext(instance)
    }
  } else if (__DEV__ && setupResult !== undefined) {
    warn(
      `setup() should return an object. Received: ${
        setupResult === null ? 'null' : typeof setupResult
      }`
    )
  }

  // 配置 render
  finishComponentSetup(instance, isSSR)
}

type CompileFunction = (
  template: string | object,
  options?: CompilerOptions
) => InternalRenderFunction

let compile: CompileFunction | undefined
let installWithProxy: (i: ComponentInternalInstance) => void

/**
 * @description 配置 运行时 的编译器
 * For runtime-dom to register the compiler.
 * Note the exported method uses any to avoid d.ts relying on the compiler types.
 * 配置 Runtime 时可以使用 compile (compiler-dom通过)
 * 正常 使用vite 或者 vue-cli 不会有 主动添加 compile 因为插件在解析 .vue 时会将 <template></template> 编译成渲染函数
 * compile 主要是运行在浏览器 的模板编译器 将 组件的 template 配置项解析 成渲染函数
 */
export function registerRuntimeCompiler(_compile: any) {
  compile = _compile
  installWithProxy = i => {
    if (i.render!._rc) {
      i.withProxy = new Proxy(i.ctx, RuntimeCompiledPublicInstanceProxyHandlers)
    }
  }
}

// dev only
export const isRuntimeOnly = () => !compile
/**
 * @description 配置 render 函数 (compile时 会对 字符串模板进行编译生成render)
 * @param {ComponentInternalInstance} instance 组件实例
 * @param {boolean} isSSR 是否是 ssr
 * @param {boolean} [skipOptions] 配置项
 */
export function finishComponentSetup(
  instance: ComponentInternalInstance,
  isSSR: boolean,
  skipOptions?: boolean
) {
  /**
   * 组件配置项
   */
  const Component = instance.type as ComponentOptions

  if (__COMPAT__) {
    convertLegacyRenderFn(instance)

    if (__DEV__ && Component.compatConfig) {
      validateCompatConfig(Component.compatConfig)
    }
  }

  // template / render function normalization
  // could be already set when returned from setup()
  // 如果没有 组件实例上没有 render
  if (!instance.render) {
    // only do on-the-fly compile if not in SSR - SSR on-the-fly compilation
    // is done by server-renderer
    // 如果 compile (模板编译器) 存在 并且开发人员没有配置 render 项 且不是 ssr
    if (!isSSR && compile && !Component.render) {
      const template =
        (__COMPAT__ &&
          instance.vnode.props &&
          instance.vnode.props['inline-template']) ||
        Component.template
      if (template) {
        if (__DEV__) {
          startMeasure(instance, `compile`)
        }
        const { isCustomElement, compilerOptions } = instance.appContext.config
        const { delimiters, compilerOptions: componentCompilerOptions } =
          Component
        const finalCompilerOptions: CompilerOptions = extend(
          extend(
            {
              isCustomElement,
              delimiters
            },
            compilerOptions
          ),
          componentCompilerOptions
        )
        if (__COMPAT__) {
          // pass runtime compat config into the compiler
          finalCompilerOptions.compatConfig = Object.create(globalCompatConfig)
          if (Component.compatConfig) {
            extend(finalCompilerOptions.compatConfig, Component.compatConfig)
          }
        }
        // 通过 compile 将 template 保存render函数
        Component.render = compile(template, finalCompilerOptions)
        if (__DEV__) {
          endMeasure(instance, `compile`)
        }
      }
    }

    // 配置 render 函数 (如果 在处理setup 返回值时 配置过render 这里就不会在配置了)
    instance.render = (Component.render || NOOP) as InternalRenderFunction

    // for runtime-compiled render functions using `with` blocks, the render
    // proxy used needs a different `has` handler which is more performant and
    // also only allows a whitelist of globals to fallthrough.
    if (installWithProxy) {
      // 使用 `with` 渲染时 需要挂载 withProxy (runtime-compiler 才会有这个配置项)
      installWithProxy(instance)
    }
  }

  // support for 2.x options
  if (__FEATURE_OPTIONS_API__ && !(__COMPAT__ && skipOptions)) {
    setCurrentInstance(instance)
    pauseTracking()
    applyOptions(instance)
    resetTracking()
    unsetCurrentInstance()
  }

  // warn missing template/render
  // the runtime compilation of template in SSR is done by server-render
  if (__DEV__ && !Component.render && instance.render === NOOP && !isSSR) {
    /* istanbul ignore if */
    if (!compile && Component.template) {
      warn(
        `Component provided template option but ` +
          `runtime compilation is not supported in this build of Vue.` +
          (__ESM_BUNDLER__
            ? ` Configure your bundler to alias "vue" to "vue/dist/vue.esm-bundler.js".`
            : __ESM_BROWSER__
            ? ` Use "vue.esm-browser.js" instead.`
            : __GLOBAL__
            ? ` Use "vue.global.js" instead.`
            : ``) /* should not happen */
      )
    } else {
      warn(`Component is missing template or render function.`)
    }
  }
}

function createAttrsProxy(instance: ComponentInternalInstance): Data {
  return new Proxy(
    instance.attrs,
    __DEV__
      ? {
          get(target, key: string) {
            markAttrsAccessed()
            track(instance, TrackOpTypes.GET, '$attrs')
            return target[key]
          },
          set() {
            warn(`setupContext.attrs is readonly.`)
            return false
          },
          deleteProperty() {
            warn(`setupContext.attrs is readonly.`)
            return false
          }
        }
      : {
          get(target, key: string) {
            track(instance, TrackOpTypes.GET, '$attrs')
            return target[key]
          }
        }
  )
}

export function createSetupContext(
  instance: ComponentInternalInstance
): SetupContext {
  const expose: SetupContext['expose'] = exposed => {
    if (__DEV__ && instance.exposed) {
      warn(`expose() should be called only once per setup().`)
    }
    instance.exposed = exposed || {}
  }

  let attrs: Data
  if (__DEV__) {
    // We use getters in dev in case libs like test-utils overwrite instance
    // properties (overwrites should not be done in prod)
    return Object.freeze({
      get attrs() {
        return attrs || (attrs = createAttrsProxy(instance))
      },
      get slots() {
        return shallowReadonly(instance.slots)
      },
      get emit() {
        return (event: string, ...args: any[]) => instance.emit(event, ...args)
      },
      expose
    })
  } else {
    return {
      get attrs() {
        return attrs || (attrs = createAttrsProxy(instance))
      },
      slots: instance.slots,
      emit: instance.emit,
      expose
    }
  }
}

export function getExposeProxy(instance: ComponentInternalInstance) {
  if (instance.exposed) {
    return (
      instance.exposeProxy ||
      (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
        get(target, key: string) {
          if (key in target) {
            return target[key]
          } else if (key in publicPropertiesMap) {
            return publicPropertiesMap[key](instance)
          }
        }
      }))
    )
  }
}

const classifyRE = /(?:^|[-_])(\w)/g
const classify = (str: string): string =>
  str.replace(classifyRE, c => c.toUpperCase()).replace(/[-_]/g, '')

export function getComponentName(
  Component: ConcreteComponent,
  includeInferred = true
): string | false | undefined {
  return isFunction(Component)
    ? Component.displayName || Component.name
    : Component.name || (includeInferred && Component.__name)
}

/* istanbul ignore next */
export function formatComponentName(
  instance: ComponentInternalInstance | null,
  Component: ConcreteComponent,
  isRoot = false
): string {
  let name = getComponentName(Component)
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/)
    if (match) {
      name = match[1]
    }
  }

  if (!name && instance && instance.parent) {
    // try to infer the name based on reverse resolution
    const inferFromRegistry = (registry: Record<string, any> | undefined) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key
        }
      }
    }
    name =
      inferFromRegistry(
        instance.components ||
          (instance.parent.type as ComponentOptions).components
      ) || inferFromRegistry(instance.appContext.components)
  }

  return name ? classify(name) : isRoot ? `App` : `Anonymous`
}

/**
 * @description 判断是否是 规范的 class 组件
 */
export function isClassComponent(value: unknown): value is ClassComponent {
  return isFunction(value) && '__vccOpts' in value
}
