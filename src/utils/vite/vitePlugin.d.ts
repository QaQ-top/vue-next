import {
  SFCScriptCompileOptions,
  SFCStyleCompileOptions,
  SFCTemplateCompileOptions
} from '@vue/compiler-sfc';
import { ViteDevServer } from 'vite'


export namespace MyVitePluginVue {
  interface Options {
    include?: string | RegExp | (string | RegExp)[]
    exclude?: string | RegExp | (string | RegExp)[]
  
    isProduction?: boolean
  
    // options to pass on to @vue/compiler-sfc
    script?: Partial<SFCScriptCompileOptions>
    template?: Partial<SFCTemplateCompileOptions>
    style?: Partial<SFCStyleCompileOptions>
  
    /**
     * Transform Vue SFCs into custom elements.
     * **requires Vue \>= 3.2.0 & Vite \>= 2.4.4**
     * - `true`: all `*.vue` imports are converted into custom elements
     * - `string | RegExp`: matched files are converted into custom elements
     *
     * @default /\.ce\.vue$/
     */
    customElement?: boolean | string | RegExp | (string | RegExp)[]
  
    /**
     * Enable Vue ref transform (experimental).
     * https://github.com/vuejs/vue-next/tree/master/packages/ref-transform
     *
     * **requires Vue \>= 3.2.5**
     *
     * - `true`: transform will be enabled for all vue,js(x),ts(x) files except
     *           those inside node_modules
     * - `string | RegExp`: apply to vue + only matched files (will include
     *                      node_modules, so specify directories in necessary)
     * - `false`: disable in all cases
     *
     * @default false
     */
    refTransform?: boolean | string | RegExp | (string | RegExp)[]
  
    /**
     * @deprecated the plugin now auto-detects whether it's being invoked for ssr.
     */
    ssr?: boolean
  }
  
  interface ResolvedOptions extends Options {
    root: string
    sourceMap: boolean
    devServer?: ViteDevServer
  }
}