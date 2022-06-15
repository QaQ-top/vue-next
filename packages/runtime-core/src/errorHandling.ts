import { VNode } from './vnode'
import { ComponentInternalInstance, LifecycleHooks } from './component'
import { warn, pushWarningContext, popWarningContext } from './warning'
import { isPromise, isFunction } from '@vue/shared'

// contexts where user provided function may be executed, in addition to
// lifecycle hooks.
export const enum ErrorCodes {
  SETUP_FUNCTION,
  RENDER_FUNCTION,
  WATCH_GETTER,
  WATCH_CALLBACK,
  WATCH_CLEANUP,
  NATIVE_EVENT_HANDLER,
  COMPONENT_EVENT_HANDLER,
  VNODE_HOOK,
  DIRECTIVE_HOOK,
  TRANSITION_HOOK,
  APP_ERROR_HANDLER,
  APP_WARN_HANDLER,
  FUNCTION_REF,
  ASYNC_COMPONENT_LOADER,
  SCHEDULER
}

export const ErrorTypeStrings: Record<number | string, string> = {
  [LifecycleHooks.SERVER_PREFETCH]: 'serverPrefetch hook',
  [LifecycleHooks.BEFORE_CREATE]: 'beforeCreate hook',
  [LifecycleHooks.CREATED]: 'created hook',
  [LifecycleHooks.BEFORE_MOUNT]: 'beforeMount hook',
  [LifecycleHooks.MOUNTED]: 'mounted hook',
  [LifecycleHooks.BEFORE_UPDATE]: 'beforeUpdate hook',
  [LifecycleHooks.UPDATED]: 'updated',
  [LifecycleHooks.BEFORE_UNMOUNT]: 'beforeUnmount hook',
  [LifecycleHooks.UNMOUNTED]: 'unmounted hook',
  [LifecycleHooks.ACTIVATED]: 'activated hook',
  [LifecycleHooks.DEACTIVATED]: 'deactivated hook',
  [LifecycleHooks.ERROR_CAPTURED]: 'errorCaptured hook',
  [LifecycleHooks.RENDER_TRACKED]: 'renderTracked hook',
  [LifecycleHooks.RENDER_TRIGGERED]: 'renderTriggered hook',
  [ErrorCodes.SETUP_FUNCTION]: 'setup function',
  [ErrorCodes.RENDER_FUNCTION]: 'render function',
  [ErrorCodes.WATCH_GETTER]: 'watcher getter',
  [ErrorCodes.WATCH_CALLBACK]: 'watcher callback',
  [ErrorCodes.WATCH_CLEANUP]: 'watcher cleanup function',
  [ErrorCodes.NATIVE_EVENT_HANDLER]: 'native event handler',
  [ErrorCodes.COMPONENT_EVENT_HANDLER]: 'component event handler',
  [ErrorCodes.VNODE_HOOK]: 'vnode hook',
  [ErrorCodes.DIRECTIVE_HOOK]: 'directive hook',
  [ErrorCodes.TRANSITION_HOOK]: 'transition hook',
  [ErrorCodes.APP_ERROR_HANDLER]: 'app errorHandler',
  [ErrorCodes.APP_WARN_HANDLER]: 'app warnHandler',
  [ErrorCodes.FUNCTION_REF]: 'ref function',
  [ErrorCodes.ASYNC_COMPONENT_LOADER]: 'async component loader',
  [ErrorCodes.SCHEDULER]:
    'scheduler flush. This is likely a Vue internals bug. ' +
    'Please open an issue at https://new-issue.vuejs.org/?repo=vuejs/core'
}

export type ErrorTypes = LifecycleHooks | ErrorCodes

/**
 * 在 try catch 内调用 外部传入函数
 * 如果 fn 是 Promise 这里是无法捕获的
 */
export function callWithErrorHandling(
  fn: Function,
  instance: ComponentInternalInstance | null,
  type: ErrorTypes,
  args?: unknown[]
) {
  let res
  try {
    res = args ? fn(...args) : fn()
  } catch (err) {
    handleError(err, instance, type)
  }
  return res
}

/**
 * @description 监控到 函数 或者 一组函数 调用时内部错误 为函数添加具有异步错误处理的功能
 * @param {(Function | Function[])} fn 函数 函数组 (会在函数内部调用)
 * @param {(ComponentInternalInstance | null)} instance 函数调用 所在的组件
 * @param {ErrorTypes} type  错误类型
 * @param {unknown[]} [args] 在调用传入 函数 函数组时 将这个参数传入
 * @returns {any[]} 返回监控后的函数 或者 函数组
 */
export function callWithAsyncErrorHandling(
  fn: Function | Function[],
  instance: ComponentInternalInstance | null,
  type: ErrorTypes,
  args?: unknown[]
): any[] {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args)
    if (res && isPromise(res)) {
      // 如果执行的 函数 是 Promise，就在 res.catch 内 捕获错误
      res.catch(err => {
        handleError(err, instance, type)
      })
    }
    return res
  }

  // 函数组的 循环错误监听 处理
  const values = []
  for (let i = 0; i < fn.length; i++) {
    values.push(callWithAsyncErrorHandling(fn[i], instance, type, args))
  }
  return values
}

/**
 * @description 监控到 函数 或者 一组函数 调用时内部错误 为函数添加具有异步错误处理的功能
 * @param {unknown} err 函数 函数组 (会在函数内部调用)
 * @param {(ComponentInternalInstance | null)} instance 函数调用 所在的组件
 * @param {ErrorTypes} type  错误类型
 * @param {boolean} throwInDev
 */
export function handleError(
  err: unknown,
  instance: ComponentInternalInstance | null,
  type: ErrorTypes,
  throwInDev = true
) {
  const contextVNode = instance ? instance.vnode : null
  if (instance) {
    /**
     * 父组件实例
     */
    let cur = instance.parent
    // the exposed instance is the render proxy to keep it consistent with 2.x
    /**
     * 暴露的实例(组件可以通过 this 访问到) 渲染代理
     */
    const exposedInstance = instance.proxy
    // in production the hook receives only the error code
    // 错误信息 生产环境中 只会是 type
    const errorInfo = __DEV__ ? ErrorTypeStrings[type] : type

    // 循环执行父组件实例的钩子函数
    // 再找父组件实例的父 直到为 根组件
    while (cur) {
      const errorCapturedHooks = cur.ec
      // 查看父组件是否有捕获错误的钩子函数 (onErrorCaptured 这个钩子调用时传入的函数 都被储存在 ec 下)
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (
            errorCapturedHooks[i](err, exposedInstance, errorInfo) === false
          ) {
            // 父组件 钩子 内部返回 false 将结束 handleError 错误处理
            return
          }
        }
      }
      cur = cur.parent
    }

    // 如果 cur 为空 且上级实例链上的组件也没有对错误进行捕获
    // app-level handling
    const appErrorHandler = instance.appContext.config.errorHandler
    if (appErrorHandler) {
      // 这里再次在 callWithErrorHandling 内调用错误
      // appContext.config.errorHandler 是开发者添加的也不能避免错误
      callWithErrorHandling(
        appErrorHandler,
        null,
        ErrorCodes.APP_ERROR_HANDLER,
        [err, exposedInstance, errorInfo] // err vm info
      )
      return
    }
  }
  // 如果不是 实例 行为的错误 直接调用 logError
  logError(err, type, contextVNode, throwInDev)
}

function logError(
  err: unknown,
  type: ErrorTypes,
  contextVNode: VNode | null,
  throwInDev = true
) {
  if (__DEV__) {
    const info = ErrorTypeStrings[type]
    if (contextVNode) {
      pushWarningContext(contextVNode)
    }
    warn(`Unhandled error${info ? ` during execution of ${info}` : ``}`)
    if (contextVNode) {
      popWarningContext()
    }
    // crash in dev by default so it's more noticeable
    if (throwInDev) {
      throw err
    } else if (!__TEST__) {
      console.error(err)
    }
  } else {
    // recover in prod to reduce the impact on end-user
    console.error(err)
  }
}
