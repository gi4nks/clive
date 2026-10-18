import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mainPath = path.join(root, 'src-tauri/src/main.rs')
const contractPath = path.join(root, 'frontend/src/api.ts')
const rustCommandsRoot = path.join(root, 'src-tauri/src')
const errors = []

function matching(source, start, open, close) {
  let depth = 0
  let quote = null
  let escaped = false
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === '`') {
      quote = char
      continue
    }
    if (char === open) depth++
    if (char === close && --depth === 0) return i
  }
  throw new Error(`Unclosed ${open} delimiter`)
}

function splitTopLevel(source, delimiter = ',') {
  const parts = []
  let start = 0
  let round = 0
  let curly = 0
  let square = 0
  let angle = 0
  let quote = null
  let escaped = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === '`') { quote = char; continue }
    if (char === '(') round++
    else if (char === ')') round--
    else if (char === '{') curly++
    else if (char === '}') curly--
    else if (char === '[') square++
    else if (char === ']') square--
    else if (char === '<') angle++
    else if (char === '>') angle--
    else if (char === delimiter && round === 0 && curly === 0 && square === 0 && angle === 0) {
      parts.push(source.slice(start, i).trim())
      start = i + 1
    }
  }
  const tail = source.slice(start).trim()
  if (tail) parts.push(tail)
  return parts
}

function camelCase(name) {
  return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

const main = fs.readFileSync(mainPath, 'utf8')
const handlerStart = main.indexOf('tauri::generate_handler![')
if (handlerStart < 0) throw new Error('Cannot find Tauri generate_handler! registration')
const listStart = main.indexOf('[', handlerStart)
const listEnd = matching(main, listStart, '[', ']')
const registered = new Set(
  splitTopLevel(main.slice(listStart + 1, listEnd))
    .map((entry) => entry.trim().split('::').at(-1))
    .filter(Boolean),
)

const rustFunctions = new Map()
const rustStructs = new Map()
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) visit(fullPath)
    else if (entry.name.endsWith('.rs')) {
      const source = fs.readFileSync(fullPath, 'utf8')
      const structPattern = /(?:pub\s+)?struct\s+(\w+)\s*\{/g
      for (const match of source.matchAll(structPattern)) {
        const open = source.indexOf('{', match.index + match[0].length - 1)
        const close = matching(source, open, '{', '}')
        const structBody = source.slice(open + 1, close)
        const fields = [...structBody.matchAll(/^\s*(?:pub\s+)?([a-z][a-z0-9_]*)\s*:/gm)]
          .filter((field) => {
            const prefix = structBody.slice(0, field.index)
            const lineStart = prefix.lastIndexOf('\n') + 1
            const attrLineStart = structBody.lastIndexOf('\n', Math.max(0, lineStart - 2)) + 1
            const previousLine = structBody.slice(attrLineStart, lineStart)
            return !/serde\([^)]*skip_serializing/.test(previousLine)
          })
          .map((field) => camelCase(field[1]))
          .sort()
        rustStructs.set(match[1], { fields, file: path.relative(root, fullPath) })
      }
      const commandPattern = /#\[tauri::command(?:\([^\]]*\))?\]\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(/g
      for (const match of source.matchAll(commandPattern)) {
        const open = source.indexOf('(', match.index + match[0].length - 1)
        const close = matching(source, open, '(', ')')
        const params = splitTopLevel(source.slice(open + 1, close))
          .filter((param) => !/:\s*(?:tauri::AppHandle|(?:tauri::)?State\s*<)/.test(param))
          .map((param) => {
            const separator = param.indexOf(':')
            return { name: camelCase(param.slice(0, separator).trim()), type: param.slice(separator + 1).trim() }
          })
          .filter((param) => param.name)
        const arrow = source.indexOf('->', close)
        const body = source.indexOf('{', close)
        const returnType = arrow >= 0 && arrow < body ? source.slice(arrow + 2, body).trim() : '()'
        rustFunctions.set(match[1], { params, returnType, file: path.relative(root, fullPath) })
      }
    }
  }
}
visit(rustCommandsRoot)

const api = fs.readFileSync(contractPath, 'utf8')
const contractStart = api.indexOf('export interface TauriCommandMap {')
if (contractStart < 0) throw new Error('TauriCommandMap is missing from frontend/src/api.ts')
const bodyStart = api.indexOf('{', contractStart)
const bodyEnd = matching(api, bodyStart, '{', '}')
const contract = new Map()
for (const line of api.slice(bodyStart + 1, bodyEnd).split('\n')) {
  const entry = line.match(/^\s{2}([a-z][a-z0-9_]*):\s*\{ args: (.*) \},?$/)
  if (!entry) continue
  const [, name, argsAndResult] = entry
  const resultMarker = argsAndResult.lastIndexOf('; result:')
  if (resultMarker < 0) throw new Error(`Result type missing for ${name}`)
  const argsSource = argsAndResult.slice(0, resultMarker).trim()
  const resultType = argsAndResult.slice(resultMarker + '; result:'.length).replace(/\s*}$/, '').trim()
  const argStart = argsSource.indexOf('{')
  if (argStart < 0) throw new Error(`Arguments for ${name} must be an object type`)
  const argEnd = matching(argsSource, argStart, '{', '}')
  const args = splitTopLevel(argsSource.slice(argStart + 1, argEnd), ';')
    .map((field) => {
      const separator = field.indexOf(':')
      const key = field.slice(0, separator).trim()
      return { name: key.replace(/\?$/, ''), optional: key.endsWith('?'), type: field.slice(separator + 1).trim() }
    })
    .filter((field) => field.name)
    .sort((a, b) => a.name.localeCompare(b.name))
  contract.set(name, { args, result: resultType.trim() })
}

const tsInterfaces = new Map()
for (const match of api.matchAll(/(?:export\s+)?interface\s+(\w+)\s*\{/g)) {
  const open = api.indexOf('{', match.index + match[0].length - 1)
  const close = matching(api, open, '{', '}')
  const fieldsSource = api.slice(open + 1, close)
  const fieldPattern = /\b([A-Za-z][A-Za-z0-9_]*)\??\s*:\s*([^;\n}]+)/g
  const matches = [...fieldsSource.matchAll(fieldPattern)]
  const fields = matches.map((field) => field[1]).sort()
  const types = matches.map((field) => field[2])
  tsInterfaces.set(match[1], { fields, types })
}

function rustTypeToTs(type, optionalArgument = false) {
  const compact = type.replace(/\s+/g, '')
  if (compact.startsWith('Result<') && compact.endsWith('>')) {
    return rustTypeToTs(splitTopLevel(compact.slice(7, -1))[0])
  }
  if (compact.startsWith('Vec<') && compact.endsWith('>')) {
    const inner = compact.slice(4, -1)
    if (inner.startsWith('(') && inner.endsWith(')')) {
      return `[${splitTopLevel(inner.slice(1, -1)).map(rustTypeToTs).join(', ')}][]`
    }
    return `${rustTypeToTs(inner)}[]`
  }
  if (compact.startsWith('Option<') && compact.endsWith('>')) {
    const inner = rustTypeToTs(compact.slice(7, -1), optionalArgument)
    return optionalArgument ? inner : `${inner} | null`
  }
  if (compact === '()') return 'void'
  if (compact === 'String' || compact === '&str') return 'string'
  if (/^(u|i)(8|16|32|64|128|size)$/.test(compact) || compact === 'f32' || compact === 'f64') return 'number'
  if (compact === 'bool') return 'boolean'
  if (compact === 'PlanOpInput') return 'ApplyPlanOp'
  if (compact === 'FileTagsUpdate') return 'FileTagUpdate'
  return compact.replace(/^.*::/, '')
}

function compareSets(label, left, right) {
  const missing = [...left].filter((value) => !right.has(value)).sort()
  const extra = [...right].filter((value) => !left.has(value)).sort()
  if (missing.length || extra.length) {
    if (missing.length) errors.push(`${label}: missing ${missing.join(', ')}`)
    if (extra.length) errors.push(`${label}: extra ${extra.join(', ')}`)
  }
}

compareSets('Registered commands vs TypeScript contract', registered, new Set(contract.keys()))
compareSets('Registered commands vs Rust implementations', registered, new Set(rustFunctions.keys()))
for (const name of registered) {
  const rust = rustFunctions.get(name)
  const ts = contract.get(name)
  if (!rust || !ts) continue
  const rustArgs = [...rust.params].sort((a, b) => a.name.localeCompare(b.name))
  const rustNames = rustArgs.map((arg) => arg.name)
  const tsNames = ts.args.map((arg) => arg.name)
  if (rustNames.join('\0') !== tsNames.join('\0')) {
    errors.push(`${name}: Rust args [${rustNames.join(', ')}] do not match TypeScript args [${tsNames.join(', ')}] (${rust.file})`)
  }
  for (const rustArg of rustArgs) {
    const tsArg = ts.args.find((arg) => arg.name === rustArg.name)
    if (!tsArg) continue
    const rustArgType = rustTypeToTs(rustArg.type, tsArg.optional).replace(/\s+/g, '')
    const tsArgType = tsArg.type.replace(/\s+/g, '').replace(/'[^']+'(?:\|'[^']+')+/g, 'string')
    if (rustArgType !== tsArgType) {
      errors.push(`${name}.${rustArg.name}: Rust type ${rustArgType} does not match TypeScript type ${tsArg.type} (${rust.file})`)
    }
  }
  const rustResult = rustTypeToTs(rust.returnType)
  const tsResult = ts.result.replace(/\s+/g, '')
  if (rustResult.replace(/\s+/g, '') !== tsResult) {
    errors.push(`${name}: Rust result ${rustResult} does not match TypeScript result ${ts.result} (${rust.file})`)
  }
}

const rustNameForTs = { ApplyFailedOp: 'FailedOp', ZipEntryInfo: 'ZipEntry' }
const checkedDtos = new Set()
const pendingDtos = []
for (const name of registered) {
  const rustType = rustFunctions.get(name)?.returnType ?? ''
  for (const [, typeName] of rustType.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
    if (tsInterfaces.has(typeName)) pendingDtos.push(typeName)
  }
}
while (pendingDtos.length) {
  const tsName = pendingDtos.pop()
  if (checkedDtos.has(tsName)) continue
  checkedDtos.add(tsName)
  const tsDto = tsInterfaces.get(tsName)
  const rustName = rustNameForTs[tsName] ?? tsName
  const rustDto = rustStructs.get(rustName)
  if (!tsDto || !rustDto) {
    errors.push(`DTO ${tsName}: matching Rust struct ${rustName} was not found`)
    continue
  }
  const missingWireFields = tsDto.fields.filter((field) => !rustDto.fields.includes(field))
  if (missingWireFields.length) {
    errors.push(`DTO ${tsName}: Rust is missing TypeScript fields [${missingWireFields.join(', ')}] (${rustDto.file})`)
  }
  for (const fieldType of tsDto.types) {
    for (const [, nested] of fieldType.matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)) {
      if (tsInterfaces.has(nested) && !checkedDtos.has(nested)) pendingDtos.push(nested)
    }
  }
}

if (errors.length) {
  console.error(`Tauri contract check failed:\n- ${errors.join('\n- ')}`)
  process.exit(1)
}
console.log(`Tauri contract OK: ${registered.size} commands, argument names/types and result types match Rust; ${checkedDtos.size} frontend DTOs have required fields verified.`)
