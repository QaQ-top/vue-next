
import { MyVitePluginVue } from '../vitePlugin.d';
import {
  SFCDescriptor,
  SFCTemplateCompileOptions,
  SFCTemplateCompileResults,
  CompilerOptions
} from 'vue/compiler-sfc'
import * as compiler from 'vue/compiler-sfc';
import { getResolvedScript } from './script';

declare module '@vue/compiler-sfc' {
  interface SFCDescriptor {
    id?: string
  }
}

// 参考 https://github.com/vitejs/vite/blob/main/packages/plugin-vue/src/template.ts


export async function transformTemplateAsModule(
  descriptor: SFCDescriptor,
  options: any,
  ssr: boolean
) {
  const result = compile(descriptor, options, ssr)

  let returnCode = result.code;

  return {
    code: returnCode,
    map: result.map
  }
}

/**
 * transform the template directly in the main SFC module
 */
export function transformTemplateInMain(
  descriptor: SFCDescriptor,
  options: MyVitePluginVue.ResolvedOptions,
  ssr: boolean
): SFCTemplateCompileResults {
  const result = compile(descriptor, options, ssr)
  return  {
    ...result,
    code: result.code.replace(
      /\nexport (function|const) (render|ssrRender)/,
      '\n$1 _sfc_$2'
    )
  };
}

export function compile(
  descriptor: SFCDescriptor,
  options: MyVitePluginVue.ResolvedOptions,
  ssr: boolean
) {
  const result = compiler.compileTemplate({
    ...resolveTemplateCompilerOptions(descriptor, options, ssr)!,
    source: descriptor.template!.content
  })

  if (result.errors.length) {
    // result.errors.forEach((error) =>
    //   pluginContext.error(
    //     typeof error === 'string'
    //       ? { id: filename, message: error }
    //       : createRollupError(filename, error)
    //   )
    // )
  }

  if (result.tips.length) {
    // result.tips.forEach((tip) =>
    //   pluginContext.warn({
    //     id: filename,
    //     message: tip
    //   })
    // )
  }

  return result
}

export function resolveTemplateCompilerOptions(
  descriptor: SFCDescriptor,
  options: MyVitePluginVue.ResolvedOptions,
  ssr: boolean
): Omit<SFCTemplateCompileOptions, 'source'> | undefined {
  const block = descriptor.template
  if (!block) {
    return
  }
  const resolvedScript = getResolvedScript(descriptor, ssr)
  const hasScoped = descriptor.styles.some((s) => s.scoped)
  const { id, filename, cssVars } = descriptor

  let transformAssetUrls = options.template?.transformAssetUrls
  // compiler-sfc should export `AssetURLOptions`
  let assetUrlOptions //: AssetURLOptions | undefined
  if (options.devServer) {
    // during dev, inject vite base so that compiler-sfc can transform
    // relative paths directly to absolute paths without incurring an extra import
    // request
    if (filename.startsWith(options.root)) {
      // assetUrlOptions = {
      //   base:
      //     options.devServer.config.base +
      //     slash(path.relative(options.root, path.dirname(filename)))
      // }
    }
  } else {
    // build: force all asset urls into import requests so that they go through
    // the assets plugin for asset registration
    assetUrlOptions = {
      includeAbsolute: true
    }
  }

  if (transformAssetUrls && typeof transformAssetUrls === 'object') {
    // presence of array fields means this is raw tags config
    if (Object.values(transformAssetUrls).some((val) => Array.isArray(val))) {
      transformAssetUrls = {
        ...assetUrlOptions,
        tags: transformAssetUrls as any
      }
    } else {
      transformAssetUrls = { ...transformAssetUrls, ...assetUrlOptions }
    }
  } else {
    transformAssetUrls = assetUrlOptions
  }

  let preprocessOptions = block.lang && options.template?.preprocessOptions
  if (block.lang === 'pug') {
    preprocessOptions = {
      doctype: 'html',
      ...preprocessOptions
    }
  }

  // if using TS, support TS syntax in template expressions
  const expressionPlugins: CompilerOptions['expressionPlugins'] =
    options.template?.compilerOptions?.expressionPlugins || []
  const lang = descriptor.scriptSetup?.lang || descriptor.script?.lang
  if (lang && /tsx?$/.test(lang) && !expressionPlugins.includes('typescript')) {
    expressionPlugins.push('typescript')
  }

  return {
    ...options.template,
    id: id!,
    filename,
    scoped: hasScoped,
    slotted: descriptor.slotted,
    isProd: options.isProduction,
    inMap: block.src ? undefined : block.map,
    ssr,
    ssrCssVars: cssVars,
    transformAssetUrls,
    preprocessLang: block.lang,
    preprocessOptions,
    compilerOptions: {
      ...options.template?.compilerOptions,
      scopeId: hasScoped ? `data-v-${id}` : undefined,
      bindingMetadata: resolvedScript ? resolvedScript.bindings : undefined,
      expressionPlugins,
      sourceMap: options.sourceMap
    }
  }
}
