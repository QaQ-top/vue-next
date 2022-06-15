/**
Runtime helper for applying directives to a vnode. Example usage:

const comp = resolveComponent('comp')
const foo = resolveDirective('foo')
const bar = resolveDirective('bar')

return withDirectives(h(comp), [
  [foo, this.x],
  [bar, this.y]
])
*/

import { VNode } from './vnode'
import { isFunction, EMPTY_OBJ, isBuiltInDirective } from '@vue/shared'
import { warn } from './warning'
import { ComponentInternalInstance, Data, getExposeProxy } from './component'
import { currentRenderingInstance } from './componentRenderContext'
import { callWithAsyncErrorHandling, ErrorCodes } from './errorHandling'
import { ComponentPublicInstance } from './componentPublicInstance'
import { mapCompatDirectiveHook } from './compat/customDirective'
import { pauseTracking, resetTracking } from '@vue/reactivity'
import { traverse } from './apiWatch'

export interface DirectiveBinding<V = any> {
  instance: ComponentPublicInstance | null
  value: V
  oldValue: V | null
  arg?: string
  modifiers: DirectiveModifiers
  dir: ObjectDirective<any, V>
}

export type DirectiveHook<T = any, Prev = VNode<any, T> | null, V = any> = (
  el: T,
  binding: DirectiveBinding<V>,
  vnode: VNode<any, T>,
  prevVNode: Prev
) => void

export type SSRDirectiveHook = (
  binding: DirectiveBinding,
  vnode: VNode
) => Data | undefined

export interface ObjectDirective<T = any, V = any> {
  created?: DirectiveHook<T, null, V>
  beforeMount?: DirectiveHook<T, null, V>
  mounted?: DirectiveHook<T, null, V>
  beforeUpdate?: DirectiveHook<T, VNode<any, T>, V>
  updated?: DirectiveHook<T, VNode<any, T>, V>
  beforeUnmount?: DirectiveHook<T, null, V>
  unmounted?: DirectiveHook<T, null, V>
  getSSRProps?: SSRDirectiveHook
  deep?: boolean
}

export type FunctionDirective<T = any, V = any> = DirectiveHook<T, any, V>

export type Directive<T = any, V = any> =
  | ObjectDirective<T, V>
  | FunctionDirective<T, V>

export type DirectiveModifiers = Record<string, boolean>

/**
 * @description 验证 自定义 指令名称 是否 是保留名称
 * @param {string} name 指令名称
 */
export function validateDirectiveName(name: string) {
  if (isBuiltInDirective(name)) {
    warn('Do not use built-in directive ids as custom directive id: ' + name)
  }
}

// Directive, value, argument, modifiers
export type DirectiveArguments = Array<
  | [Directive]
  | [Directive, any]
  | [Directive, any, string]
  | [Directive, any, string, DirectiveModifiers]
>

/**
 * Adds directives to a VNode.
 */
export function withDirectives<T extends VNode>(
  vnode: T,
  directives: DirectiveArguments
): T {
  const internalInstance = currentRenderingInstance
  if (internalInstance === null) {
    __DEV__ && warn(`withDirectives can only be used inside render functions.`)
    return vnode
  }
  const instance =
    (getExposeProxy(internalInstance) as ComponentPublicInstance) ||
    internalInstance.proxy
  const bindings: DirectiveBinding[] = vnode.dirs || (vnode.dirs = [])
  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i]
    if (isFunction(dir)) {
      dir = {
        mounted: dir,
        updated: dir
      } as ObjectDirective
    }
    if (dir.deep) {
      traverse(value)
    }
    bindings.push({
      dir,
      instance,
      value,
      oldValue: void 0,
      arg,
      modifiers
    })
  }
  return vnode
}

/**
 * @description 触发治理钩子函数
 * @param vnode 虚拟节点
 * @param prevVNode 上一次的 vnode
 * @param instance 当前指令所在的实例
 * @param name 触发事件名称
 */
export function invokeDirectiveHook(
  vnode: VNode,
  prevVNode: VNode | null,
  instance: ComponentInternalInstance | null,
  name: keyof ObjectDirective
) {
  const bindings = vnode.dirs!
  const oldBindings = prevVNode && prevVNode.dirs!
  // 循环执行 全部 绑定指令的 钩子
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i]
    if (oldBindings) {
      // 将 上一次指令的 value 保存在新指令的 oldValue 上
      binding.oldValue = oldBindings[i].value
    }
    // 获取要执行的钩子
    let hook = binding.dir[name] as DirectiveHook | DirectiveHook[] | undefined
    if (__COMPAT__ && !hook) {
      hook = mapCompatDirectiveHook(name, binding.dir, instance)
    }
    if (hook) {
      // disable tracking inside all lifecycle hooks
      // since they can potentially be called inside effects.
      pauseTracking()
      // 错误处理 触发链式错误捕获
      callWithAsyncErrorHandling(hook, instance, ErrorCodes.DIRECTIVE_HOOK, [
        vnode.el,
        binding,
        vnode,
        prevVNode
      ])
      resetTracking()
    }
  }
}
