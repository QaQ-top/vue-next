import { isArray, isString, isObject, hyphenate } from './'
import { isNoUnitNumericStyleProp } from './domAttrConfig'

export type NormalizedStyle = Record<string, string | number>

/**
 * 处理 `:style="[{ 'background-color': 'red', }, 'font-size: 77px; color: red;', { fontSize: ['99px', '20px', '12px'] }]"` 合并处理 `{'background-color': 'red',fontSize: ['99px', '20px', '12px']}`
 * @warning 属性值是数组处理在 `runtime-dom模块 modules/style.ts`
 */
export function normalizeStyle(value: unknown): NormalizedStyle | undefined {
  // 如果是数组 进行 循环递归 直到获取到 是 Object
  if (isArray(value)) {
    const res: NormalizedStyle = {}
    for (let i = 0; i < value.length; i++) {
      const item = value[i]
      // 递归获取到 最终的 Style 对象
      const normalized = normalizeStyle(
        /* 如果是字符串(cssText) 将其转为 对象 */
        isString(item) ? parseStringStyle(item) : item
      )
      // 这里是直接 覆盖 之前存在的 css属性值
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key]
        }
      }
    }
    return res
  } else if (isObject(value)) {
    return value
  }
}

/**
 * css 属性 切分
 */
const listDelimiterRE = /;(?![^(]*\))/g
/**
 * css 属性 属性值切分
 */
const propertyDelimiterRE = /:(.+)/

/**
 * 把 cssText 转为对象
 */
export function parseStringStyle(cssText: string): NormalizedStyle {
  const ret: NormalizedStyle = {}
  cssText.split(listDelimiterRE).forEach(item => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE)
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim())
    }
  })
  return ret
}

/**
 * 把对象 转为 cssText
 */
export function stringifyStyle(styles: NormalizedStyle | undefined): string {
  let ret = ''
  if (!styles) {
    return ret
  }
  for (const key in styles) {
    const value = styles[key]
    const normalizedKey = key.startsWith(`--`) ? key : hyphenate(key)
    if (
      isString(value) ||
      (typeof value === 'number' && isNoUnitNumericStyleProp(normalizedKey))
    ) {
      // only render valid values
      ret += `${normalizedKey}:${value};`
    }
  }
  return ret
}

/**
 * 处理 `:class="['box','child', {red: true}]"` 为 HTML标准的 字符串类名 `class="box child red"`
 */
export function normalizeClass(value: unknown): string {
  let res = ''
  if (isString(value)) {
    res = value
  } else if (isArray(value)) {
    // 数组时 循环 并且递归 处理类名
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i])
      // 应用类名
      if (normalized) {
        res += normalized + ' '
      }
    }
  } else if (isObject(value)) {
    // 对象时 取对象的key 为类名
    for (const name in value) {
      // 类名的值为 true 时才 应用类名称
      if (value[name]) {
        res += name + ' '
      }
    }
  }
  return res.trim()
}
