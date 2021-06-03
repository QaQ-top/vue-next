import { ErrorCodes, callWithErrorHandling } from './errorHandling'
import { isArray } from '@vue/shared'
import { ComponentPublicInstance } from './componentPublicInstance'
import { ComponentInternalInstance, getComponentName } from './component'
import { warn } from './warning'

export interface SchedulerJob {
  (): void
  /**
   * unique job id, only present on raw effects, e.g. component render effect
   */
  id?: number
  /**
   * Indicates whether the job is allowed to recursively trigger itself.
   * By default, a job cannot trigger itself because some built-in method calls,
   * e.g. Array.prototype.push actually performs reads as well (#1740) which
   * can lead to confusing infinite loops.
   * The allowed cases are component update functions and watch callbacks.
   * Component update functions may update child component props, which in turn
   * trigger flush: "pre" watch callbacks that mutates state that the parent
   * relies on (#1801). Watch callbacks doesn't track its dependencies so if it
   * triggers itself again, it's likely intentional and it is the user's
   * responsibility to perform recursive state mutation that eventually
   * stabilizes (#1727).
   */
  /**
   * 允许递归
   */
  allowRecurse?: boolean
  ownerInstance?: ComponentInternalInstance
}

export type SchedulerCb = Function & { id?: number }
export type SchedulerCbs = SchedulerCb | SchedulerCb[]

/**
 * 队列是否在执行中
 */
let isFlushing = false
/**
 * 队列是否在 在等待执行中
 */
let isFlushPending = false

/**
 *> 主任务队列
 * 在一次tick中，前置队列 在 主任务队列之前执行，后置队列总是在主任务队列后执行。
 */
const queue: SchedulerJob[] = []
/**
 * 当前 正在执行 的任务在 主任务队 列中的 索引
 */
let flushIndex = 0

/**
 * > 前置任务队列
 * 框架运行过程中产生的前置回调任务，比如一些特定的生命周期
 * 这些回调任务是在 主任务队列queue 开始排空前 批量排空执行的
 */
const pendingPreFlushCbs: SchedulerCb[] = []
/**
 * 当前激活的前置回调任务
 */
let activePreFlushCbs: SchedulerCb[] | null = null
/**
 * 当前前置回调任务在队列中的索引
 */
let preFlushIndex = 0

/**
 * > 后置任务队列
 * 框架运行过程中产生的后置回调任务 一般都是 Update ，比如一些特定的生命周期（onMounted mounted等）
 * 这些回调任务是在 主任务队列queue 排空后 批量排空执行的
 */
const pendingPostFlushCbs: SchedulerCb[] = []
/**
 * 正在的 执行 队列
 */
let activePostFlushCbs: SchedulerCb[] | null = null
let postFlushIndex = 0

/**
 * 微任务 创建器
 */
const resolvedPromise: Promise<any> = Promise.resolve()

/**
 * 当前任务调度任务
 */
let currentFlushPromise: Promise<void> | null = null

/**
 * 前置队列刷新的时候有一种特殊调用情况 带有某个 parentJob 的参数然后刷新 前置队列，这个时候在 前置队列刷新过程中产生的 主队列任务不与 parentJob 相同
 * vue中用于组件更新的时候 详情见vue组件更新部分源码
 */
let currentPreFlushParentJob: SchedulerJob | null = null

/**
 * 同一个任务执行 上限
 */
const RECURSION_LIMIT = 100

/**
 * 统计 每次任务执行的 次数
 */
type CountMap = Map<SchedulerJob | SchedulerCb, number>

/**
 * @description nextTick Composition API
 * @info 如果传递了 fn 就加入到 任务队列
 * @info 返回一个 任务队列执行的 promise
 */
export function nextTick(
  this: ComponentPublicInstance | void,
  fn?: () => void
): Promise<void> {
  const p = currentFlushPromise || resolvedPromise
  return fn ? p.then(this ? fn.bind(this) : fn) : p
}

// #2768
// Use binary-search to find a suitable position in the queue,
// so that the queue maintains the increasing order of job's id,
// which can prevent the job from being skipped and also can avoid repeated patching.

/**
 * 二分查找
 */
function findInsertionIndex(job: SchedulerJob) {
  // the start index should be `flushIndex + 1`
  let start = flushIndex + 1
  let end = queue.length

  const jobId = getId(job)

  /**
   * 先找范围内中间任务的 id
   * 判断 当前任务 是在 中间位置任务 的前面 还是后面
   * 在前 end = middle 在后 start = middle + 1
   * start < end 再次循环 二分
   */
  while (start < end) {
    const middle = (start + end) >>> 1
    const middleJobId = getId(queue[middle])
    middleJobId < jobId ? (start = middle + 1) : (end = middle)
  }

  return start
}

/**
 * 向主任务队列 中添加 执行任务
 */
export function queueJob(job: SchedulerJob) {
  // the dedupe search uses the startIndex argument of Array.includes()
  // by default the search index includes the current job that is being run
  // so it cannot recursively trigger itself again.
  // if the job is a watch() callback, the search will start with a +1 index to
  // allow it recursively trigger itself - it is the user's responsibility to
  // ensure it doesn't end up in an infinite loop.
  /**
   * 主队列为空 或者 队列在执行时 并且
   * 当前任务是可以递归的，那么就看当前在执行任务 后的 执行队列中是否有 相同任务
   * 如果是不可递归的任务, 那么就看 包括当前在执行任务 和 剩余执行队列中是否有 相同任务
   */
  if (
    (!queue.length ||
      !queue.includes(
        job,
        isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex
      )) &&
    job !== currentPreFlushParentJob
  ) {
    // 在主任务中找到当前任务的索引
    const pos = findInsertionIndex(job)
    if (pos > -1) {
      // 任务存在 再次在 存在的任务 前插入
      queue.splice(pos, 0, job)
    } else {
      // 没有找到 直接 push 进入主队列
      queue.push(job)
    }
    queueFlush()
  }
}

/**
 * 创建 微任务 执行队列
 */
function queueFlush() {
  // 如果队列 不在执行中 也 不在待执行状态
  if (!isFlushing && !isFlushPending) {
    // 表示 为 待执行
    isFlushPending = true
    // 在微任务中执行 执行队列
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}

/**
 * 移除 主任务队列 中的任务
 */
export function invalidateJob(job: SchedulerJob) {
  const i = queue.indexOf(job)
  // 如果当前任务 还未执行 就删除 任务
  if (i > flushIndex) {
    queue.splice(i, 1)
  }
}

/**
 * @description 将任务加到 某个队列中 的公共方法
 * @param {SchedulerCbs} cb 执行任务
 * @param {(SchedulerCb[] | null)} 目标队列
 * @param {SchedulerCb[]} 目标执行队列
 * @param {number} index 当前在执行的 任务 索引
 */
function queueCb(
  cb: SchedulerCbs,
  activeQueue: SchedulerCb[] | null,
  pendingQueue: SchedulerCb[],
  index: number
) {
  // 不是一组函数
  if (!isArray(cb)) {
    // 判断当前 剩余执行队列中 是否 已经存在该任务
    if (
      !activeQueue ||
      !activeQueue.includes(
        cb,
        (cb as SchedulerJob).allowRecurse ? index + 1 : index
      )
    ) {
      pendingQueue.push(cb)
    }
  } else {
    // if cb is an array, it is a component lifecycle hook which can only be
    // triggered by a job, which is already deduped in the main queue, so
    // we can skip duplicate check here to improve perf
    // 如果是数组 不需要 检查 是否在执行队列中 直接添加到 等待执行队列
    pendingQueue.push(...cb)
  }
  queueFlush()
}

/**
 * 提供 外部的 添加到前置任务队列
 */
export function queuePreFlushCb(cb: SchedulerCb) {
  queueCb(cb, activePreFlushCbs, pendingPreFlushCbs, preFlushIndex)
}

/**
 * 提供 外部的 添加到后置任务队列
 */
export function queuePostFlushCb(cb: SchedulerCbs) {
  queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex)
}

/**
 * 前置队列执行逻辑
 */
export function flushPreFlushCbs(
  seen?: CountMap,
  parentJob: SchedulerJob | null = null
) {
  if (pendingPreFlushCbs.length) {
    // 如果有 前置任务队列 存在
    currentPreFlushParentJob = parentJob
    // 赋值给 activeCbs 使用 Set 去除重复的 前置任务
    activePreFlushCbs = [...new Set(pendingPreFlushCbs)]
    // 清空 等待中的前置任务队列
    pendingPreFlushCbs.length = 0
    if (__DEV__) {
      seen = seen || new Map()
    }
    // 循环执行 前置任务
    for (
      preFlushIndex = 0;
      preFlushIndex < activePreFlushCbs.length;
      preFlushIndex++
    ) {
      // 开发环境 下 会检查函数 一直前置任务调度 函数所出现的次数
      // 超过 100 会警告死循环 避免 Update 钩子内更新数据引起的无线循环
      if (
        __DEV__ &&
        checkRecursiveUpdates(seen!, activePreFlushCbs[preFlushIndex])
      ) {
        continue
      }
      activePreFlushCbs[preFlushIndex]()
    }
    // 执行完毕 清空 当前执行始索引 清空在执行的前置任务队列
    activePreFlushCbs = null
    preFlushIndex = 0
    currentPreFlushParentJob = null
    // recursively flush until it drains
    // 再次递归调用前置任务队列 (在执行前置任务时 可能产生 前置任务)
    flushPreFlushCbs(seen, parentJob)
  }
}

/**
 * 后置任务执行逻辑
 */
export function flushPostFlushCbs(seen?: CountMap) {
  if (pendingPostFlushCbs.length) {
    // 去除重复后置任务
    const deduped = [...new Set(pendingPostFlushCbs)]
    // 清空 后置任务等待队列
    pendingPostFlushCbs.length = 0

    // #1947 already has active queue, nested flushPostFlushCbs call
    // 如果后置任务执行队列 还在执行中
    if (activePostFlushCbs) {
      // 将任务加入 执行队列 并且退出
      activePostFlushCbs.push(...deduped)
      return
    }

    activePostFlushCbs = deduped
    if (__DEV__) {
      seen = seen || new Map()
    }

    // 根据任务 id 排序
    activePostFlushCbs.sort((a, b) => getId(a) - getId(b))

    for (
      postFlushIndex = 0;
      postFlushIndex < activePostFlushCbs.length;
      postFlushIndex++
    ) {
      // 开发环境 下 会检查函数 一直前置任务调度 函数所出现的次数
      // 超过 100 会警告死循环 避免 Update 钩子内更新数据引起的无线循环
      if (
        __DEV__ &&
        checkRecursiveUpdates(seen!, activePostFlushCbs[postFlushIndex])
      ) {
        continue
      }
      // 执行任务
      activePostFlushCbs[postFlushIndex]()
    }
    // 执行完毕 清空 当前执行始索引 清空在执行的后置任务队列
    activePostFlushCbs = null
    postFlushIndex = 0
  }
}

/**
 * 获取任务id
 */
const getId = (job: SchedulerJob | SchedulerCb) =>
  job.id == null ? Infinity : job.id

/**
 * @description 主任务队列执行逻辑
 * @info 先执行 前置队列
 * @info 再执行 后置队列
 */
function flushJobs(seen?: CountMap) {
  // 队列等待执行结束
  isFlushPending = false
  // 队列执行中
  isFlushing = true
  if (__DEV__) {
    seen = seen || new Map()
  }

  // >先执行前置任务队列
  flushPreFlushCbs(seen)

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.

  // >执行主任务队列

  // 排列主任务队列
  queue.sort((a, b) => getId(a) - getId(b))

  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job) {
        if (__DEV__ && checkRecursiveUpdates(seen!, job)) {
          continue
        }
        // try catch 内 执行任务
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
      }
    }
  } finally {
    // 清空 主任务
    flushIndex = 0
    queue.length = 0

    // >执行后置任务 队列
    flushPostFlushCbs(seen)

    // 任务队列执行完毕
    isFlushing = false
    // 清空当微任务
    currentFlushPromise = null
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    // 在后置任务执行完后 判断是否有新的 主任务 和 后置任务
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}

/**
 * 检查函数出现的次数 是否超过 100 次
 */
function checkRecursiveUpdates(seen: CountMap, fn: SchedulerJob | SchedulerCb) {
  if (!seen.has(fn)) {
    seen.set(fn, 1)
  } else {
    const count = seen.get(fn)!
    if (count > RECURSION_LIMIT) {
      const instance = (fn as SchedulerJob).ownerInstance
      const componentName = instance && getComponentName(instance.type)
      warn(
        `Maximum recursive updates exceeded${
          componentName ? ` in component <${componentName}>` : ``
        }. ` +
          `This means you have a reactive effect that is mutating its own ` +
          `dependencies and thus recursively triggering itself. Possible sources ` +
          `include component template, render function, updated hook or ` +
          `watcher source function.`
      )
      return true
    } else {
      seen.set(fn, count + 1)
    }
  }
}
