import { patchClass } from './modules/class'
import { patchStyle } from './modules/style'
import { patchAttr } from './modules/attrs'
import { patchDOMProp } from './modules/props'
import { patchEvent } from './modules/events'
import { isOn, isString, isFunction, isModelListener } from '@vue/shared'
import { RendererOptions } from '@vue/runtime-core'

const nativeOnRE = /^on[a-z]/

type DOMRendererOptions = RendererOptions<Node, Element>

/**
 * @description 用来将 模板语法的 attrs 处理成 Html 真正的 Attribute(属性)
 * @param {*} el 元素
 * @param {*} key 属性
 * @param {*} prevValue 当前属性上一次绑定的值
 * @param {*} nextValue 当前属性最新值
 * @param {boolean} [isSVG=false] 是否是 svg 元素
 * @param {*} prevChildren 当前元素的 子元素(vdom数组)
 * @param {*} parentComponent el元素 所在的 vue 组件实例
 * @param {*} parentSuspense
 * @param {*} unmountChildren 卸载组件 主要用来处理元素 key为 innerHTM textContent 时对组件进行卸载
 */
export const patchProp: DOMRendererOptions['patchProp'] = (
  el,
  key,
  prevValue,
  nextValue,
  isSVG = false,
  prevChildren,
  parentComponent,
  parentSuspense,
  unmountChildren
) => {
  if (key === 'class') {
    patchClass(el, nextValue, isSVG)
  } else if (key === 'style') {
    // 样式兼容处理
    patchStyle(el, prevValue, nextValue)
  } else if (isOn(key)) {
    // ignore v-model listeners
    if (!isModelListener(key)) {
      // 处理 vue 绑定事件
      patchEvent(el, key, prevValue, nextValue, parentComponent)
    }
  } else if (
    key[0] === '.'
      ? ((key = key.slice(1)), true)
      : key[0] === '^'
      ? ((key = key.slice(1)), false)
      : shouldSetAsProp(el, key, nextValue, isSVG)
  ) {
    // 判断 属性key 在 el元素 上的正确性
    // 处理 dom 属性
    patchDOMProp(
      el,
      key,
      nextValue,
      prevChildren,
      parentComponent,
      parentSuspense,
      unmountChildren
    )
  } else {
    // special case for <input v-model type="checkbox"> with
    // :true-value & :false-value
    // store value as dom properties since non-string values will be
    // stringified.
    // 当 type="checkbox" 时处理 v-bind 的 防止 value 字符串化
    if (key === 'true-value') {
      ;(el as any)._trueValue = nextValue
    } else if (key === 'false-value') {
      ;(el as any)._falseValue = nextValue
    }
    patchAttr(el, key, nextValue, isSVG, parentComponent)
  }
}

/**
 * @description 判断是否是 dom 属性自身可访问属性 (内部有对特殊标签属性 进行过滤)
 * @param {Element} el 元素节点
 * @param {string} key 属性名称
 * @param {unknown} value 属性值
 * @param {boolean} isSVG 是否是svg
 * @returns
 */
function shouldSetAsProp(
  el: Element,
  key: string,
  value: unknown,
  isSVG: boolean
) {
  if (isSVG) {
    // Svg 不需要特殊 过滤
    // most keys must be set as attribute on svg elements to work
    // ...except innerHTML & textContent
    if (key === 'innerHTML' || key === 'textContent') {
      return true
    }
    // or native onclick with function values
    // 原生浏览器事件处理
    if (key in el && nativeOnRE.test(key) && isFunction(value)) {
      return true
    }
    return false
  }

  // these are enumerated attrs, however their corresponding DOM properties
  // are actually booleans - this leads to setting it with a string "false"
  // value leading it to be coerced to `true`, so we need to always treat
  // them as attributes.
  // Note that `contentEditable` doesn't have this problem: its DOM
  // property is also enumerated string values.
  if (key === 'spellcheck' || key === 'draggable' || key === 'translate') {
    return false
  }

  // #1787, #2840 form property on form elements is readonly and must be set as
  // attribute.
  if (key === 'form') {
    return false
  }

  // #1526 <input list> must be set as attribute
  if (key === 'list' && el.tagName === 'INPUT') {
    return false
  }

  // #2766 <textarea type> must be set as attribute
  if (key === 'type' && el.tagName === 'TEXTAREA') {
    return false
  }

  // 事件绑定的是 字符串 不通过处理
  // native onclick with string value, must be set as attribute
  if (nativeOnRE.test(key) && isString(value)) {
    return false
  }
  // 判断 原生 dom 是否 有该属性(props)
  return key in el
}
