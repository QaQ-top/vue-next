/**
 * vdom 类型
 */
export const enum ShapeFlags {
  /**
   * 元素节点
   */
  ELEMENT = 1,
  /**
   * 函数式组件 (https://v3.cn.vuejs.org/guide/migration/functional-components.html)
   */
  FUNCTIONAL_COMPONENT = 1 << 1, // 010
  /**
   * 状态组件 (正常写法的组件)
   */
  STATEFUL_COMPONENT = 1 << 2, // 0100
  /**
   * 文本 (包括 注释)
   */
  TEXT_CHILDREN = 1 << 3, // 01000
  /**
   * 数组 (模板 v-for 循环 每一个循环块 都是一个独立的 vnode )
   */
  ARRAY_CHILDREN = 1 << 4,
  /**
   * 插槽
   */
  SLOTS_CHILDREN = 1 << 5,
  /**
   * 传送组件 Teleport
   */
  TELEPORT = 1 << 6,
  /**
   * 异步组件 Suspense
   */
  SUSPENSE = 1 << 7,
  /**
   * 缓存数据数据组件 KeepAlive
   */
  COMPONENT_SHOULD_KEEP_ALIVE = 1 << 8,
  /**
   * 缓存数据
   */
  COMPONENT_KEPT_ALIVE = 1 << 9,
  /**
   * 组件
   */
  COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT
}

/**
 * 位运算操作符
 * & : 按位与运算符 (&) 在每个位上返回 1 ，这两个操作数对应的位都是 1
 *    11111111 & 00000001 -> 00000001
 *    11111111 & 00001010 -> 00001010
 *    对应位置都是 1 时返回 1 否则返回 0
 *
 * ~ : 按位非运算符 (~)，反转操作数的位
 *    ~11111111 -> 00000000
 *    ~00000111 -> 11111000
 *
 * | : 按位数或运算符 (|) 在每个位上返回 1，其中一个或两个操作数的相应位是1。
 *    11111111 | 00010100 -> 11111111
 *    00001010 | 00000101 -> 00001111
 *    有一位是 1 都返回 1
 * ^ : 按位异或运算符 (^) 在每个位上返回 1，其中任一操作数但不是两个操作数的相应位均为 1。
 *    11111111 ^ 11110000 -> 00001111
 *    00000111 ^ 00000111 -> 00000000
 *    对应位置不相等时返回 1 否则返回 0
 */
