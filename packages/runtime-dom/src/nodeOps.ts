import { RendererOptions } from '@vue/runtime-core'

export const svgNS = 'http://www.w3.org/2000/svg'

// const logPath = "runtime-dom/src/nodeOps.ts -> "

// function log(args:any[], str: string) {
//   console.log(...args, `${logPath}${str}`)
// }

/**
 * 就是 window.document
 */
const doc = (typeof document !== 'undefined' ? document : null) as Document

let tempContainer: HTMLElement
let tempSVGContainer: SVGElement

/**
 * 提供 渲染、创建、删除、克隆、查找元素, 文本内容更新
 */
export const nodeOps: Omit<RendererOptions<Node, Element>, 'patchProp'> = {
  /**
   * 在 parent 的 anchor元素前 插入 child
   */
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null)
  },

  /**
   * 删除 传入 的元素节点
   */
  remove: child => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },

  /**
   * 提供 tag 创建一个元素 并且返回创建元素
   */
  createElement: (tag, isSVG, is, props): Element => {
    // log([tag, isSVG, is, props], "nodeOps.createElement");

    /**
     * 创建 元素 isSVG 用来区分创建 svg 还是 其它元素
     * svgNS 是 'http://www.w3.org/2000/svg'
     * {is: any} 是 createElement 可选项
     */
    const el = isSVG
      ? doc.createElementNS(svgNS, tag)
      : doc.createElement(tag, is ? { is } : undefined)

    /**
     * 创建 select 标签时 添加 multiple(多选) 属性
     */
    if (tag === 'select' && props && props.multiple != null) {
      ;(el as HTMLSelectElement).setAttribute('multiple', props.multiple)
    }
    return el
  },

  /**
   * 创建文本节点
   */
  createText: text => doc.createTextNode(text),

  /**
   * 创建 html 注释 文本
   */
  createComment: text => doc.createComment(text),

  /**
   * 给 文本节点 设置 nodeValue 改变内容
   */
  setText: (node, text) => {
    node.nodeValue = text
  },
  /**
   * 给 元素节点 设置 textContent 改变内容
   */
  setElementText: (el, text) => {
    el.textContent = text
  },

  /**
   * 返回父节点
   */
  parentNode: node => node.parentNode as Element | null,

  /**
   * 返回下一个 兄弟节点 (包括文本节点)
   */
  nextSibling: node => node.nextSibling,

  /**
   * 调用  document.querySelector 方法查询元素
   */
  querySelector: selector => doc.querySelector(selector),

  /**
   * 给 元素 添加一个 属性名称 属性值默认为 空
   * .vue 文件 <style scoped> 添加 空间名命时 会调用 该方法给 每一个 元素加上 [data-v-??????]
   */
  setScopeId(el, id) {
    // log([el, id], "nodeOps.setScopeId");
    el.setAttribute(id, '')
  },

  /**
   * 深度克隆 元素节点 并且 复制它的 _value 如何返回 克隆元素
   */
  cloneNode(el) {
    const cloned = el.cloneNode(true)
    // #3072
    // - in `patchDOMProp`, we store the actual value in the `el._value` property.
    // - normally, elements using `:value` bindings will not be hoisted, but if
    //   the bound value is a constant, e.g. `:value="true"` - they do get
    //   hoisted.
    // - in production, hoisted nodes are cloned when subsequent inserts, but
    //   cloneNode() does not copy the custom property we attached.
    // - This may need to account for other custom DOM properties we attach to
    //   elements in addition to `_value` in the future.
    if (`_value` in el) {
      ;(cloned as any)._value = (el as any)._value
    }
    return cloned
  },

  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  /**
   * 在 parent 的 anchor元素前 插入 content(静态内容)
   * 然后 返回 content 的 firstChild 和 lastChild
   */
  insertStaticContent(content, parent, anchor, isSVG) {
    /**
     * 创建一个新 div or svg 插入让 innerHTML = content
     */
    const temp = isSVG
      ? tempSVGContainer ||
        (tempSVGContainer = doc.createElementNS(svgNS, 'svg'))
      : tempContainer || (tempContainer = doc.createElement('div'))
    temp.innerHTML = content
    /**
     * 每次 循环 在 anchor 插入静态的第一个子
     * 插入 都会销毁掉 当前 firstChild
     * 然后给 node 赋值最新的 firstChild 再次循环
     */
    const first = temp.firstChild as Element
    let node: Element | null = first
    let last: Element = node
    while (node) {
      last = node
      nodeOps.insert(node, parent, anchor)
      node = temp.firstChild as Element
    }
    return [first, last]
  }
}
