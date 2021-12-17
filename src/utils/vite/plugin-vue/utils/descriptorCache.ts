import fs from 'fs'
import { CompilerError, SFCDescriptor, SFCBlock } from '@vue/compiler-sfc'
import { MyVitePluginVue } from '../../vitePlugin.d'
import * as compiler from 'vue/compiler-sfc'

// > 参考 https://github.com/vitejs/vite/blob/main/packages/plugin-vue/src/utils/descriptorCache.ts

// compiler.parse 解析成 ats 树

// 兼容浏览器获取 hash
export function hash(str: string) {
  let hash = 0;
  if(!str.length) return String(hash);
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i)
    hash = ((charCode << 5) - hash) + charCode;
    hash |= 0;
  }
  return String(Math.abs(hash))
}


export interface SFCParseResult {
  descriptor: SFCDescriptor
  errors: Array<CompilerError | SyntaxError>
}

const cache = new Map<string, SFCDescriptor>()
const prevCache = new Map<string, SFCDescriptor | undefined>()

/**
 * @description 将 sfc 格式的 .vue 文件解析成  解析成 template ats 树 | script ats 树 | style ats 树
 * @author (Set the text for this tag by adding docthis.authorName to your settings file.)
 * @date 2021-12-16
 * @export
 * @param {string} filename 文件名称
 * @param {string} source 源代码
 * @param {MyVitePluginVue.ResolvedOptions} { root, isProduction, sourceMap }
 * @returns {SFCParseResult}
 */
export function createDescriptor(
  filename: string,
  source: string,
  { root, isProduction, sourceMap }: MyVitePluginVue.ResolvedOptions
): SFCParseResult {
  const { descriptor, errors } = compiler.parse(source, {
    filename,
    sourceMap
  })

  // ensure the path is normalized in a way that is consistent inside
  // project (relative to root) and on different systems.
  const normalizedPath =root+filename
  descriptor.id = hash(normalizedPath + (isProduction ? source : ''))

  cache.set(filename, descriptor)
  return { descriptor, errors }
}

export function getPrevDescriptor(filename: string): SFCDescriptor | undefined {
  return prevCache.get(filename)
}

export function setPrevDescriptor(
  filename: string,
  entry: SFCDescriptor
): void {
  prevCache.set(filename, entry)
}

export function getDescriptor(
  filename: string,
  options: MyVitePluginVue.ResolvedOptions,
  createIfNotFound = true
): SFCDescriptor | undefined {
  if (cache.has(filename)) {
    return cache.get(filename)!
  }
  if (createIfNotFound) {
    const { descriptor, errors } = createDescriptor(
      filename,
      fs.readFileSync(filename, 'utf-8'),
      options
    )
    if (errors) {
      throw errors[0]
    }
    return descriptor
  }
}

export function setDescriptor(filename: string, entry: SFCDescriptor): void {
  cache.set(filename, entry)
}

export function isEqualBlock(a: SFCBlock | null, b: SFCBlock | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  // src imports will trigger their own updates
  if (a.src && b.src && a.src === b.src) return true
  if (a.content !== b.content) return false
  const keysA = Object.keys(a.attrs)
  const keysB = Object.keys(b.attrs)
  if (keysA.length !== keysB.length) {
    return false
  }
  return keysA.every((key) => a.attrs[key] === b.attrs[key])
}
