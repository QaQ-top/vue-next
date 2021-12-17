import { MyVitePluginVue } from '../vitePlugin.d';

const EXPORT_HELPER_ID = 'plugin-vue:export-helper'

export const rawOptions: MyVitePluginVue.ResolvedOptions = {
  root: VITE_ROOT,
  include: /\.vue$/,
  exclude: [],
  customElement: /\.ce\.vue$/,
  refTransform: false,
  isProduction: import.meta.env.NODE_ENV === 'production',
  sourceMap: true,
} 

// import qs from 'querystring'
import { SFCBlock, SFCDescriptor } from 'vue/compiler-sfc'
import * as compiler from 'vue/compiler-sfc'
import {
  createDescriptor,
  getPrevDescriptor,
  setDescriptor,
  isEqualBlock,
} from './utils/descriptorCache'
import { resolveScript, isUseInlineTemplate } from './script'
import { transformTemplateInMain } from './template'
import { RawSourceMap, SourceMapConsumer, SourceMapGenerator } from 'source-map'
// import { transformWithEsbuild } from 'vite'

export async function transformMain(
  code: string,
  filename: string,
  options: MyVitePluginVue.ResolvedOptions,
  ssr: boolean,
) {
  const { devServer, isProduction } = options

  // prev descriptor is only set and used for hmr
  const prevDescriptor = getPrevDescriptor(filename)
  const { descriptor, errors } = createDescriptor(filename, code, options)

  if (errors.length) {
    console.error("errors")
    return null
  }

  // feature information
  const attachedProps: [string, string][] = []
  const hasScoped = descriptor.styles.some((s) => s.scoped)

  // script
  const { code: scriptCode, map } = await genScriptCode(
    descriptor,
    options,
    ssr
  )

  // template
  const hasTemplateImport =
    descriptor.template && !isUseInlineTemplate(descriptor, !devServer)

  let templateCode = ''
  let templateMap: RawSourceMap | undefined
  if (hasTemplateImport) {
    ;({ code: templateCode, map: templateMap } = await genTemplateCode(
      descriptor,
      options,
      ssr
    ))
  }

  if (hasTemplateImport) {
    attachedProps.push(
      // ssr ? ['ssrRender', '_sfc_ssrRender'] : ['render', '_sfc_render']
      ['render', '_sfc_render']
    )
  } else {
    // #2128
    // User may empty the template but we didn't provide rerender function before
    if (
      prevDescriptor &&
      !isEqualBlock(descriptor.template, prevDescriptor.template)
    ) {
      // attachedProps.push([ssr ? 'ssrRender' : 'render', '() => {}'])
      attachedProps.push(['render', '() => {}'])
    }
  }

  // styles
  const stylesCode = await genStyleCode(
    descriptor,
    attachedProps
  )

  // custom blocks
  const customBlocksCode = await genCustomBlockCode(descriptor)

  const output: string[] = [
    scriptCode,
    templateCode,
    stylesCode,
    customBlocksCode
  ]
  if (hasScoped) {
    attachedProps.push([`__scopeId`, JSON.stringify(`data-v-${descriptor.id}`)])
  }
  if (devServer && !isProduction) {
    // expose filename during serve for devtools to pickup
    attachedProps.push([`__file`, JSON.stringify(filename)])
  }


  // if the template is inlined into the main module (indicated by the presence
  // of templateMap, we need to concatenate the two source maps.
  let resolvedMap = options.sourceMap ? map : undefined
  if (resolvedMap && templateMap) {
    const generator = SourceMapGenerator.fromSourceMap(
      new SourceMapConsumer(map)
    )
    const offset = scriptCode.match(/\r?\n/g)?.length || 1
    const templateMapConsumer = new SourceMapConsumer(templateMap)
    templateMapConsumer.eachMapping((m) => {
      generator.addMapping({
        source: m.source,
        original: { line: m.originalLine, column: m.originalColumn },
        generated: {
          line: m.generatedLine + offset,
          column: m.generatedColumn
        }
      })
    })
    resolvedMap = (generator as any).toJSON() as RawSourceMap
    // if this is a template only update, we will be reusing a cached version
    // of the main module compile result, which has outdated sourcesContent.
    resolvedMap.sourcesContent = templateMap.sourcesContent
  }

  if (!attachedProps.length) {
    output.push(`export default _sfc_main`)
  } else {
    output.push(
      `import _export_sfc from '${EXPORT_HELPER_ID}'`,
      `export default /*#__PURE__*/_export_sfc(_sfc_main, [${attachedProps
        .map(([key, val]) => `['${key}',${val}]`)
        .join(',')}])`
    )
  }

  // handle TS transpilation
  let resolvedCode = output.join('\n')
  if (
    (descriptor.script?.lang === 'ts' ||
      descriptor.scriptSetup?.lang === 'ts') &&
    !descriptor.script?.src // only normal script can have src
  ) {
    // const { code, map } = await transformWithEsbuild(
    //   resolvedCode,
    //   filename,
    //   { loader: 'ts', sourcemap: options.sourceMap },
    //   resolvedMap
    // )
    resolvedMap = resolvedMap ? (map as any) : resolvedMap
  }

  return {
    code: resolvedCode,
    map: resolvedMap || {
      mappings: ''
    }
  }
}

async function genTemplateCode(
  descriptor: SFCDescriptor,
  options: MyVitePluginVue.ResolvedOptions,
  ssr: boolean
) {
  const template = descriptor.template!

  // If the template is not using pre-processor AND is not using external src,
  // compile and inline it directly in the main module. When served in vite this
  // saves an extra request per SFC which can improve load performance.
  if (!template.lang && !template.src) {
    return transformTemplateInMain(
      descriptor,
      options,
      ssr
    )
  } else {
    if (template.src) {
      await linkSrcToDescriptor(template.src, descriptor)
    }
    const src = template.src || descriptor.filename
    const srcQuery = template.src ? `&src` : ``
    const attrsQuery = attrsToQuery(template.attrs, 'js', true)
    const query = `?vue&type=template${srcQuery}${attrsQuery}`
    const request = JSON.stringify(src + query)
    const renderFnName = ssr ? 'ssrRender' : 'render'
    return {
      code: `import { ${renderFnName} as _sfc_${renderFnName} } from ${request}`,
      map: undefined
    }
  }
}

async function genScriptCode(
  descriptor: SFCDescriptor,
  options: MyVitePluginVue.ResolvedOptions,
  ssr: boolean
): Promise<{
  code: string
  map: RawSourceMap
}> {
  let scriptCode = `const _sfc_main = {}`
  let map: RawSourceMap | undefined

  const script = resolveScript(descriptor, options, ssr)
  if (script) {
    // If the script is js/ts and has no external src, it can be directly placed
    // in the main module.
    if ((!script.lang || script.lang === 'ts') && !script.src) {
      scriptCode = compiler.rewriteDefault(
        script.content,
        '_sfc_main',
        script.lang === 'ts' ? ['typescript'] : undefined
      )
      map = script.map
    } else {
      if (script.src) {
        await linkSrcToDescriptor(script.src, descriptor)
      }
      const src = script.src || descriptor.filename
      const langFallback = (script.src && src.split(".").at(-1)!.slice(1)) || 'js'
      const attrsQuery = attrsToQuery(script.attrs, langFallback)
      const srcQuery = script.src ? `&src` : ``
      const query = `?vue&type=script${srcQuery}${attrsQuery}`
      const request = JSON.stringify(src + query)
      scriptCode =
        `import _sfc_main from ${request}\n` + `export * from ${request}` // support named exports
    }
  }
  return {
    code: scriptCode,
    map: map as any
  }
}

async function genStyleCode(
  descriptor: SFCDescriptor,
  attachedProps: [string, string][]
) {
  let stylesCode = ``
  let hasCSSModules = false
  if (descriptor.styles.length) {
    for (let i = 0; i < descriptor.styles.length; i++) {
      const style = descriptor.styles[i]
      if (style.src) {
        await linkSrcToDescriptor(style.src, descriptor)
      }
      const src = style.src || descriptor.filename
      // do not include module in default query, since we use it to indicate
      // that the module needs to export the modules json
      const attrsQuery = attrsToQuery(style.attrs, 'css')
      const srcQuery = style.src ? `&src` : ``
      const directQuery = ``
      const query = `?vue&type=style&index=${i}${srcQuery}${directQuery}`
      const styleRequest = src + query + attrsQuery
      if (style.module) {
        if (!hasCSSModules) {
          stylesCode += `\nconst cssModules = {}`
          attachedProps.push([`__cssModules`, `cssModules`])
          hasCSSModules = true
        }
        stylesCode += genCSSModulesCode(i, styleRequest, style.module)
      } else {
        stylesCode += `\nimport ${JSON.stringify(styleRequest)}`
      }
      // TODO SSR critical CSS collection
    }
  }
  return stylesCode
}

function genCSSModulesCode(
  index: number,
  request: string,
  moduleName: string | boolean
): string {
  const styleVar = `style${index}`
  const exposedName = typeof moduleName === 'string' ? moduleName : '$style'
  // inject `.module` before extension so vite handles it as css module
  const moduleRequest = request.replace(/\.(\w+)$/, '.module.$1')
  return (
    `\nimport ${styleVar} from ${JSON.stringify(moduleRequest)}` +
    `\ncssModules["${exposedName}"] = ${styleVar}`
  )
}

async function genCustomBlockCode(
  descriptor: SFCDescriptor,
) {
  let code = ''
  for (let index = 0; index < descriptor.customBlocks.length; index++) {
    const block = descriptor.customBlocks[index]
    if (block.src) {
      await linkSrcToDescriptor(block.src, descriptor)
    }
    const src = block.src || descriptor.filename
    const attrsQuery = attrsToQuery(block.attrs, block.type)
    const srcQuery = block.src ? `&src` : ``
    const query = `?vue&type=${block.type}&index=${index}${srcQuery}${attrsQuery}`
    const request = JSON.stringify(src + query)
    code += `import block${index} from ${request}\n`
    code += `if (typeof block${index} === 'function') block${index}(_sfc_main)\n`
  }
  return code
}

/**
 * For blocks with src imports, it is important to link the imported file
 * with its owner SFC descriptor so that we can get the information about
 * the owner SFC when compiling that file in the transform phase.
 */
async function linkSrcToDescriptor(
  src: string,
  descriptor: SFCDescriptor,
) {
  const srcFile = src
  // #1812 if the src points to a dep file, the resolved id may contain a
  // version query.
  setDescriptor(srcFile.replace(/\?.*$/, ''), descriptor)
}

// these are built-in query parameters so should be ignored
// if the user happen to add them as attrs
const ignoreList = ['id', 'index', 'src', 'type', 'lang', 'module']

function attrsToQuery(
  attrs: SFCBlock['attrs'],
  langFallback?: string,
  forceLangFallback = false
): string {
  let query = ``
  for (const name in attrs) {
    const value = attrs[name]
    if (!ignoreList.includes(name)) {
      // query += `&${qs.escape(name)}${
      //   value ? `=${qs.escape(String(value))}` : ``
      // }`
      query += `&${encodeURIComponent(name)}${
        value ? `=${encodeURIComponent(String(value))}` : ``
      }`
    }
  }
  if (langFallback || attrs.lang) {
    query +=
      `lang` in attrs
        ? forceLangFallback
          ? `&lang.${langFallback}`
          : `&lang.${attrs.lang}`
        : `&lang.${langFallback}`
  }
  return query
}
