/**
 * Find all Chinese characters and output them into a file
 * params: --dir directories, --output output path, --conf config file
 * ccc 2018/02/24
 */

const fs = require('fs')
const path = require('path')
// const charReg = new RegExp(/(\'[^\']*?[\u4e00-\u9fa5]+[^\']*?\')|(\"[^\"]*?[\u4e00-\u9fa5]+[^\"]*?\")/, 'g')  // 单引号或双引号之间有包含中文的部分
// const charReg = new RegExp(/[\u4e00-\u9fa5]+/, 'g')  // 中文
const charReg = new RegExp(/[^\x00-\xff]+/, 'g')   // 双字节
const reqReg = new RegExp(/require\([\'\"].+?[\'\"]\)/, 'g')
const aliasReg = new RegExp(/(^[^\./]+?)\//)

let conf

const parseArgv = (argv) => {
  let ret = {}
  for (let i = 0; i < argv.length;) {
    if (argv[i][0] === '-') {
      !ret[argv[i]] && (ret[argv[i]] = [])
      if (i + 1 === argv.length) break
      for (let j = i + 1; j < argv.length; j++ , j === argv.length ? i++ : '') {
        if (argv[j][0] === '-') {
          i = j
          break
        } else {
          ret[argv[i]].push(argv[j])
        }
      }
    } else i++
  }
  return ret
}

const checkDirFromConf = (p) => {
  const fileString = fs.readFileSync(p, 'utf8')
  conf = JSON.parse(fileString)
  return conf.directories
}

const options = parseArgv(process.argv.slice(2))
const confPath = options['--conf'] && options['--conf'][0] || ''
if (!options['--dir'] && !confPath) {
  console.warn('Please pass --dir or --conf with directories')
  process.exit()
}
const directories = options['--dir'] || checkDirFromConf(confPath) || [process.cwd()]
const outputPath = (options['--output'] && options['--output'][0]) || (conf && conf.output) || 'output.json'
const excludeRequire = options['--excludeRequire'] || (conf && conf.excludeRequire)

const getFiles = (p, all) => {
  all = all || []
  const files = fs.readdirSync(p, 'utf8')
  files.forEach((file) => {
    const filePath = path.join(p, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      getFiles(filePath, all)
    } else {
      all.push(filePath)
    }
  })
  return all
}

let matchedCount = 0

const getResult = (allFiles) => {
  let result = []
  let required = []
  allFiles.forEach((file) => {
    try {
      fileString = fs.readFileSync(file, 'utf8')
      const match = fileString.match(charReg)
      if (match) {
        matchedCount++
        match.forEach((chars) => {
          result.push({
            "文件名称": file,
            "中文内容": chars,
            "类型": path.extname(file).substr(1),
          })
        })
      }
      if (!excludeRequire) {
        const requiredMatch = fileString.match(reqReg)
        if (requiredMatch) {
          requiredMatch.forEach((req) => {
            let reqPath = `${req.slice(9, -2)}${req.indexOf('.js') > -1 ? '' : conf.requiredExt}`
            const aliasMatch = reqPath.match(aliasReg)
            if (aliasMatch && conf.alias[aliasMatch[1]]) {
              reqPath = reqPath.replace(aliasReg, `${conf.alias[aliasMatch[1]]}/`)
              reqPath = path.join(conf.basePath, reqPath)
            } else {
              reqPath = path.join(path.dirname(file), reqPath)
            }
            let inside = false
            for (let i = 0; i < directories.length; i++) {
              const relative = path.relative(directories[i], reqPath)
              if (relative.indexOf('..') === -1) {
                inside = true
                break
              }
            }
            !inside && required.push(reqPath)
          })
        }
      }
    } catch (err) {
      throw err
    }
  })
  return {
    result,
    required,
  }
}

const writeResult = (path, result) => {
  fs.writeFileSync(path, JSON.stringify(result), 'utf8')
}

const deleteDuplicate = (array) => {
  let uniq = []
  for (let i = 0; i < array.length; i++) {
    if (!uniq.some((u) => u["中文内容"] === array[i]["中文内容"])) {
      uniq.push(array[i])
    }
  }
  return uniq
}

let result = []
let requiredQueue = []
let requiredUniq = []
let fileCount = 0
let requireCount = 0
console.log('------Reading file names------')
directories.forEach((directory, index) => {
  let allFiles = []
  console.log(`Reading directory: ${directory}`)
  getFiles(directory, allFiles)
  fileCount += allFiles.length
  const allResult = getResult(allFiles)
  result = result.concat(allResult.result)
  requiredQueue = requiredQueue.concat(allResult.required)
})
if (!excludeRequire) {
  console.log('------Process required files------')
  // console.log(requiredQueue)
  while (requiredQueue.length) {
    requiredQueue = requiredQueue.filter((r) => {
      return !(requiredUniq.indexOf(r) > -1)
    })
    const allResult = getResult(requiredQueue)
    result = result.concat(allResult.result)
    fileCount += allResult.required.length
    requireCount += allResult.required.length
    requiredQueue = allResult.required
  }
}
console.log(`------Writing result into ${outputPath}------`)
const uniqResult = deleteDuplicate(result)
writeResult(outputPath, uniqResult)
console.log(`Total files: ${fileCount}`)
!excludeRequire && console.log(`Required files: ${requireCount}`)
console.log(`Processed files: ${matchedCount}`)
console.log(`Total result: ${uniqResult.length}.`)
console.log('------Done.------')
