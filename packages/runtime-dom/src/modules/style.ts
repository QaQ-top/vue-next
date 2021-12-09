import { isString, hyphenate, capitalize, isArray } from '@vue/shared'
import { camelize } from '@vue/runtime-core'

type Style = string | Record<string, string | string[]> | null

/**
 * @description
 * @param {Element} el 元素节点
 * @param {Style} prev 上一次的syle对象
 * @param {Style} next 更新的syle对象(初始化只有next)
 */
export function patchStyle(el: Element, prev: Style, next: Style) {
  /**
   * 当前元素 的 style 对象
   */
  const style = (el as HTMLElement).style
  const isCssString = isString(next)
  if (next && !isCssString) {
    // 因为在解析时 会将 多个 style 对象整合为一个 所以这里 next 不会存在数组
    for (const key in next) {
      setStyle(style, key, next[key])
    }
    if (prev && !isString(prev)) {
      for (const key in prev) {
        if (next[key] == null) {
          setStyle(style, key, '')
        }
      }
    }
  } else {
    const currentDisplay = style.display
    if (isCssString) {
      if (prev !== next) {
        // 更新值为 字符串 且与上一次的值不相同
        style.cssText = next as string
      }
    } else if (prev) {
      // 更新对象 如果为空 直接删除元素的 style 属性
      el.removeAttribute('style')
    }
    // indicates that the `display` of the element is controlled by `v-show`,
    // so we always keep the current `display` value regardless of the `style`
    // value, thus handing over control to `v-show`.
    // 设置完样式后 确认 是否有 _vod 保证 v-show 行为正确
    if ('_vod' in el) {
      style.display = currentDisplay
    }
  }
}

/**
 * 用来判断 样式值 是否有 !important
 */
const importantRE = /\s*!important$/

function setStyle(
  style: CSSStyleDeclaration,
  name: string,
  val: string | string[]
) {
  if (isArray(val)) {
    // 如果 要设置的值 是 数组, 那么就 循环数组设置 每一个值
    // 其实这里 最终 设置的值 是 数组 最后一个
    val.forEach(v => setStyle(style, name, v))
  } else {
    if (name.startsWith('--')) {
      // custom property definition
      // 如果属性是以 -- 开头 设置 自定义属性
      style.setProperty(name, val)
    } else {
      // 处理 样式属性 名称
      const prefixed = autoPrefix(style, name)
      if (importantRE.test(val)) {
        // !important
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ''),
          'important'
        )
      } else {
        style[prefixed as any] = val
      }
    }
  }
}

/**
 * 兼容性前缀
 * Webkit Gecko Trident (谷歌 火狐 IE)
 */
const prefixes = ['Webkit', 'Moz', 'ms']
/**
 * 存储处理后的 避免重复处理
 */
const prefixCache: Record<string, string> = {}

/**
 * 浏览器兼容性前缀处理、驼峰名命处理 返回处理后的结果
 */
function autoPrefix(style: CSSStyleDeclaration, rawName: string): string {
  const cached = prefixCache[rawName]
  if (cached) {
    // 如果之前 有处理过 直接返回
    return cached
  }
  // 将有 中划线 的字符串转为驼峰
  let name = camelize(rawName)
  if (name !== 'filter' && name in style) {
    // 属性名称 不是 filter 并且 style 样式属性中 存在该属性 返回该属性
    return (prefixCache[rawName] = name)
  }
  // 给 filter 和 不兼容属性 添加 浏览器前缀
  name = capitalize(name)
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name
    if (prefixed in style) {
      return (prefixCache[rawName] = prefixed)
    }
  }
  return rawName
}
