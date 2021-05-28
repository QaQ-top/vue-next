import { isSpecialBooleanAttr, makeMap, NOOP } from '@vue/shared'
import {
  compatUtils,
  ComponentInternalInstance,
  DeprecationTypes
} from '@vue/runtime-core'

export const xlinkNS = 'http://www.w3.org/1999/xlink'

/**
 * @description 处理自身无法访问的 属性， 和 自定义 属性
 * @param {Element} el
 * @param {string} key
 * @param {*} value
 * @param {boolean} isSVG
 * @param {(ComponentInternalInstance | null)} [instance]
 */
export function patchAttr(
  el: Element,
  key: string,
  value: any,
  isSVG: boolean,
  instance?: ComponentInternalInstance | null
) {
  // 处理 Svg 属性
  if (isSVG && key.startsWith('xlink:')) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length))
    } else {
      el.setAttributeNS(xlinkNS, key, value)
    }
  } else {
    // 兼容 2.x 属性处理
    if (__COMPAT__ && compatCoerceAttr(el, key, value, instance)) {
      return
    }

    // note we are only checking boolean attributes that don't have a
    // corresponding dom prop of the same name here.
    const isBoolean = isSpecialBooleanAttr(key)
    if (value == null || (isBoolean && value === false)) {
      el.removeAttribute(key)
    } else {
      el.setAttribute(key, isBoolean ? '' : value)
    }
  }
}

// 2.x compat
/**
 * contenteditable 元素是否是可编辑
 * draggable 元素是否是可拖拽
 * spellcheck 是否开启拼写检查
 */
const isEnumeratedAttr = __COMPAT__
  ? /*#__PURE__*/ makeMap('contenteditable,draggable,spellcheck')
  : NOOP

/**
 * @description 兼容性 属性 处理
 * @param {Element} el 元素节点
 * @param {string} key 属性
 * @param {unknown} value 属性值
 * @param {(ComponentInternalInstance | null)} [instance=null] 当前元素 所在的实例
 * @returns {boolean} true 表示已经兼容处理
 */
export function compatCoerceAttr(
  el: Element,
  key: string,
  value: unknown,
  instance: ComponentInternalInstance | null = null
): boolean {
  if (isEnumeratedAttr(key)) {
    const v2CocercedValue =
      value === null
        ? 'false'
        : typeof value !== 'boolean' && value !== undefined
          ? 'true'
          : null
    if (
      v2CocercedValue &&
      compatUtils.softAssertCompatEnabled(
        DeprecationTypes.ATTR_ENUMERATED_COERCION,
        instance,
        key,
        value,
        v2CocercedValue
      )
    ) {
      el.setAttribute(key, v2CocercedValue)
      return true
    }
  } else if (
    value === false &&
    !isSpecialBooleanAttr(key) &&
    compatUtils.softAssertCompatEnabled(
      DeprecationTypes.ATTR_FALSE_VALUE,
      instance,
      key
    )
  ) {
    el.removeAttribute(key)
    return true
  }
  return false
}
