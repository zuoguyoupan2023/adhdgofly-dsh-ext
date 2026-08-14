# 001 — adhdgofly-ide-ext 移植参考（给 adhdgofly-dsh-ext 实现用）

> 用途：让一个**没有本对话上下文的新会话**（或协作者）不用通读 ide-ext 源码，就能准确移植其高亮机制。本文是**蒸馏参考**，标注了每个可复用文件的职责、关键函数签名与行为、以及需要改造/跳过的点。原始源码以本机路径为准（下述 `ide-ext/` 均指 `/Users/burenweiye/Documents/GitHub/adhdgofly-ide-ext`）。

---

## 0. 一句话结论

ide-ext = **纯逻辑分词引擎（可整体复制） + 词典数据（构建期压缩） + 两个渲染适配层（编辑器 Decoration / 预览 DOM，DSH 只需要后者）**。DSH 端只移植：引擎 + 压缩词典 + 预览式 DOM 高亮器；词典合并逻辑抽成纯函数；AI 调用模式照抄 `aiJudge.ts`。

---

## 1. 目录地图（只列与移植相关的部分）

```
ide-ext/
├── src/
│   ├── highlightEngine/        ← 【整体复制】纯逻辑，零 vscode import
│   │   ├── types.ts            Segment / DecoratedWord / PosColorClass / SupportedLang
│   │   ├── language.ts         isSpaceDelimited / detectLanguage / detectLanguageSegments
│   │   ├── lemmatizer.ts       lookupWithLemma（英文后缀还原 + 黑名单）
│   │   ├── matcher.ts          matchSegments（POS → 颜色类 + posFilter）
│   │   ├── segmenter.ts        segmentMixed（逐字符分发：ASCII 块 / CJK 正向最大匹配）
│   │   └── index.ts            HighlightEngine.process + sanitizeCodeBlocks
│   ├── preview/
│   │   └── highlighter.ts      【移植蓝本】浏览器 DOM 高亮器（TreeWalker + MutationObserver）
│   ├── dictionary/
│   │   ├── types.ts            RawDictEntry / RawDictionary / DictMap / CommunityDictMeta
│   │   ├── loader.ts           normalizeDictionary（词条规范化）
│   │   ├── merger.ts           mergeDicts（逐层覆盖合并，后层优先）
│   │   └── manager.ts          【参考】多词典分层合并 + 缓存 + 禁用（vscode 适配，不移植）
│   ├── vscode/
│   │   ├── decorator.ts        【参考】POS_COLORS 双色板 / decorationStyle / posFilter 即时切换
│   │   ├── aiJudge.ts          【移植】OpenAI 兼容调用模式（智能模式 LLM 接入直接用）
│   │   ├── config.ts           adhdgofly.* 设置读取（vscode 配置，DSH 改用自己的设置）
│   │   ├── activationGuard.ts  【跳过】大文件/文档类型守卫（vscode 专用）
│   │   └── textMate.ts         【跳过】代码文件注释/字符串范围（vscode 专用，DSH 无代码编辑器）
│   └── extension.ts            【参考】生命周期/命令注册
├── scripts/build-preview.mjs   【移植】压缩词典 + 浏览器 bundle 构建（esbuild）
├── dictionaries/               EN_word.json(~4.8MB) / ZH_word.json(~10MB) 大词典，勿直读
└── out/preview/highlighter.js  构建产物示例（含内嵌压缩词典，~8.2MB 未压缩）
```

---

## 2. 纯引擎（逐文件行为，复制后即可用）

### types.ts
- `Segment { word, start, end, is_in_dict, pos }`（pos 为逗号分隔字符串如 `"v,n"`）
- `DecoratedWord { word, start, end, pos, colorClass }`
- `PosColorClass = 'pos-n' | 'pos-v' | 'pos-a' | 'pos-other'`
- `SupportedLang = 'en' | 'zh' | 'fr' | 'es' | 'ru' | 'ja'`

### language.ts
- `isSpaceDelimited(lang)`：en/fr/es/ru 为空格分隔，其余（zh/ja）为 CJK。
- `detectLanguage(text)`：CJK 占比 >30% 判 zh/ja，西里尔 >30% 判 ru，否则 en。
- `detectLanguageSegments(text)`：按段落（`\n{2,}` 分隔）分组；DSH DOM 高亮用不到（逐文本节点处理），可跳过。

### lemmatizer.ts
- `lookupWithLemma(word, dict)`：小写直查 → 后缀剥离（tion/ing/est/ness/ment/able/ible/ful/less/ly/er/ed/es/s）→ 补 e → 双写辅音去重；BLACKLIST 防错。**仅 en 启用**。

### matcher.ts
- `POS_COLOR_MAP`（重要，须与压缩词典的 posToKey 保持一致）：
  `n→pos-n`、`v→pos-v`、`adj/a/adv→pos-a`、`d(副词)→pos-a`、`nr/ns/nt/nz/t→pos-n`、其余→`pos-other`
- `matchSegments(segments, minWordLength, posFilter)`：过滤 `!is_in_dict || !pos`、词长 < minWordLength、posFilter（n/v/a/other 键）。

### segmenter.ts（核心）
- `segmentMixed(text, latinDict, cjkDict, enEnabled, maxLen=8)`：**逐字符**分发——
  - 空白/标点（`\p{P}`）跳过；非 CJK 非 ASCII（emoji 等）跳过；
  - ASCII 连续块 → 小写 → `enEnabled ? lookupWithLemma : 直查` → Segment；
  - CJK → 正向最大匹配（maxLen 默认 8），命中即整词入段，未命中单字兜底（`is_in_dict:false`）。
- **偏移为 UTF-16 code unit**（与 DOM/JS 字符串一致，务必保持）。
- 另有 `segmentSpaceDelimited` / `segmentCJK` / `segmentText`（混合入口之外的单语言版本，可一并复制）。

### index.ts
- `sanitizeCodeBlocks(text)`：围栏代码块与行内代码替换为空格（**保换行保偏移**）。
- `HighlightEngine.process(text, {languages, minWordLength, posFilter})`：按空格分隔/CJK 分组取合并词典 → `segmentMixed` → `matchSegments`。
- **DSH 用法**：可不实例化引擎，直接调 `segmentMixed(text, mergedLatinDict, mergedCjkDict, enEnabled)` + 自己的筛选，返回的 start/end 直接对应文本节点内容。

---

## 3. 词典层

### 3.1 原始格式（`docs/006-dict-format.md` 摘要）
```json
{ "version": "1.0", "lastUpdated": "YYYY-MM-DD",
  "words": { "hello": { "pos": ["interj"] }, "world": { "pos": ["n"] } } }
```
- 词性代码：`n/v/adj/a/adv/prep/conj/pron/num/mw/interj/part/aux/det/other`。
- 生态通用格式（dict-app / ide-ext / 浏览器扩展互通）。

### 3.2 规范化（loader.ts）
- `normalizeDictionary(raw)`：`word.toLowerCase() → { pos: entry.pos }`（DictMap）。

### 3.3 合并（merger.ts）
- `mergeDicts(...layers)`：**后层覆盖前层**（同词整体替换 entry）。优先级 builtin → community → user（user 最高）。

### 3.4 多词典管理（manager.ts，vscode 适配层，**只参考不移植**）
- `getMergedDict(langs)`：按语言合并 + `mergeCache` 缓存；`setDisabledDicts(ids)` 黑名单禁用并使缓存失效。
- 层级：builtin（内置 en/zh）→ community（下载/导入）→ userAdded（用户增词/自建）。
- **DSH 移植**：抽成纯函数 `mergeDicts`（已有）+ 一个简单的 `DictRegistry`（按语言分组、启用集、缓存），不必搬整个 manager。

### 3.5 压缩词典（build-preview.mjs，浏览器用）
- 逻辑：读原始 `dictionaries/<LANG>_word.json` → 每条词取 `entry.pos[0]` 经 `posToKey()` 映射 → 输出 `word → "n"|"v"|"a"|"o"`。
- **posToKey 必须与 matcher.ts 的 POS_COLOR_MAP 同步**：
  ```
  n/nr/ns/nt/nz/t → 'n'；v → 'v'；adj/a/adv/d → 'a'；其余 → 'o'
  ```
- 产物大小：EN+ZH 压缩后 ≈ 8MB（未压缩，含代码）；minify+gzip 后显著减小。
- 构建：esbuild 打 `src/preview/highlighter.ts`，用 `banner` 把两个词典以 `var __ADHD_DICT_EN=...;var __ADHD_DICT_ZH=...` 内联进产物。
- **DSH 移植**：build 脚本照抄（换输出目标与 banner 名）；词典源仍从 ide-ext 的 `dictionaries/*.json` 读取（构建期依赖，可配 IDE_EXT_ROOT 环境变量）。

---

## 4. 浏览器高亮器（preview/highlighter.ts，移植蓝本）

| 部分 | 行为 | DSH 端改造点 |
|---|---|---|
| `DARK/LIGHT_PALETTE` | `{n:#4ade80, v:#f87171, a:#a78bfa, o:#9ca3af}` / `{n:#059669, v:#dc2626, a:#7c3aed, o:#6b7280}` | 配色沿用；明暗判定改为 DSH 主题信号 |
| `SKIP_TAGS` | `PRE/CODE/SCRIPT/STYLE` | 增加 `.markdown-code-block` 等 DSH 代码块类名 |
| `getTextNodes` | TreeWalker 取文本节点（跳过祖先 SKIP_TAGS、空/纯空白、已高亮节点） | 容器从 `.markdown-body` 改为 DSH 对话内容区选择器 |
| `processAll` | 每节点 `segmentMixed` → 命中词包 `<span class="adhdgofly-hl" data-pos>`；`processing` 重入锁；结束后重挂 observer | 加 300–500ms 防抖；流式期间跳过 |
| `MutationObserver` | childList+subtree+characterData 触发重处理 | 同左 + 防抖 |
| `themeObserver` | 监听 body class 变化 → `refreshThemeColors` 原地改色 | 改为 DSH 主题信号（`--dsw-*` 变量 / Theme service） |
| `applyPosFilter` | 注入 `<style>`：`[data-pos="n"]{color:inherit!important;...}` 实现"文字保留、颜色移除"的即时筛选 | 同左（可扩展 `[data-src]` 做三模式 sourceFilter） |
| `readFilterFromDocument` | 通过隐藏 HTML 注释传筛选状态（VS Code CSP 妥协方案） | **DSH 不需要**（客户端有原生通信） |

要点：
- 高亮处理的是**渲染后 DOM 文本**，偏移直接对应文本节点，无"markdown 源码偏移→DOM 偏移"映射问题。
- 重复处理防护：span 自带 `adhdgofly-hl` 类，`getTextNodes` 拒绝其子节点；WeakSet 可再加一层。

---

## 5. 编辑器层（decorator.ts，不移植，仅取参考值）

- `POS_COLORS`（深/浅双色板，含 color/bg/border 三值）：pos-n `#4ade80/#059669`、pos-v `#f87171/#dc2626`、pos-a `#c084fc/#7c3aed`、pos-other `#9ca3af/#6b7280`；bg 为同色 15% 透明、border 35%。
- `decorationStyle`：`color`（文字变色，默认）/ `highlight`（背景框 + 边框）。
- **posFilter 即时切换**（关键体验）：先按全部词性算好 range 缓存（`lastRangesByClass`），切筛选只做 `setDecorations(空/非空)`，O(1) 不重算。DSH DOM 版对应物 = `applyPosFilter` 的 CSS 覆盖（已具备）。
- `MAX_DECORATIONS = 5000`：编辑器上限；DSH DOM 版无此 API 限制，但 span 数量仍需注意性能（长消息分片）。

---

## 6. AI 判定（aiJudge.ts，智能模式直接移植）

OpenAI 兼容调用模式（`judgePosByProvider`）：
- `POST {provider.apiUrl}`，body：`{ model, messages: [{role:'system', content: JUDGE_PROMPT}, {role:'user', content}], temperature: 0.1, max_tokens }`；
- headers：`Content-Type: application/json` + `Authorization: Bearer <apiKey>`；
- 解析：`data.choices[0].message.content` → 正则抓 `{...}` → `JSON.parse` → 取 `pos` 数组；
- 提供商模型：`AiProvider { name, apiUrl, apiKey, model, isPrimary }`（来自 vscode 设置）。
- **智能模式改造**：提示词从"单词词性判定"换成"对话关键词抽取（增量 JSON schema）"；apiUrl/key/model 改从 DSH 设置/凭据读取（见规划 §10.3.1）。

---

## 7. 配置面（vscode 设置 → DSH 设置的对应）

| ide-ext 设置（默认） | 含义 | DSH 端对应 |
|---|---|---|
| `adhdgofly.enabled` (true) | 总开关 | `enabled` |
| `adhdgofly.languages` (["en","zh"]) | 启用词典语言 | `languages` |
| `adhdgofly.minWordLength` (2) | 最小词长 | `minWordLength` |
| `adhdgofly.decorationStyle` ("color") | 变色/背景框 | `decorationStyle` |
| `adhdgofly.highlightFontSize` (1.0) | 高亮强度（font-weight 0.8–1.5） | 可选 |
| `adhdgofly.posFilter` (all) | 词性筛选 | `posFilter` |
| `adhdgofly.disabledDicts` ([]) | 禁用词典 | `enabledDicts`（反向） |
| `adhdgofly.aiEnabled` (true) | AI 词性判定 | 智能模式 `autoRefresh` 等 |

---

## 8. 移植清单（对照表）

| 项 | 动作 | 目标文件（adhdgofly-dsh-ext） |
|---|---|---|
| highlightEngine/*（6 个 ts） | 原样复制 | `src/client/engine/`（或共享 `src/engine/`） |
| build-preview.mjs 的 posToKey + dict 生成 | 改写 | `scripts/build-dicts.mjs` |
| esbuild 浏览器打包 | 改写输出格式（`window.__ModuleLoader__.load` 包裹、react/@deepseek-ai 外部化） | `build.mjs` |
| preview/highlighter.ts | 移植（容器/主题/防抖/跳过锚点） | `src/client/highlighter.ts` |
| merger.ts（mergeDicts） | 原样复制 | `src/engine/merger.ts` |
| loader.ts（normalizeDictionary） | 复制去 vscode | `src/engine/loader.ts` |
| manager.ts | 不移植，抽象 `DictRegistry`（语言分组+启用集+缓存） | `src/keywords/dictRegistry.ts` |
| aiJudge.ts | 复制改造（提示词/设置源） | `src/host/llmKeywords.ts` |
| decorator.ts POS_COLORS | 取值复制 | `src/client/palette.ts` |
| config.ts / activationGuard / textMate / sidePanel / batch | 跳过 | — |

## 9. 性能与正确性注意

- **UTF-16 偏移**：segmentMixed 的 start/end 就是 JS 字符串下标，包 span 时 `text.slice(seg.start, seg.end)` 直接可用，勿换算。
- **sanitizeCodeBlocks**：编辑器场景需要；DOM 场景靠 SKIP_TAGS/选择器跳过代码节点，一般不需要对文本做 sanitize（但若从"消息原文"抽取关键词，仍需用它清洗）。
- **重复处理**：MutationObserver 会因自己包 span 再次触发——用 `processing` 锁 + span 类名过滤已覆盖；DSH 版务必保留。
- **大文本**：编辑器版有大文件可见区优化；DOM 版对超长消息可先只处理视口内节点（IntersectionObserver）或分片（requestIdleCallback）。

## 10. 相关 ide-ext 文档索引（需要时按需翻阅）

- `docs/000-ide-extension.md` —— 完整架构规划（含三区分析/词典设计背景）
- `docs/006-dict-format.md` —— 词典 JSON 格式规范（生态互通）
- `docs/008/009-*.md` —— 批量处理设计/实现（DSH 不需要）
- `docs/012-markdown-preview-highlighting.md` —— 预览高亮方案（与 DSH 思路最接近）
- `docs/013-dual-theme-preview-colors.md` —— 双色板设计（配色来源）
