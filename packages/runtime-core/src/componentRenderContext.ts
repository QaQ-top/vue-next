import { ComponentInternalInstance } from './component'
import { devtoolsComponentUpdated } from './devtools'
import { setBlockTracking } from './vnode'

/**
 * mark the current rendering instance for asset resolution (e.g.
 * resolveComponent, resolveDirective) during render
 */
/**
 * 当前渲染的组件实例
 */
export let currentRenderingInstance: ComponentInternalInstance | null = null
/**
 * 当前组件的命名空间
 */
export let currentScopeId: string | null = null

/**
 * Note: rendering calls maybe nested. The function returns the parent rendering
 * instance if present, which should be restored after the render is done:
 *
 * ```js
 * const prev = setCurrentRenderingInstance(i)
 * // ...render
 * setCurrentRenderingInstance(prev)
 * ```
 * @description 设置当前渲染实例 当前空间名命 然后把上一次渲染实例返回
 */
export function setCurrentRenderingInstance(
  instance: ComponentInternalInstance | null
): ComponentInternalInstance | null {
  const prev = currentRenderingInstance
  currentRenderingInstance = instance
  currentScopeId = (instance && instance.type.__scopeId) || null
  // v2 pre-compiled components uses _scopeId instead of __scopeId
  if (__COMPAT__ && !currentScopeId) {
    currentScopeId = (instance && (instance.type as any)._scopeId) || null
  }
  return prev
}

/**
 * Set scope id when creating hoisted vnodes.
 * @private compiler helper
 */
export function pushScopeId(id: string | null) {
  currentScopeId = id
}

/**
 * Technically we no longer need this after 3.0.8 but we need to keep the same
 * API for backwards compat w/ code generated by compilers.
 * @private
 */
export function popScopeId() {
  currentScopeId = null
}

/**
 * Only for backwards compat
 * @private
 */
export const withScopeId = (_id: string) => withCtx

export type ContextualRenderFn = {
  (...args: any[]): any
  _n: boolean /* already normalized */
  _c: boolean /* compiled */
  _d: boolean /* disableTracking */
  _ns: boolean /* nonScoped */
}

/**
 * Wrap a slot function to memoize current rendering instance
 * @private compiler helper
 */
export function withCtx(
  fn: Function,
  ctx: ComponentInternalInstance | null = currentRenderingInstance,
  isNonScopedSlot?: boolean // __COMPAT__ only
) {
  if (!ctx) return fn

  // already normalized
  if ((fn as ContextualRenderFn)._n) {
    return fn
  }

  const renderFnWithContext: ContextualRenderFn = (...args: any[]) => {
    // If a user calls a compiled slot inside a template expression (#1745), it
    // can mess up block tracking, so by default we disable block tracking and
    // force bail out when invoking a compiled slot (indicated by the ._d flag).
    // This isn't necessary if rendering a compiled `<slot>`, so we flip the
    // ._d flag off when invoking the wrapped fn inside `renderSlot`.
    if (renderFnWithContext._d) {
      setBlockTracking(-1)
    }
    const prevInstance = setCurrentRenderingInstance(ctx)
    const res = fn(...args)
    setCurrentRenderingInstance(prevInstance)
    if (renderFnWithContext._d) {
      setBlockTracking(1)
    }

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      devtoolsComponentUpdated(ctx)
    }

    return res
  }

  // mark normalized to avoid duplicated wrapping
  renderFnWithContext._n = true
  // mark this as compiled by default
  // this is used in vnode.ts -> normalizeChildren() to set the slot
  // rendering flag.
  renderFnWithContext._c = true
  // disable block tracking by default
  renderFnWithContext._d = true
  // compat build only flag to distinguish scoped slots from non-scoped ones
  if (__COMPAT__ && isNonScopedSlot) {
    renderFnWithContext._ns = true
  }
  return renderFnWithContext
}
