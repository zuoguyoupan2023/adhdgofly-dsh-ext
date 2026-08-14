/**
 * DOM smoke test for lib/client.js — validates the client-plugin bundle
 * against a jsdom environment (no React needed; the bundle requires nothing).
 *
 * Usage: node .tmp/client-smoke.mjs
 */
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import vm from 'node:vm'

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost/',
})
const { window } = dom

// Make globals available inside the bundle.
const context = vm.createContext(window)
window.__ModuleLoader__ = {
  load(handoff) {
    globalThis.__factory = handoff.factory
    globalThis.__bundleId = handoff.id
  },
}

const code = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf-8')
vm.runInContext(code, context)

if (globalThis.__bundleId !== 'adhdgofly-dsh-ext') throw new Error(`bad bundle id: ${globalThis.__bundleId}`)
const factory = globalThis.__factory
const reactStub = {
  createElement: () => null,
  useState: () => [null, () => {}],
  useEffect: () => {},
  Fragment: Symbol('Fragment'),
  default: undefined,
}
const makeRequire = () => (spec) => {
  if (spec === 'react') return reactStub
  throw new Error(`unexpected require: ${spec}`)
}
const plugin = factory(makeRequire())
console.log('plugin exports:', Object.keys(plugin))

// ── fake ctx ────────────────────────────────────────────────────
const listeners = new Map()
const ctx = {
  get(name) { return undefined }, // no theme service → fallback path
  on(name, cb) { listeners.set(name, cb); return () => listeners.delete(name) },
  effect(fn) { this._dispose = fn() },
  off() {},
}

// ── run apply with config (mimics Loader callback(ctx, config)) ──
plugin.apply(ctx, { enabled: true, languages: ['en', 'zh'], minWordLength: 2, decorationStyle: 'color', posFilter: ['n', 'v', 'a', 'o'] })

// ── build a conversation container with a message ───────────────
const scroll = window.document.createElement('div')
scroll.setAttribute('data-conversation-scroll', '')
const msg = window.document.createElement('div')
msg.setAttribute('data-chat-anchor-key', 'm1')
const md = window.document.createElement('div')
md.textContent = 'The quick brown fox jumps over the lazy dog. 人工智能正在改变世界。'
msg.appendChild(md)
scroll.appendChild(msg)
const codeBlock = window.document.createElement('pre')
const codeText = window.document.createTextNode('const fox = "quick";')
codeBlock.appendChild(codeText)
scroll.appendChild(codeBlock)
window.document.body.appendChild(scroll)

// streaming message (should be deferred)
const streaming = window.document.createElement('div')
streaming.setAttribute('data-streaming', '')
const sText = window.document.createElement('div')
sText.textContent = 'Streaming answer words here.'
streaming.appendChild(sText)
scroll.appendChild(streaming)

// initial process: triggered via DOMContentLoaded already fired → scheduleProcess ran
// wait for debounce
await new Promise((r) => setTimeout(r, 700))

const spans = [...window.document.querySelectorAll('.adhdgofly-hl')]
console.log('spans:', spans.length)
for (const s of spans.slice(0, 12)) console.log(' ', s.dataset.pos, JSON.stringify(s.textContent))

// assertions
const words = spans.map((s) => s.textContent)
const check = (w) => { if (!words.includes(w)) throw new Error(`missing highlight: ${w}`) }
check('quick'); check('brown'); check('fox'); check('jumps'); check('lazy'); check('dog')
check('人工智能'); check('改变'); check('世界')
// code block must NOT be highlighted
const preHl = codeBlock.querySelectorAll('.adhdgofly-hl').length
if (preHl !== 0) throw new Error('code block was highlighted!')
// streaming message must NOT be highlighted yet
if (words.includes('Streaming')) throw new Error('streaming message highlighted too early!')
if (words.includes('answer') || words.includes('words')) throw new Error('streaming words highlighted!')

// ── attribute contract (方案 A′): any element with data-adhdgofly-highlight
// is adopted regardless of the `containers` config ─────────────────────────
const adopted = window.document.createElement('div')
adopted.setAttribute('data-adhdgofly-highlight', '')
const adoptedText = window.document.createElement('p')
adoptedText.textContent = 'Adopted container with quick brown words.'
adopted.appendChild(adoptedText)
window.document.body.appendChild(adopted)
await new Promise((r) => setTimeout(r, 700))
const adoptedSpans = [...adopted.querySelectorAll('.adhdgofly-hl')].map((s) => s.textContent)
console.log('adopted container spans:', adoptedSpans)
if (!adoptedSpans.includes('quick') || !adoptedSpans.includes('brown')) {
  throw new Error('adopted container (data-adhdgofly-highlight) not highlighted: ' + JSON.stringify(adoptedSpans))
}
console.log('attribute contract OK')

// style tag + posFilter
const style = window.document.getElementById('adhdgofly-style')
if (!style) throw new Error('style tag missing')
console.log('style tag present, rules:', style.textContent.length, 'chars')

// ── end streaming → should now highlight ────────────────────────
streaming.removeAttribute('data-streaming')
// mutation observer fires on attribute change → debounce
await new Promise((r) => setTimeout(r, 700))
const words2 = [...window.document.querySelectorAll('.adhdgofly-hl')].map((s) => s.textContent)
if (!words2.includes('Streaming') || !words2.includes('answer') || !words2.includes('words')) {
  throw new Error('post-stream highlight missing: ' + JSON.stringify(words2))
}
console.log('post-stream highlights OK')

// ── posFilter removal keeps text but drops color (CSS only) ─────
// simulate dark theme via matchMedia mock → palette flips to DARK
const darkMq = { matches: true, addEventListener() {}, removeEventListener() {} }
window.matchMedia = () => darkMq
const plugin2 = factory(makeRequire())
const listeners2 = new Map()
const ctx2 = {
  get() { return undefined },
  on(name, cb) { listeners2.set(name, cb); return () => listeners2.delete(name) },
  effect(fn) { this._dispose = fn() },
  off() {},
}
// new instance with dark theme active
plugin2.apply(ctx2, { enabled: true, languages: ['en', 'zh'], minWordLength: 2, decorationStyle: 'color', posFilter: ['n', 'v', 'a', 'o'] })
await new Promise((r) => setTimeout(r, 500))
const darkStyle = window.document.getElementById('adhdgofly-style').textContent
if (!darkStyle.includes('#4ade80')) throw new Error('dark palette missing (#4ade80)')
console.log('dark palette OK')

// update config → posFilter ['n'] only → v/a/o rules get color:inherit !important
plugin2.updateConfig({ posFilter: ['n'], languages: ['en', 'zh'] })
const filteredStyle = window.document.getElementById('adhdgofly-style').textContent
if (!filteredStyle.includes('[data-pos="v"]{color:inherit!important')) throw new Error('posFilter rule missing for v')
if (!filteredStyle.includes('[data-pos="a"]{color:inherit!important')) throw new Error('posFilter rule missing for a')
console.log('posFilter rules OK')

// decorationStyle highlight → background/border rules
plugin2.updateConfig({ decorationStyle: 'highlight', posFilter: ['n', 'v', 'a', 'o'] })
const hlStyle = window.document.getElementById('adhdgofly-style').textContent
if (!hlStyle.includes('background:rgba') || !hlStyle.includes('border:1px solid rgba')) throw new Error('highlight style missing')
console.log('decorationStyle highlight OK')

ctx2._dispose?.()
ctx._dispose?.()
console.log('SMOKE TEST PASSED')
