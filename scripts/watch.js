const fs = require('fs-extra')
const path = require('path')
const execa = require('execa')
const chalk = require('chalk')

const options = {
  persistent: true, // 指示如果文件已正被监视，进程是否应继续运行。默认值: true。
  recursive: true // 指示应该监视所有子目录，还是仅监视当前目录。 这适用于监视目录时，并且仅适用于受支持的平台（参见注意事项）。默认值: false。
}

let timeout = new Map()

fs.watch('packages', options, (event, path) => runBuild(getPaths(path)))

function getPaths(path) {
  if (path && path.includes('\\src\\')) {
    const paths = path.split('\\')
    const is = [
      'server-renderer',
      'runtime-test',
      'vue-compat',
      'template-explorer',
      'size-check',
      'sfc-playground'
    ]
    if (is.includes(paths[0])) return []
    if (paths.length >= 3) {
      return paths
    }
  }
  return []
}

const building = {}

function runBuild(paths) {
  if (paths.length) {
    const [target] = paths.slice(0, 1)
    clearTimeout(timeout.get(target))
    timeout.set(
      target,
      setTimeout(() => {
        if (!building[target]) {
          building[target] = true
        } else {
          console.log(
            chalk.yellow.bold(`\r\n${target}/src 源代码已在打包中!!!`)
          )
          return
        }
        console.log(
          chalk.blue.bold(`\r\n${target}/src 源代码已经更新`, '打包进行中...')
        )
        const start = Date.now()
        execa('yarn', paths.slice(0, 1))
          .then(src => {
            console.log(
              chalk.green.bold(
                `✔ yarn ${target}`,
                `打包成功 ⏱ : ${Date.now() - start}ms`
              )
            )
          })
          .catch(e => {
            console.log(chalk.red.bold(`✖ yarn ${target}`, '打包失败'))
          })
          .finally(() => {
            building[target] = false
          })
      }, 500)
    )
  }
}
