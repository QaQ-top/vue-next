import { SFCDescriptor } from '@vue/compiler-sfc'
import { MyVitePluginVue } from '../vitePlugin'
import * as compiler from 'vue/compiler-sfc';


// > 参考 https://github.com/vitejs/vite/blob/main/packages/plugin-vue/src/style.ts

export async function transformStyle(
  descriptor: SFCDescriptor,
  index: number,
  options: MyVitePluginVue.ResolvedOptions,
) {
  const block = descriptor.styles[index];
  // vite already handles pre-processors and CSS module so this is only
  const result = await compiler.compileStyleAsync({
    ...options.style,
    filename: descriptor.filename,
    id: `data-v-${descriptor.id}`,
    isProd: options.isProduction,
    source: block.content,
    scoped: block.scoped
  })
  console
  if (result.errors.length) {
    result.errors.forEach((error: any) => {
      if (error.line && error.column) {
        error.loc = {
          file: descriptor.filename,
          line: error.line + block.loc.start.line,
          column: error.column
        }
      }
    })
    return null
  }

  return {
    code: result.code,
    map: result.map || ({ mappings: '' } as any)
  }
}
