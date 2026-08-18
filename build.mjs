/**
 * Build adhdgofly-dsh-ext bundles.
 *
 *  1. lib/client.js — browser bundle in the DSH client-plugin format
 *     (window.__ModuleLoader__.load({ id, factory })), matching the tsdown
 *     output of @deepseek-ai/dsh-client-ui-sidebar: CJS factory body, module
 *     exports return, compact dictionaries inlined as closure globals,
 *     react/@deepseek-ai/* left external (resolved by the browser module
 *     table). Emits lib/client.js.map served by dsh-client-modules.
 *  2. lib/index.js — host half (ESM, empty apply for v1).
 *
 * Usage: node build.mjs
 */
import * as esbuild from 'esbuild'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '.')
const outDir = path.join(root, 'lib')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'))

fs.mkdirSync(outDir, { recursive: true })

const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-settings-plugins',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/schemastery',
]

async function buildClient() {
  const enJs = fs.readFileSync(path.join(root, 'dicts', 'en.compact.json'), 'utf-8')
  const zhJs = fs.readFileSync(path.join(root, 'dicts', 'zh.compact.json'), 'utf-8')

  const banner = `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(pkg.name)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });\n\t\tvar __ADHD_DICT_EN=${enJs};\n\t\tvar __ADHD_DICT_ZH=${zhJs};`
  const footer = `\t\treturn module.exports;\n\t}\n});`

  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src', 'client', 'index.ts')],
    outfile: path.join(outDir, 'client.js'),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: 'es2020',
    minify: false,
    sourcemap: true,
    external: EXTERNALS,
    banner: { js: banner },
    footer: { js: footer },
    logLevel: 'info',
    metafile: true,
  })
  const mb = (fs.statSync(path.join(outDir, 'client.js')).size / 1024 / 1024).toFixed(1)
  console.log(`lib/client.js: ${mb}MB`)
  return result
}

async function buildHost() {
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'host', 'index.ts')],
    outfile: path.join(outDir, 'index.js'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    external: EXTERNALS,
    logLevel: 'info',
  })
  console.log('lib/index.js: host half (ESM)')
}

console.log('=== building adhdgofly-dsh-ext ===')
await buildClient()
await buildHost()
console.log('done.')
