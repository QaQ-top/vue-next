import { hyphenate, isArray } from '@vue/shared'
import {
  ComponentInternalInstance,
  callWithAsyncErrorHandling
} from '@vue/runtime-core'
import { ErrorCodes } from 'packages/runtime-core/src/errorHandling'

interface Invoker extends EventListener {
  value: EventValue
  attached: number
}

type EventValue = Function | Function[]

// Async edge case fix requires storing an event listener's attach timestamp.
/**
 * 获取时间戳
 * 存储事件监听器的附加时间戳
 */
let _getNow: () => number = Date.now

/**
 * 是否跳过时间戳检查
 */
let skipTimestampCheck = false

/**
 * 这里判断 是使用高精度 时间戳(performance.now() 微秒级) 还是 Date.now (毫秒级别)
 */
if (typeof window !== 'undefined') {
  // Determine what event timestamp the browser is using. Annoyingly, the
  // timestamp can either be hi-res (relative to page load) or low-res
  // (relative to UNIX epoch), so in order to compare time we have to use the
  // same timestamp type when saving the flush timestamp.
  if (_getNow() > document.createEvent('Event').timeStamp) {
    // if the low-res timestamp which is bigger than the event timestamp
    // (which is evaluated AFTER) it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listeners as well.
    _getNow = () => performance.now()
  }
  // #3485: Firefox <= 53 has incorrect Event.timeStamp implementation
  // and does not fire microtasks in between event propagation, so safe to exclude.
  // 获取浏览器 版本 版本号
  const ffMatch = navigator.userAgent.match(/firefox\/(\d+)/i)
  // 火狐版本小于 53 跳过 时间戳检测
  skipTimestampCheck = !!(ffMatch && Number(ffMatch[1]) <= 53)
}

// To avoid the overhead of repeatedly calling performance.now(), we cache
// and use the same timestamp for all event listeners attached in the same tick.
let cachedNow: number = 0
const p = Promise.resolve()

/**
 * 清空时间戳
 */
const reset = () => {
  cachedNow = 0
}
/**
 * 获取缓存时间戳
 * 避免 _getNow 每次调用 performance.now() 影响的开销
 * 进入 微任务 时 清空 cachedNow
 */
const getNow = () => cachedNow || (p.then(reset), (cachedNow = _getNow()))

/**
 * 添加 dom 事件
 */
export function addEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: EventListenerOptions
) {
  el.addEventListener(event, handler, options)
}

/**
 * 移除 dom 事件
 */
export function removeEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: EventListenerOptions
) {
  el.removeEventListener(event, handler, options)
}

/**
 * @description 处理 模板语法中 元素绑定的 事件
 * @param {(Element & { _vei?: Record<string, Invoker | undefined> })} el 元素节点
 * @param {string} rawName 事件名称
 * @param {(EventValue | null)} prevValue 上一次绑定的值
 * @param {(EventValue | null)} nextValue 当前要绑定的值
 * @param {(ComponentInternalInstance | null)} [instance=null] 元素节点 所在的组件实例
 */
export function patchEvent(
  el: Element & { _vei?: Record<string, Invoker | undefined> },
  rawName: string,
  prevValue: EventValue | null,
  nextValue: EventValue | null,
  instance: ComponentInternalInstance | null = null
) {
  // vei = vue event invokers
  /**
   * vue 事件调用器对象
   */
  const invokers = el._vei || (el._vei = {})
  /**
   * 调用器
   */
  const existingInvoker = invokers[rawName]
  if (nextValue && existingInvoker) {
    // patch
    // 如果 rawName 表示 的调用器存在
    // 直接 更新 该调用器
    existingInvoker.value = nextValue
  } else {
    // 到的 事件名称 和 配置项
    const [name, options] = parseName(rawName)
    // 根据更新 值 是否存在 判断是添加事件 还是删除事件
    if (nextValue) {
      // add
      const invoker = (invokers[rawName] = createInvoker(nextValue, instance))
      addEventListener(el, name, invoker, options)
    } else if (existingInvoker) {
      // remove
      removeEventListener(el, name, existingInvoker, options)
      invokers[rawName] = undefined
    }
  }
}

/**
 * 处理 事件名称 正则
 */
const optionsModifierRE = /(?:Once|Passive|Capture)$/

/**
 * @description 处理事件名称 生成配置项
 * @inof 处理对应事件修饰符 .once | .passive | .capture
 * @inof 其它修饰符会在 模板编译时 换成对应的事件 click.right -> contextmenu
 * @returns [事件名称, { once: true, ... }] 支持链式修饰符
 */
function parseName(name: string): [string, EventListenerOptions | undefined] {
  let options: EventListenerOptions | undefined
  if (optionsModifierRE.test(name)) {
    /**
     * 用于 事件监听 的第三个参数
     */
    options = {}
    let m
    // 循环获取尾部修饰符标识 添加 options 配置项
    // 更新 name 为截取掉尾部 的 剩余字符串
    // 将截取的修饰符转小写 设置为 options 的 key 值为 true
    // 循环再次 截取尾部 直到没有 尾部标识
    while ((m = name.match(optionsModifierRE))) {
      name = name.slice(0, name.length - m[0].length)
      ;(options as any)[m[0].toLowerCase()] = true
      options
    }
  }
  // 解析出 on 后面跟的事件
  return [hyphenate(name.slice(2)), options]
}

/**
 * @description 创建调用器
 *
 */
function createInvoker(
  initialValue: EventValue,
  instance: ComponentInternalInstance | null
) {
  const invoker: Invoker = (e: Event) => {
    // async edge case #6566: inner click event triggers patch, event handler
    // attached to outer element during patch, and triggered again. This
    // happens because browsers fire microtask ticks between event propagation.
    // the solution is simple: we save the timestamp when a handler is attached,
    // and the handler would only fire if the event passed to it was fired
    // AFTER it was attached.
    /**
     * 当前事件触发的时间戳
     */
    const timeStamp = e.timeStamp || _getNow()
    /**
     * 触发时的时间戳 对比 事件初次添加时的时间戳
     */
    if (skipTimestampCheck || timeStamp >= invoker.attached - 1) {
      // 事件对象内部 发生错误 将被传递 到 app.config.errorHandler
      callWithAsyncErrorHandling(
        patchStopImmediatePropagation(e, invoker.value),
        instance,
        ErrorCodes.NATIVE_EVENT_HANDLER, // 错误类型 5 : native event handler
        [e]
      )
    }
  }
  invoker.value = initialValue
  invoker.attached = getNow()

  return invoker
}

/**
 * 处理 模板一个事件绑定多事件函数时，模拟 stopImmediatePropagation
 */
function patchStopImmediatePropagation(
  e: Event,
  value: EventValue
): EventValue {
  // value 是 vue模板绑定的值，可能是一组事件函数
  if (isArray(value)) {
    const originalStop = e.stopImmediatePropagation
    // 重新写 stopImmediatePropagation
    // 调用后 在当前 事件对象上 添加 _stopped = true
    e.stopImmediatePropagation = () => {
      originalStop.call(e)
      ;(e as any)._stopped = true
    }
    // 返回 处理后的 事件函数
    // 如果数组前的某个事件函数 触发了 e.stopImmediatePropagation()
    // e._stopped 将为真，_stopped为真 数组后续的事件函数 将 不会调用 绑定的函数
    return value.map(fn => (e: Event) => !(e as any)._stopped && fn(e))
  } else {
    // 返回
    return value
  }
}
