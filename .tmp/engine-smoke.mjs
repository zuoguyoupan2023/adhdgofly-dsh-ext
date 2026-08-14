import * as esbuild from 'esbuild'
import fs from 'node:fs'
const src = `
import { process, sanitizeCodeBlocks } from './src/engine/index.ts'
import en from './dicts/en.compact.json'
import zh from './dicts/zh.compact.json'
const text = 'The quick brown fox jumps over the lazy dog. 中文测试：人工智能正在改变世界。'
const hits = process(text, en, zh, true, { minWordLength: 2, posFilter: ['n','v','a','o'] })
console.log('sanitize:', JSON.stringify(sanitizeCodeBlocks('a \`code\` and \\\`\\\`\\\`js\\nlet x\\n\\\`\\\`\\\` done')))
for (const h of hits) console.log(h.word, h.start, h.end, h.pos, h.colorClass, '=>', JSON.stringify(text.slice(h.start, h.end)))
`
const out = await esbuild.build({ stdin: { contents: src, resolveDir: '.', loader: 'ts' }, bundle: true, write: false, platform: 'browser', format: 'esm', logLevel: 'error' })
fs.writeFileSync('.tmp/engine-smoke.js', out.outputFiles[0].text)
