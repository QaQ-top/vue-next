const fs = require('fs-extra')
const path = require('path')
const execa = require('execa')

const opt = {
  persistent: true, // 指示如果文件已正被监视，进程是否应继续运行。默认值: true。
  recursive: true // 指示应该监视所有子目录，还是仅监视当前目录。 这适用于监视目录时，并且仅适用于受支持的平台（参见注意事项）。默认值: false。
}
const package_name = '../packages'

// 读取包内部的模块
fs.readdir(path.resolve(__dirname, package_name), async (err, files) => {
  // 过滤文件
  files.filter(i => !['global.d.ts'].includes(i)).forEach(async module_name => {
    // 子模块源码路径
    const submodule = `${package_name}/${module_name}/src`
    let timeout = null
    // 源码添加 文件监听
    fs.watch(path.resolve(__dirname, submodule), opt, (event, filename) => {
      // console.log(`事件类型是:${module_name} ${event}`);

      if (filename) {
        clearTimeout(timeout)
        // console.log(`提供的文件名: ${filename}`);
        timeout = setTimeout(() => {
          console.log(`${module_name} ${event}`, '打包进行中...')
          execa('yarn', [module_name])
            .then(src => {
              console.log(`yarn ${module_name}`, '打包成功')
            })
            .catch(e => {
              console.log(`yarn ${module_name}`, '打包失败')
            })
        }, 500)
      } else {
        // console.log('文件名未提供');
      }
    })
  })
})
