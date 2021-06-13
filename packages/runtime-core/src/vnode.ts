import {
  isArray,
  isFunction,
  isString,
  isObject,
  EMPTY_ARR,
  extend,
  normalizeClass,
  normalizeStyle,
  PatchFlags,
  ShapeFlags,
  SlotFlags,
  isOn
} from '@vue/shared'
import {
  ComponentInternalInstance,
  Data,
  ConcreteComponent,
  ClassComponent,
  Component,
  isClassComponent
} from './component'
import { RawSlots } from './componentSlots'
import { isProxy, Ref, toRaw, ReactiveFlags, isRef } from '@vue/reactivity'
import { AppContext } from './apiCreateApp'
import {
  SuspenseImpl,
  isSuspense,
  SuspenseBoundary
} from './components/Suspense'
import { DirectiveBinding } from './directives'
import { TransitionHooks } from './components/BaseTransition'
import { warn } from './warning'
import { TeleportImpl, isTeleport } from './components/Teleport'
import {
  currentRenderingInstance,
  currentScopeId
} from './componentRenderContext'
import { RendererNode, RendererElement } from './renderer'
import { NULL_DYNAMIC_COMPONENT } from './helpers/resolveAssets'
import { hmrDirtyComponents } from './hmr'
import { convertLegacyComponent } from './compat/component'
import { convertLegacyVModelProps } from './compat/componentVModel'
import { defineLegacyVNodeProperties } from './compat/renderFn'
import { convertLegacyRefInFor } from './compat/ref'

/**
 * 模板
 */
export const Fragment = (Symbol(__DEV__ ? 'Fragment' : undefined) as any) as {
  __isFragment: true
  new (): {
    $props: VNodeProps
  }
}
/**
 * 文本
 */
export const Text = Symbol(__DEV__ ? 'Text' : undefined)
/**
 * 注释
 */
export const Comment = Symbol(__DEV__ ? 'Comment' : undefined)
/**
 * 静态内容
 */
export const Static = Symbol(__DEV__ ? 'Static' : undefined)

/**
 * @type string(元素节点)
 * @type VNode(虚拟节点)
 * @type Component(组件<配置项>)
 * @type Text(文本节点)
 * @type Conmment(文本注释)
 * @type Static(静态节点)
 * @type Fragment(模板)
 * @type TeleportImpl(Telepor组件)
 * @type SuspenseImpl(Suspense组件)
 */
export type VNodeTypes =
  | string
  | VNode
  | Component
  | typeof Text
  | typeof Static
  | typeof Comment
  | typeof Fragment
  | typeof TeleportImpl
  | typeof SuspenseImpl

/**
 * ref 可以是 Ref string function
 */
export type VNodeRef =
  | string
  | Ref
  | ((ref: object | null, refs: Record<string, any>) => void)

/**
 * 绑定在 vnode 上的 ref值 和 当前vnode 组件所在的实例
 */
export type VNodeNormalizedRefAtom = {
  i: ComponentInternalInstance
  r: VNodeRef
  f?: boolean // v2 compat only, refInFor marker
}

export type VNodeNormalizedRef =
  | VNodeNormalizedRefAtom
  | (VNodeNormalizedRefAtom)[]

type VNodeMountHook = (vnode: VNode) => void
type VNodeUpdateHook = (vnode: VNode, oldVNode: VNode) => void
export type VNodeHook =
  | VNodeMountHook
  | VNodeUpdateHook
  | VNodeMountHook[]
  | VNodeUpdateHook[]

// https://github.com/microsoft/TypeScript/issues/33099
export type VNodeProps = {
  key?: string | number
  ref?: VNodeRef

  // vnode hooks

  /**
   * vnode 挂载前触发
   * @param vnode 当前 模板元素、组件 的 vnode
   */
  onVnodeBeforeMount?: VNodeMountHook | VNodeMountHook[]
  /**
   * vnode 挂载后触发
   * @param vnode 当前 模板元素、组件 的 vnode
   */
  onVnodeMounted?: VNodeMountHook | VNodeMountHook[]

  /**
   * vnode 更新前触发
   * @param vnode 新 vnode
   * @param oldVNode 旧 vnode
   */
  onVnodeBeforeUpdate?: VNodeUpdateHook | VNodeUpdateHook[]
  /**
   * vnode 更新后触发
   * @param vnode 新 vnode
   * @param oldVNode 旧 vnode
   */
  onVnodeUpdated?: VNodeUpdateHook | VNodeUpdateHook[]

  /**
   * vnode 卸载前触发
   * @param vnode 当前 模板元素、组件 的 vnode
   */
  onVnodeBeforeUnmount?: VNodeMountHook | VNodeMountHook[]
  /**
   * vnode 卸载后触发
   * @param vnode 当前 模板元素、组件 的 vnode
   */
  onVnodeUnmounted?: VNodeMountHook | VNodeMountHook[]
}

type VNodeChildAtom =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | void

export type VNodeArrayChildren = Array<VNodeArrayChildren | VNodeChildAtom>

export type VNodeChild = VNodeChildAtom | VNodeArrayChildren

export type VNodeNormalizedChildren =
  | string
  | VNodeArrayChildren
  | RawSlots
  | null

export interface VNode<
  HostNode = RendererNode,
  HostElement = RendererElement,
  ExtraProps = { [key: string]: any }
> {
  /**
   * @internal
   */
  __v_isVNode: true

  /**
   * @internal
   */
  [ReactiveFlags.SKIP]: true

  /**
   * vnode 类型
   * @internal __COMPAT__ only
   */
  isCompatRoot?: true

  type: VNodeTypes
  /**
   * vnode 属性 (模板上定义的 attr)
   */
  props: (VNodeProps & ExtraProps) | null
  /**
   * key 标识 vnode 唯一性
   */
  key: string | number | null
  /**
   * 绑定的 ref 值 和 当前 vnode 所在的组件实例
   */
  ref: VNodeNormalizedRef | null
  /**
   * SFC only. This is assigned on vnode creation using currentScopeId
   * which is set alongside currentRenderingInstance.
   * @ `<style scoped>` 时将拥有 scopeId
   */
  scopeId: string | null
  /**
   * SFC only. This is assigned to:
   * - Slot fragment vnodes with :slotted SFC styles.
   * - Component vnodes (during patch/hydration) so that its root node can
   *   inherit the component's slotScopeIds
   */
  slotScopeIds: string[] | null
  /**
   * 全部 子 vnode 的集合
   */
  children: VNodeNormalizedChildren
  /**
   * 当前组件的 实例
   */
  component: ComponentInternalInstance | null
  dirs: DirectiveBinding[] | null
  transition: TransitionHooks<HostElement> | null

  // DOM
  /**
   * 当前vnode 对应的原生 dom
   */
  el: HostNode | null
  /**
   * 在页面的 锚点 (一般是 el 下一个兄弟节点)
   */
  anchor: HostNode | null // fragment anchor
  /**
   * `teleport` 组件 的目标 元素
   */
  target: HostElement | null // teleport target
  /**
   * `teleport` 的目标 元素 的锚点
   */
  targetAnchor: HostNode | null // teleport target anchor
  /**
   * 静态的 vnode
   */
  staticCount: number // number of elements contained in a static vnode

  // suspense
  /**
   * 异步组件
   */
  suspense: SuspenseBoundary | null
  /**
   * 异步组件的 内容
   */
  ssContent: VNode | null
  /**
   * 目前不知道干什么的
   */
  ssFallback: VNode | null

  // optimization only
  /**
   * vnode 的类型 shared shapeFlag.ts 有分类
   */
  shapeFlag: number
  /**
   * vnode 的补丁类型 shared patchFlag.ts 有分类
   */
  patchFlag: number
  /**
   * vnode 动态 Props
   */
  dynamicProps: string[] | null
  /**
   * vnode 动态 子 vnode (拥有动态变化的数据都是 动态 子节点 children 属于 dynamicChildren 的 父集)
   */
  dynamicChildren: VNode[] | null

  // application root node only
  /**
   * 只有应用程序 根节点 的 vnode 才有 这个属性
   */
  appContext: AppContext | null
}

// Since v-if and v-for are the two possible ways node structure can dynamically
// change, once we consider v-if branches and each v-for fragment a block, we
// can divide a template into nested blocks, and within each block the node
// structure would be stable. This allows us to skip most children diffing
// and only worry about the dynamic nodes (indicated by patch flags).
/**
 * 存储 区块 的栈
 */
export const blockStack: (VNode[] | null)[] = []
/**
 * 当前 区块
 */
export let currentBlock: VNode[] | null = null

/**
 * Open a block.
 * This must be called before `createBlock`. It cannot be part of `createBlock`
 * because the children of the block are evaluated before `createBlock` itself
 * is called. The generated code typically looks like this:
 *
 * ```js
 * function render() {
 *   return (openBlock(),createBlock('div', null, [...]))
 * }
 * ```
 * disableTracking is true when creating a v-for fragment block, since a v-for
 * fragment always diffs its children.
 *
 * @private
 */
/**
 * 在栈中加入 区块 并且让 当前区块 等于 新加入的区块
 * @info 一般在 `createBlock` 前调用
 * @param disableTracking 是否禁用跟踪
 */
export function openBlock(disableTracking = false) {
  blockStack.push((currentBlock = disableTracking ? null : []))
}

/**
 * 出栈一个 区块 并且让 当前区块 等于 最新的栈顶
 */
export function closeBlock() {
  blockStack.pop()
  currentBlock = blockStack[blockStack.length - 1] || null
}

// Whether we should be tracking dynamic child nodes inside a block.
// Only tracks when this value is > 0
// We are not using a simple boolean because this value may need to be
// incremented/decremented by nested usage of v-once (see below)
let isBlockTreeEnabled = 1

/**
 * Block tracking sometimes needs to be disabled, for example during the
 * creation of a tree that needs to be cached by v-once. The compiler generates
 * code like this:
 *
 * ``` js
 * _cache[1] || (
 *   setBlockTracking(-1),
 *   _cache[1] = createVNode(...),
 *   setBlockTracking(1),
 *   _cache[1]
 * )
 * ```
 *
 * @private 设置 区块 跟踪
 */
export function setBlockTracking(value: number) {
  isBlockTreeEnabled += value
}

/**
 * Create a block root vnode. Takes the same exact arguments as `createVNode`.
 * A block root keeps track of dynamic nodes within the block in the
 * `dynamicChildren` array.
 *
 * @info 创建区块根节点 动态区块(v-if, v-for, v-bind:key<key是动态的时候>)
 *
 * 编译前
 * ``` html
 * <template>
 *   <span v-if="status"> fff </span>
 *   <div></div>
 * </template>
 * ```
 * 编译后
 * ``` js
 * (openBlock(), createBlock(Fragment, null, [
 *   (ctx.status) ? (openBlock(), createBlock("span", {key: 0}, 'fff') : createCommentVNode("v-if", true),
 *   createVNode('div', null, []),
 * ]))
 * ```
 * @param type vnode 的类型
 * @param props vnode 的绑定的属性
 * @param children vnode 的子节点
 * @param patchFlag 表示动态数据的类型(动态文本 动态类名 动态属性...)
 * @param dynamicProps 动态属性
 */
export function createBlock(
  type: VNodeTypes | ClassComponent,
  props?: Record<string, any> | null,
  children?: any,
  patchFlag?: number,
  dynamicProps?: string[]
): VNode {
  const vnode = createVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    true /* isBlock: prevent a block from tracking itself */
  )
  /**
   * save current block children on the block vnode
   * 把动态子 设置到 dynamicChildren
   */
  vnode.dynamicChildren =
    isBlockTreeEnabled > 0 ? currentBlock || (EMPTY_ARR as any) : null

  /**
   * close block
   * 结束 当前 区块
   */
  closeBlock()

  // a block is always going to be patched, so track it as a child of its
  // parent block
  /**
   * 如果 是跟踪 并且 当前区块存在 把自己加到该区块
   */
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode)
  }

  return vnode
}

/**
 * 将 模板编译成 渲 vnode染函数 执行循序
 * 测试代码
 * console.log((openBlock(),createBlock("根", {}, [
 *   (openBlock(), createBlock("一", {},
 *     [
 *       createVNode("A", {}),
 *       createVNode("B", {}),
 *       (openBlock(), createBlock("C", {})),
 *     ]
 *   )),
 *   createVNode("二", {}),
 *   createVNode("三", {}),
 *   createVNode("四", {}),
 * ])))
 *
 * 代码执行顺序: openBlock() -> openBlock()  ->  openBlock()
 *
 * 得到的区块: [["根的动态区块"], ["一的动态区块"], ["C的动态区块"]]
 *
 * 再执行: createBlock("C", {}) createBlock("一", {}) createBlock("根")
 *
 * 先是 C.dynamicChildren = ["C"] ->
 *        blockStack.pop() -> ['根', '一']
 *          ["一"].push(C) ->
 *
 *      "一".dynamicChildren = ["一"] ->
 *          blockStack.pop() -> ['根']
 *            ["根"].push("一") ->
 *
 *      "根".dynamicChildren = ["根"] ->
 *          blockStack.pop() -> []
 *
 * 所以”根“的 动态节点 就是 ”一“；然后 ”一“的 动态节点是 ”C“
 */

/**
 * @description 判断是否 是 vnode
 */
export function isVNode(value: any): value is VNode {
  return value ? value.__v_isVNode === true : false
}

/**
 * @description 对比两vdom 类型 与 key 是否一致 (用来判断 vnode 是否更新)
 * @info 开发环境 会更加 热更新 去强制表示 组件不一致
 */
export function isSameVNodeType(n1: VNode, n2: VNode): boolean {
  // 开发环境 并且更新的 vdom 是组件 并且组件在 hmrDirtyComponents 内
  if (
    __DEV__ &&
    n2.shapeFlag & ShapeFlags.COMPONENT &&
    hmrDirtyComponents.has(n2.type as ConcreteComponent)
  ) {
    // HMR only: if the component has been hot-updated, force a reload.
    // 如果该组件已经被热更新，则强制重新加载
    return false
  }
  return n1.type === n2.type && n1.key === n2.key
}

let vnodeArgsTransformer:
  | ((
      args: Parameters<typeof _createVNode>,
      instance: ComponentInternalInstance | null
    ) => Parameters<typeof _createVNode>)
  | undefined

/**
 * Internal API for registering an arguments transform for createVNode
 * used for creating stubs in the test-utils
 * It is *internal* but needs to be exposed for test-utils to pick up proper
 * typings
 */
export function transformVNodeArgs(transformer?: typeof vnodeArgsTransformer) {
  vnodeArgsTransformer = transformer
}

/**
 * 开发环境使用的
 */
const createVNodeWithArgsTransform = (
  ...args: Parameters<typeof _createVNode>
): VNode => {
  return _createVNode(
    ...(vnodeArgsTransformer
      ? vnodeArgsTransformer(args, currentRenderingInstance)
      : args)
  )
}

export const InternalObjectKey = `__vInternal`

/**
 * 复制 key
 * @description 传入一个 vnode 复制传入vnode的key 并且返回
 */
const normalizeKey = ({ key }: VNodeProps): VNode['key'] =>
  key != null ? key : null

/**
 * 复制 ref
 * @description 传入一个 vnode 复制传入vnode的 ref 并且 要保证 ref 的 i 是当前渲染的组件实例
 */
const normalizeRef = ({ ref }: VNodeProps): VNodeNormalizedRefAtom | null => {
  return (ref != null
    ? isString(ref) || isRef(ref) || isFunction(ref)
      ? { i: currentRenderingInstance, r: ref }
      : ref
    : null) as any
}

/**
 * @description 向外暴露的 创建 vnode 的函数 (如果 type 是一个 vnode 时 返回的将是 多type 克隆后的虚拟节点)
 */
export const createVNode = (__DEV__
  ? createVNodeWithArgsTransform
  : _createVNode) as typeof _createVNode

/**
 * @description 内部创建 vnode 的函数
 * @param {(VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT)} type vnode的类型 或者是 vnode (`<component :is="vnode"/>` 情况下会是 vnode)
 * @param {((Data & VNodeProps) | null)} [props=null] 模板上定义的全部属性
 * @param {unknown} [children=null] 子 vnode
 * @param {number} [patchFlag=0] 表明 vnode 哪些是 动态的
 * @param {(string[] | null)} [dynamicProps=null] vnode 上的 动态属性
 * @param {boolean} [isBlockNode=false] 是否是 区块 节点
 * @returns {VNode}
 */
function _createVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null,
  isBlockNode = false
): VNode {
  /**
   * vnode 节点类型为空时
   */
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    if (__DEV__ && !type) {
      warn(`Invalid vnode type when creating vnode: ${type}.`)
    }
    // 将 type 设置为注释
    type = Comment
  }

  /**
   * 判断 type 就是 一个 vnode
   * `<component :is="vnode"/>` 情况下 type 会是 vnode
   */
  if (isVNode(type)) {
    // createVNode receiving an existing vnode. This happens in cases like
    // <component :is="vnode"/>
    // #2078 make sure to merge refs during the clone instead of overwriting it
    // 克隆 当前 vnode
    const cloned = cloneVNode(type, props, true /* mergeRef: true */)
    if (children) {
      // 将子元素 赋值 给 克隆后的 vnode
      normalizeChildren(cloned, children)
    }
    return cloned
  }

  // class component normalization.
  // 如果是 规范的 class 组件
  if (isClassComponent(type)) {
    type = type.__vccOpts
  }

  // 2.x async/functional component compat
  if (__COMPAT__) {
    type = convertLegacyComponent(type, currentRenderingInstance)
  }

  // class & style normalization.
  if (props) {
    // for reactive or proxy objects, we need to clone it to enable mutation.
    // 如果 props 是代理对象 就进行克隆(浅)
    if (isProxy(props) || InternalObjectKey in props) {
      props = extend({}, props)
    }
    let { class: klass, style } = props
    // class 不是字符串时 进行处理(合并成一个字符串)
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass)
    }
    // 如果是对象 就将 style 标准化(字符串不用处理)
    if (isObject(style)) {
      // reactive state objects need to be cloned since they are likely to be
      // mutated
      if (isProxy(style) && !isArray(style)) {
        style = extend({}, style)
      }
      props.style = normalizeStyle(style)
    }
  }

  // encode the vnode type information into a bitmap
  // 保证组件类型正确
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : __FEATURE_SUSPENSE__ && isSuspense(type)
      ? ShapeFlags.SUSPENSE
      : isTeleport(type)
        ? ShapeFlags.TELEPORT
        : isObject(type) // 状态组件
          ? ShapeFlags.STATEFUL_COMPONENT
          : isFunction(type) // 函数组件
            ? ShapeFlags.FUNCTIONAL_COMPONENT
            : 0

  if (__DEV__ && shapeFlag & ShapeFlags.STATEFUL_COMPONENT && isProxy(type)) {
    type = toRaw(type)
    warn(
      `Vue received a Component which was made a reactive object. This can ` +
        `lead to unnecessary performance overhead, and should be avoided by ` +
        `marking the component with \`markRaw\` or using \`shallowRef\` ` +
        `instead of \`ref\`.`,
      `\nComponent that was made reactive: `,
      type
    )
  }

  const vnode: VNode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children: null,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null
  }

  // validate key
  if (__DEV__ && vnode.key !== vnode.key) {
    warn(`VNode created with invalid key (NaN). VNode type:`, vnode.type)
  }

  normalizeChildren(vnode, children)

  // normalize suspense children
  if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
    ;(type as typeof SuspenseImpl).normalize(vnode)
  }

  if (
    isBlockTreeEnabled > 0 &&
    // avoid a block node from tracking itself
    !isBlockNode &&
    // has current parent block
    currentBlock &&
    // presence of a patch flag indicates this node needs patching on updates.
    // component nodes also should always be patched, because even if the
    // component doesn't need to update, it needs to persist the instance on to
    // the next vnode so that it can be properly unmounted later.
    (patchFlag > 0 || shapeFlag & ShapeFlags.COMPONENT) &&
    // the EVENTS flag is only for hydration and if it is the only flag, the
    // vnode should not be considered dynamic due to handler caching.
    patchFlag !== PatchFlags.HYDRATE_EVENTS
  ) {
    currentBlock.push(vnode)
  }

  if (__COMPAT__) {
    convertLegacyVModelProps(vnode)
    convertLegacyRefInFor(vnode)
    defineLegacyVNodeProperties(vnode)
  }

  return vnode
}

/**
 * 克隆一个 vnode
 * @param vnode 被克隆的 vnode
 * @param extraProps 额外的 模板属性 (因为被克隆vnode 会有自己的 props 这里要合并)
 * @param mergeRef 是否合并 ref
 */
export function cloneVNode<T, U>(
  vnode: VNode<T, U>,
  extraProps?: Data & VNodeProps | null,
  mergeRef = false
): VNode<T, U> {
  // This is intentionally NOT using spread or extend to avoid the runtime
  // key enumeration cost.
  const { props, ref, patchFlag, children } = vnode
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props
  /**
   * 克隆 vnode
   */
  const cloned: VNode = {
    __v_isVNode: true,
    __v_skip: true,
    // 克隆 vnode 类型
    type: vnode.type,
    // 克隆 vnode props 并且 经过合并处理 后的props
    props: mergedProps,
    // 克隆 vnode key
    key: mergedProps && normalizeKey(mergedProps),
    // 对 额外props 中的 ref 处理后 并且合并
    ref:
      extraProps && extraProps.ref
        ? // #2078 in the case of <component :is="vnode" ref="extra"/>
          // if the vnode itself already has a ref, cloneVNode will need to merge
          // the refs so the single vnode can be set on multiple refs
          mergeRef && ref
          ? isArray(ref)
            ? ref.concat(normalizeRef(extraProps)!)
            : [ref, normalizeRef(extraProps)!]
          : normalizeRef(extraProps)
        : ref,
    // 克隆 vnode 的 scopeId
    scopeId: vnode.scopeId,
    // 克隆 vnode 的 slotScopeIds
    slotScopeIds: vnode.slotScopeIds,
    // 克隆 vnode 的 children
    children:
      __DEV__ && patchFlag === PatchFlags.HOISTED && isArray(children)
        ? (children as VNode[]).map(deepCloneVNode)
        : children,
    target: vnode.target,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: perserve flag for fragments since they use the flag for children
    // fast paths only.

    // 判断是否 使用了 extraProps(额外 props) 并且不是 Fragment
    // 这个时候就要 兼容 克隆的 patchFlag 添加 PatchFlags.FULL_PROPS 类型
    patchFlag:
      extraProps && vnode.type !== Fragment
        ? patchFlag === -1 // hoisted node
          ? PatchFlags.FULL_PROPS
          : patchFlag | PatchFlags.FULL_PROPS
        : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition: vnode.transition,

    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    // 这个地方要 深度克隆
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    el: vnode.el,
    anchor: vnode.anchor
  }
  if (__COMPAT__) {
    defineLegacyVNodeProperties(cloned)
  }
  // 返回克隆后的 vnode
  return cloned as any
}

/**
 * Dev only, for HMR of hoisted vnodes reused in v-for
 * https://github.com/vitejs/vite/issues/2022
 *
 * @description 深度克隆 vnode
 */
function deepCloneVNode(vnode: VNode): VNode {
  const cloned = cloneVNode(vnode)
  if (isArray(vnode.children)) {
    cloned.children = (vnode.children as VNode[]).map(deepCloneVNode)
  }
  return cloned
}

/**
 * @description 提供 字符串 创建 文本 vnode
 * @param flag 动态类型标识 (patchFlag)
 */
export function createTextVNode(text: string = ' ', flag: number = 0): VNode {
  return createVNode(Text, null, text, flag)
}

/**
 * @description 创建静态 文本 vnode
 * @param numberOfNodes 静态节点数量
 */
export function createStaticVNode(
  content: string,
  numberOfNodes: number
): VNode {
  // A static vnode can contain multiple stringified elements, and the number
  // of elements is necessary for hydration.
  const vnode = createVNode(Static, null, content)
  vnode.staticCount = numberOfNodes
  return vnode
}

/**
 * @description 注释类型 vnode
 * @param asBlock 是否是动态变化的 (是否创建 区块)
 */
export function createCommentVNode(
  text: string = '',
  // when used as the v-else branch, the comment node must be created as a
  // block to ensure correct updates.
  asBlock: boolean = false
): VNode {
  return asBlock
    ? (openBlock(), createBlock(Comment, null, text))
    : createVNode(Comment, null, text)
}

/**
 * @description 标准化处理 子vnode
 *
 */
export function normalizeVNode(child: VNodeChild): VNode {
  // 子为空 处理成 注释 再返回
  if (child == null || typeof child === 'boolean') {
    // empty placeholder
    return createVNode(Comment)

    // 子是数组 就包裹一层 Fragment 再返回
  } else if (isArray(child)) {
    // fragment
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    )

    // 子是对象 存在el 就对子克隆后返回 没有el 就直接返回
  } else if (typeof child === 'object') {
    // already vnode, this should be the most common since compiled templates
    // always produce all-vnode children arrays
    return cloneIfMounted(child)

    // 其他情况处理成 文本 再返回
  } else {
    // strings and numbers
    return createVNode(Text, null, String(child))
  }
}

// optimized normalization for template-compiled render fns
/**
 * @description 为模板编译的渲染文件进行优化的规范化处理
 */
export function cloneIfMounted(child: VNode): VNode {
  return child.el === null ? child : cloneVNode(child)
}

/**
 * @description 标准化处理 children 和 shapeFlag 将其 设置再 目标vnode身上
 * @param vnode 目标 vnode
 * @param children 子 vnode
 */
export function normalizeChildren(vnode: VNode, children: unknown) {
  let type = 0
  const { shapeFlag } = vnode
  if (children == null) {
    children = null

    // children 是数组
  } else if (isArray(children)) {
    type = ShapeFlags.ARRAY_CHILDREN

    // children 是对象 (似乎只有 slot 的情况下 children才会是对象)
  } else if (typeof children === 'object') {
    if (shapeFlag & ShapeFlags.ELEMENT || shapeFlag & ShapeFlags.TELEPORT) {
      // 如果 vnode 是 dom 或者 Teleport组件
      const slot = (children as any).default

      // 如果存在默认插槽 就将 插槽里面的 vnode 添加到 当前vnode
      if (slot) {
        // _c marker is added by withCtx() indicating this is a compiled slot
        // withCtx()添加了_c标记，表明这是一个已编译的槽
        slot._c && (slot._d = false)
        normalizeChildren(vnode, slot())
        slot._c && (slot._d = true)
      }
      return
    } else {
      // 处理插槽
      type = ShapeFlags.SLOTS_CHILDREN
      const slotFlag = (children as RawSlots)._

      if (!slotFlag && !(InternalObjectKey in children!)) {
        // 标准化插槽
        // if slots are not normalized, attach context instance
        // (compiled / normalized slots already have context)
        ;(children as RawSlots)._ctx = currentRenderingInstance
      } else if (slotFlag === SlotFlags.FORWARDED && currentRenderingInstance) {
        // a child component receives forwarded slots from the parent.
        // its slot type is determined by its parent's slot type.
        // 子组件从父组件接收转发的槽，其槽的类型由其父组件的槽类型决定
        if (
          (currentRenderingInstance.slots as RawSlots)._ === SlotFlags.STABLE
        ) {
          ;(children as RawSlots)._ = SlotFlags.STABLE
        } else {
          ;(children as RawSlots)._ = SlotFlags.DYNAMIC
          vnode.patchFlag |= PatchFlags.DYNAMIC_SLOTS
        }
      }
    }
    // children 是函数
  } else if (isFunction(children)) {
    // 将函数 变成 默认插槽 并且加上 当前实例
    children = { default: children, _ctx: currentRenderingInstance }
    type = ShapeFlags.SLOTS_CHILDREN
  } else {
    // 如果 是 其它 基础类型的数据 就转为 字符串
    children = String(children)
    // force teleport children to array so it can be moved around
    // 如果 vnode 是 Teleport 就把 子 转成 数组 TextVNode
    if (shapeFlag & ShapeFlags.TELEPORT) {
      type = ShapeFlags.ARRAY_CHILDREN
      children = [createTextVNode(children as string)]
    } else {
      type = ShapeFlags.TEXT_CHILDREN
    }
  }
  // 最后赋值 给 vnode
  vnode.children = children as VNodeNormalizedChildren
  vnode.shapeFlag |= type
}

/**
 * 合并 多个 Props
 * @param args 第一个是 被克隆vnode 的 props 剩余的全是 额外添加 props
 */
export function mergeProps(...args: (Data & VNodeProps)[]) {
  /**
   * 第一个是 最终返回 props
   * 剩余的props将合并 到 第一个props
   */
  const ret = extend({}, args[0])
  for (let i = 1; i < args.length; i++) {
    const toMerge = args[i]
    for (const key in toMerge) {
      // 处理 class (后者会覆盖 前者)
      if (key === 'class') {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class])
        }

        // 处理 style (后者会覆盖 前者)
      } else if (key === 'style') {
        ret.style = normalizeStyle([ret.style, toMerge.style])

        // 处理 事件 (事件是合并 成数组)
      } else if (isOn(key)) {
        /**
         * props key的 事件函数
         */
        const existing = ret[key]
        /**
         * 额外的props key的 事件函数
         */
        const incoming = toMerge[key]

        // 两个事件函数不相同时
        if (existing !== incoming) {
          // 如果 props 本来就有一个 与 额外的props 相同的事件 并且绑定的有函数
          // 那么就 将额外props上这个事件的函数 和 props上这个事件上的函数 合并 并且 赋值给 props 上的这个事件
          ret[key] = existing
            ? [].concat(existing as any, incoming as any)
            : incoming
        }

        // 其他属性直接 覆盖
      } else if (key !== '') {
        ret[key] = toMerge[key]
      }
    }
  }
  // 返回 props
  return ret
}
