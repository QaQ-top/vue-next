// __UNSAFE__
// Reason: potentially setting innerHTML.
// This can come from explicit usage of v-html or innerHTML as a prop in render

import { warn, DeprecationTypes, compatUtils } from '@vue/runtime-core'

// functions. The user is responsible for using them with only trusted content.

/**
 * @description 元素自身可访问 属性值处理 并且更新属性
 * @param {*} el 元素节点
 * @param {string} key 属性名称
 * @param {*} value 属性值
 * @param {*} prevChildren 子元素(vdom) 子组件
 * @param {*} parentComponent 当前元素 所在的实例
 * @param {*} parentSuspense
 * @param {*} unmountChildren 提供卸载组件的方法
 */
export function patchDOMProp(
  el: any,
  key: string,
  value: any,
  // the following args are passed only due to potential innerHTML/textContent
  // overriding existing VNodes, in which case the old tree must be properly
  // unmounted.
  prevChildren: any,
  parentComponent: any,
  parentSuspense: any,
  unmountChildren: any
) {
  // 处理 innerHTML 和 textContent (innerText应该在编译时就处理好了？？？)
  if (key === 'innerHTML' || key === 'textContent') {
    if (prevChildren) {
      // 如果有 子元素 或者 子组件 需要先将其卸载
      unmountChildren(prevChildren, parentComponent, parentSuspense)
    }
    // 处理 null 为空字符串
    el[key] = value == null ? '' : value
    return
  }

  // 对 非progress(进度条标签) 属性为value的 元素节点 进行处理
  if (key === 'value' && el.tagName !== 'PROGRESS') {
    // store value as _value as well since
    // non-string values will be stringified.
    // 设置元素 _value 主要避免转html属性值后被 value 类型会变成 string
    el._value = value
    // 处理 null 为空字符串
    const newValue = value == null ? '' : value
    // 判断是否是新值 避免重复设置元素属性
    if (el.value !== newValue) {
      el.value = newValue
    }
    if (value == null) {
      el.removeAttribute(key)
    }
    return
  }

  // 对 属性值为 空字符串 和 null 时 特殊处理
  if (value === '' || value == null) {
    /**
     * 元素节点属性值的类型
     */
    const type = typeof el[key]
    if (value === '' && type === 'boolean') {
      // e.g. <select multiple> compiles to { multiple: '' }
      // 如果元素节点初始值是 boolean,  <select multiple> 这里表示 multiple = true 都是模板编译会是 { multiple: '' }
      // 所以空字符为 true
      el[key] = true
      return
    } else if (value == null && type === 'string') {
      // e.g. <div :id="null">
      // 如果是 value null 元素节点初始值是 string; 则表示干掉之前(更新dom也会走到这里)的属性
      el[key] = ''
      el.removeAttribute(key)
      return
    } else if (type === 'number') {
      // e.g. <img :width="null">
      //  元素节点初始值是 number 则空值转为 0
      el[key] = 0
      el.removeAttribute(key)
      return
    }
  }

  /**
   * 开启兼容性模式时 如果 value 是 false 但是元素属性是 string number类型
   * 开发模式下 会调用 compatUtils.warnDeprecation 提示开发者
   * false 将转为 0 : ""
   */
  if (
    __COMPAT__ &&
    value === false &&
    compatUtils.isCompatEnabled(
      DeprecationTypes.ATTR_FALSE_VALUE,
      parentComponent
    )
  ) {
    const type = typeof el[key]
    if (type === 'string' || type === 'number') {
      __DEV__ &&
        compatUtils.warnDeprecation(
          DeprecationTypes.ATTR_FALSE_VALUE,
          parentComponent,
          key
        )
      el[key] = type === 'number' ? 0 : ''
      el.removeAttribute(key)
      return
    }
  }

  // some properties perform value validation and throw
  // 对非特殊 属性 属性值 进行错误捕获赋值
  try {
    el[key] = value
  } catch (e) {
    if (__DEV__) {
      warn(
        `Failed setting prop "${key}" on <${el.tagName.toLowerCase()}>: ` +
          `value ${value} is invalid.`,
        e
      )
    }
  }
}
