# 000 — adhdgofly-dsh-ext 规划文档

> 目标：在 **adhdgofly-ide-ext** 的基础上，创建一个可安装进 DeepSeek Harness（DSH）的插件 **adhdgofly-dsh-ext**，把 ADHDGoFly 的词性高亮机制搬进 DSH 的 Web 界面（对话消息、Deliverables 等 Markdown 渲染区），并保留色板、词性筛选等核心体验。
>
> 文档状态：调研已完成，方案待评审。实现前请用 `cordis_inspect_*` 工具复核文末"开放问题"中的 API 细节（DSH 为 0.1.0-rc.6，接口可能演进）。

---

## 一、背景与生态定位

```
ADHDGoFly 生态
├── dict-app（Tauri 桌面工具）           —— Rust 分词 / 词典生产
├── adhdgoflyplugin（浏览器扩展）        —— Content Script 高亮网页
├── adhdgofly-ide-ext（VS Code 扩展）    —— 本规划的直接基础
│     ├── highlightEngine/               纯逻辑，零 vscode 依赖 ← 直接复用
│     ├── preview/highlighter.ts         浏览器 DOM 高亮器 ← 移植蓝本
│     ├── vscode/decorator.ts            编辑器 Decoration 层（DSH 中不需要）
│     ├── dictionary/manager.ts          词典多层管理（DSH 中按需裁剪）
│     └── dictionaries/*.json             英汉词典（大文件，勿直读）
└── adhdgofly-dsh-ext（本项目，新增）
      └── DSH Web 客户端插件：对话 / 文档 Markdown 渲染区词性着色
```

**范围（In scope）**
- 在 DSH Web 界面中，对**已渲染的 Markdown 文本**（对话消息、Deliverables 等）做词性高亮：名词绿、动词红、形容词/副词紫、其他灰。
- 深色/浅色自适应色板；名/动/形/其他 词性筛选（高亮即时开关）。
- 通过 `dsh plugin --profile web add ...` 安装；插件自带 patch（bundle），一条命令完成安装。

**非目标（Out of scope，v1 不做）**
- 代码编辑器式逐行装饰（DSH 没有代码编辑器）。
- AI 词性判定、社区词典下载、自建词典等 DictionaryManager 全量能力（留 host 侧扩展位）。
- DSH agent skill（技能是给模型的指令，与 UI 高亮无关，另立项目）。
- 修改 DSH 自身源码（本项目是纯插件，不改 harness）。

---

## 二、现状调研摘要（关键事实）

### 2.1 adhdgofly-ide-ext 的高亮机制

- **纯逻辑引擎**（`src/highlightEngine/*`，零 vscode import，可整体复制）：
  - `segmenter.ts`：`segmentMixed()` 逐字符分发——ASCII 连续块查拉丁词典（英文走 `lemmatizer.ts` 词形还原），CJK 走正向最大匹配（BMM，maxLen=8）；emoji/标点跳过。偏移基于 UTF-16 code unit，与编辑器/DOM 一致。
  - `matcher.ts`：POS → 颜色类映射（`n→pos-n`、`v→pos-v`、`adj/a/adv/d→pos-a`、`nr/ns/nt/nz/t→pos-n`、其余→`pos-other`）。
  - `index.ts`：`HighlightEngine.process(text, config)` 编排；`sanitizeCodeBlocks()` 剔除围栏/行内代码（保换行保偏移）。
- **词典数据**：`dictionaries/EN_word.json`、`ZH_word.json`（word → `{pos:[]}`，约 4.8MB / 10MB）。浏览器端用**压缩形态**：`scripts/build-preview.mjs` 把每条词压缩为 `word → "n"/"v"/"a"/"o"`（posToKey 映射与 matcher 同步），与高亮代码一起打进 `out/preview/highlighter.js`（约 8.2MB，未压缩；gzip 后可显著减小）。
- **编辑器层**（`src/vscode/decorator.ts`）：VS Code `DecorationType` + 深/浅双色板（`POS_COLORS`）；`decorationStyle`（color / 背景框）；posFilter 通过缓存 range 实现 O(1) 即时切换；大文件只处理可见区。
- **预览层**（`src/preview/highlighter.ts`）——**本项目移植蓝本**：
  - `TreeWalker` 取文本节点（跳过 `PRE/CODE/SCRIPT/STYLE` 祖先），对每段文本跑 `segmentMixed`，把命中的词包成 `<span class="adhdgofly-hl" data-pos="...">`；
  - `MutationObserver`（childList+subtree+characterData）+ `processing` 重入锁；`themeObserver` 监听 body class 变化刷新颜色；
  - `applyPosFilter()`：注入 `<style>`，用 `[data-pos="n"]{color:inherit!important}` 规则实现"文字保留、颜色移除"的即时筛选；
  - 深/浅色板：`DARK_PALETTE {n:#4ade80, v:#f87171, a:#a78bfa, o:#9ca3af}`、`LIGHT_PALETTE {n:#059669, v:#dc2626, a:#7c3aed, o:#6b7280}`。
- **数据层**（`src/dictionary/manager.ts`）：builtin → community → user 三层合并、缓存；`user-edits.json` 持久化。DSH v1 只需要"加载内置压缩词典"这一条路径。

### 2.2 DSH 的插件机制（本次调研核心）

DSH = **launcher（`dsh` CLI）→ Profile（Cordis 补丁层叠）→ 插件行**。一切能力都是 `cordis.yml` 里的一个插件行。

**Profile 与补丁层叠**
- Profile 目录：`$DSH_HOME/profiles/<name>/`。本机已有 `~/.dsh/profiles/web/`：
  - `package.json` 里 `dsh.profile.bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]`（有序 bundle 层）；
  - `cordis.patch.yml`（用户补丁层，当前为空 `[]`）——第三方插件的行插在这里或由 bundle 自带；
  - `cordis.yml` 是根（空列表，勿改）。
- 层叠顺序：各 bundle 的 patch（按 bundles 顺序）→ 本 profile `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml` → `--patch` 覆盖。**后写的行按 id 整行替换 config**（不合并）。
- 补丁语法：`- insert: [{id, name, config}]`、按 id `replace/update`、`disabled: true`；支持 `!!js` 表达式。

**Bundle（可安装层）**
- 声明在 package.json：`"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`（如 `dsh-base`、`dsh-web-app`）。
- `dsh plugin --profile web add <pkg>` = 在 profile 目录跑 `pnpm add` + **自动 reconcile**：声明了 `dsh.bundle` 的依赖自动加入 `dsh.profile.bundles`（成为补丁层）；没声明则只是普通依赖并打一条提示。支持本地路径/`link:`/`file:`（相对路径以调用目录为锚）。
- 因此：**一个带 `dsh.bundle.patch` 的插件包 = "一条命令可安装的 DSH 插件"**，安装即自动插入自己的插件行。

**插件包形态（Host / Client 双面）**
- **Host 半**：包 `main`（如 `lib/index.js`）导出 Cordis 插件 `{ apply(ctx) {...} }`，可有 `inject`（硬依赖声明）、`ctx.on()` 事件、`ctx.effect()` 副作用、Service/Tool/Slot/主题注册，停止时自动清理。纯客户端插件 host 半可为空（`dsh-client-ui-sidebar` 的 `lib/index.js` 就是 `function apply() {}`）。
- **Client 半**：package.json 里 `"dsh": { "client": { "platform": "web", "inject": [...], "immediately": bool } }`，且 `exports["./client"]` 指向**浏览器 bundle**。bundle 首行必须是：
  ```js
  window.__ModuleLoader__.load({ id: "<包名>", factory: (require) => { ... return 插件对象 } })
  ```
  - 官方包用 `tsdown` 打包（`scripts.bundle`）；`react`、`react/jsx-runtime`、`@deepseek-ai/*` peer 依赖保持**外部 require**，由浏览器模块表解析；CSS 通过 `\0dsh-css:` 虚拟模块注入 `<style data-plugin-css>`。第三方需复刻这一打包格式（详见 §5.2）。
- **浏览器加载链路**：`dsh-client-modules`（node 半）扫描**启用的 Loader 行**里带 `dsh.client` 的包 → 解析 `exports["./client"]` → 哈希进 boot 图 `window.__DSH_BOOT__` → 以 `/plugins` 路由下发 → 浏览器半把插件注册进模块表（lazy-CJS，工厂在 materialize 时才执行）。
- **Client 可用能力**（来自官方 skill `cordis-plugin-development`）：
  - `ctx.get('slots')` → `slots.inject('<slot>', () => slots.register({name, id/key}, props => React.createElement(...)))`（React 必须 `React.createElement`，无 JSX/TS）；
  - `styles.insert(css)` 注入组件样式；主题走 `Theme` service tokens（`--dsw-*` CSS 变量）；
  - `harness.handle(method, handler)`（Host）+ `host.call(method, args)`（Client）= 包私有 JSON RPC；
  - `ctx.get('timer')`（需 `inject:['timer']`）、`ctx.on('event')`；
  - 严格禁止 `import`/JSX/TS/全局 `window`/`document` 直改、`JSON.stringify` 内部对象等。
- **设置项**：`settings.section`（完整设置页）与 `settings.general.item`（单项）两个入口；设置数据由 host 侧 `dsh-settings-file` 持久化。
- **Markdown 渲染**：对话消息用 `dsh-client-ui-primitives` 的 `MarkdownText`（micromark → mdast → React，增量流式解析，`streaming` 标志）；**管线内部私有，第三方插件无公开扩展点**——因此高亮只能走**渲染后 DOM 后处理**（即移植 preview 方案）。代码块类名含 `markdown-code-block`（可作跳过锚点）。
- **动态插件**（运行时 `cordis_define`/`cordis_run` 工具创建）只适合临时探查；"可安装的扩展"走**静态插件包**。

---

## 三、架构决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 插件类型 | **静态 npm 包 + bundle patch** | `dsh plugin add` 一键安装，符合"在 dsh 里安装" |
| 高亮表面 | **已渲染 Markdown 的 DOM 后处理**（对话内容区 + Deliverables 等） | `MarkdownText` 无扩展点；preview 方案已被 ide-ext 验证 |
| 分词位置 | **Client 端**，压缩词典（word→posKey）嵌入 client bundle | 与 preview 机制 1:1 复用；本地加载 8MB 级 bundle 可接受；免 RPC 延迟 |
| 词典来源 | 构建时从 adhdgofly-ide-ext 的 `dictionaries/*.json` 生成压缩形态 | 复用 `build-preview.mjs` 的 posToKey 逻辑 |
| 筛选/色板 | data-pos + CSS 覆盖（`applyPosFilter` 技术）；深/浅色板沿用 adhdgofly 配色 | 即时切换、不重算 |
| 主题适配 | 监听 DSH 主题（`Theme` tokens / body class / `prefers-color-scheme`），复用双色板 | 与 ide-ext 一致的明暗体验 |
| 设置 UI | v1：行 config 默认值 + `settings.section` 设置页（enabled / languages / minWordLength / decorationStyle / posFilter） | 最小可用；host 侧 settings 持久化 |
| Host 半 | 空 `apply()` + 预留 `harness.handle('adhdgofly.*')` RPC 桩 | 为未来词典管理/AI 判定留位，v1 不实现 |

**高亮流程（client）**
```
MarkdownText 渲染完成 → MutationObserver 触发（重入锁 + 防抖）
  → 取目标容器文本节点（跳过 pre/code/自己产出的 span）
  → segmentMixed(文本, enDict, zhDict, enEnabled)   ← 纯引擎，直接复用
  → 命中词 → <span class="adhdgofly-hl" data-pos="n|v|a|o"> 包层
  → applyPosFilter()：按当前筛选注入/更新 <style> 规则
```

### 3.1 高亮目标页面（回答："在 DSH 的哪个页面生效"）

- **主战场：Web UI 的对话视图（动态窗口）**。用户消息 + 助手消息的已渲染 Markdown 全部覆盖，包括**流式输出**过程中（防抖后处理）。能力**存在**——就是 §3 的"渲染后 DOM 后处理"方案，不是做不到，只是要按 §6.1/§6.2 控制 React 协调与流式高频更新的风险。
- **次要表面**：Deliverables（agent 产出的文档卡片）、trajectory/run 卡片、user-questions 等一切用 `MarkdownText`（或同类渲染）的内容区，实现时按容器探测逐一纳入。
- **不会覆盖**：浏览器任意网页（那是 adhdgoflyplugin 浏览器扩展的职责）、代码编辑器（DSH 没有）、workspace 文件树（除非其预览走 MarkdownText 渲染）。
- 结论：**"对动态窗口做高亮"是默认能力**；远期（§十）还会让高亮内容从"预设大词典命中词"变成"本对话自动抽取的关键词"。

---

## 四、仓库与包结构（adhdgofly-dsh-ext）

```
adhdgofly-dsh-ext/
├── package.json            # 见下
├── cordis.patch.yml        # bundle patch：插入插件行
├── tsconfig.json
├── build.mjs               # client bundle 构建（复刻 tsdown 输出格式）
├── scripts/
│   └── build-dicts.mjs     # 从 adhdgofly-ide-ext dictionaries 生成压缩词典（复用 posToKey）
├── src/
│   ├── host/
│   │   └── index.ts        # Host 半：apply() + 预留 RPC 桩（编译为 lib/index.js）
│   └── client/
│       ├── highlighter.ts  # 移植 preview/highlighter.ts（改目标容器/主题/跳过锚点）
│       ├── settings.ts     # settings.section 设置页（可选）
│       └── index.ts        # 客户端插件入口：注册 slots / 启动 highlighter
├── lib/                    # 构建产物（host: index.js；client: client.js）
├── dicts/                  # 构建产物：en.compact.json / zh.compact.json（word→posKey）
└── README.md
```

**package.json 关键字段**
```jsonc
{
  "name": "adhdgofly-dsh-ext",
  "version": "0.1.0",
  "type": "module",
  "main": "lib/index.js",                     // Host 半（Cordis 插件）
  "exports": {
    ".": { "default": "./lib/index.js" },
    "./client": { "default": "./lib/client.js" } // Client 半（浏览器 bundle）
  },
  "files": ["lib", "cordis.patch.yml", "README.md", "dicts"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" }, // 一键安装 → 自动成为 profile 补丁层
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-runtime"]  // 运行期依赖，按需查证
    }
  },
  "peerDependencies": {
    "react": "^18.2.0",
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-runtime": "0.1.0-rc.6"
  }
}
```

**cordis.patch.yml（bundle 自带补丁）**
```yaml
# adhdgofly-dsh-ext bundle patch —— 在 dsh-base/dsh-web-app 之后、用户层之前应用
- insert:
    - id: adhdgofly
      name: 'adhdgofly-dsh-ext'
      config:
        enabled: true
        languages: ['en', 'zh']
        minWordLength: 2
        decorationStyle: 'color'   # color | highlight（背景框）
        posFilter: ['n', 'v', 'a']
        highlightInComments: false # DSH 无注释概念，保留字段便于后续扩展
```
用户可在 `~/.dsh/profiles/web/cordis.patch.yml` 按 id 覆盖 `config`（整行替换语义）。

---

## 五、实施步骤

### M0 脚手架
- 新建仓库，初始化 `package.json`（含上节字段）、`cordis.patch.yml`、`.gitignore`（node_modules/lib/dicts 按需取舍）。
- 确认本机 DSH 版本（`~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh/package.json` 为 0.1.0-rc.6）并把 `@deepseek-ai/*` peer 版本对齐。

### M1 复用纯引擎 + 生成压缩词典
- 从 adhdgofly-ide-ext 复制 `src/highlightEngine/{types,language,lemmatizer,matcher,segmenter,index}.ts`（**零 vscode 依赖，原样可编译**）；`index.ts` 只保留 `HighlightEngine.process` 与 `sanitizeCodeBlocks`。
- `scripts/build-dicts.mjs`：复用 `build-preview.mjs` 的 `posToKey`，从 ide-ext 的 `dictionaries/*.json` 产出 `dicts/en.compact.json`、`dicts/zh.compact.json`（word→posKey）。**构建脚本负责读取大词典，仓库与运行时都不直读原始大文件**。
- 明确词典数据版权/许可：两个项目同属 ADHDGoFly 生态（MIT），压缩产物随包分发无碍；若未来独立发布，注明数据来源与生成脚本。

### M2 Client 高亮器（核心）
- 移植 `src/preview/highlighter.ts` 到 `src/client/highlighter.ts`，改动点：
  1. 目标容器：对话消息区（实现时用 `Slots.listSubTree` 确认容器；可先用 `.markdown-body` 之外的稳定类名/`[data-testid]` 探测，避开 `pre/code`、`markdown-code-block`）；
  2. 词典来源：`require`/全局注入 `en.compact.json`/`zh.compact.json`（bundle 时内联，参照 build-preview 的 banner 注入法）；
  3. 主题：从 `Theme` service 查询 tokens 或监听 DSH 主题切换（`--dsw-*` 变量 / `prefers-color-scheme`），映射到 DARK/LIGHT 双色板；
  4. 流式防抖：`MutationObserver` + `processing` 重入锁 + 300~500ms 防抖，流式消息尾部更新只触发重处理不崩溃（见 §6 风险）；
  5. 跳过锚点：`pre/code/script/style` + `.markdown-code-block` + 自身 `adhdgofly-hl` 节点。
- 打包：`build.mjs` 输出 `lib/client.js`，首行 `window.__ModuleLoader__.load({id:"adhdgofly-dsh-ext", factory})`，`react`/`@deepseek-ai/*` 保持外部 require（**对照 `dsh-client-ui-sidebar/lib/client.js` 的输出格式逐条对齐**：CJS factory、`require` 返回、CSS 注入段）。

### M3 Host 半
- `lib/index.js`：`function apply() {}`（v1 无 host 逻辑）。
- 预留（注释 + 桩，不实现）：`harness.handle('adhdgofly/segment', ...)` 供未来 host 侧分词/词典管理；`settings` 持久化由 client 设置页经标准设置通道写入。

### M4 安装与验证（DSH 侧）
```bash
# 本地开发安装（相对路径自动锚定到调用目录）
dsh plugin --profile web add file:../adhdgofly-dsh-ext     # 或 link: 做热开发
# 验证补丁层已 reconcile
cat ~/.dsh/profiles/web/package.json                        # dsh.profile.bundles 应含 adhdgofly-dsh-ext
dsh --profile web --dump-config | grep -A3 adhdgofly        # 合成树里应有插件行
# 重启 web profile（重启 dsh web 进程），刷新页面
```
- 验证清单：
  1. `dsh plugin add` 成功且 bundles 已更新；
  2. 浏览器 Network 里 `/plugins/<hash>.js` 正常返回 client bundle；
  3. 对话消息中英文/中文名词绿、动词红、形容词紫；
  4. 深色/浅色主题切换颜色跟随；
  5. 筛选关闭某词性后文字保留、颜色消失（CSS 覆盖生效）；
  6. 代码块（围栏/行内）不被高亮；
  7. 流式输出过程中高亮持续、无白屏/控制台报错。

### M5 打磨
- `settings.section` 设置页：enabled / languages / minWordLength / decorationStyle / posFilter（实现前用 `Slots.listSubTree` + `cordis_inspect_query` 确认真实 props）。
- 性能：大消息按容器分片处理；词典懒加载。
- README：安装/卸载（`dsh plugin --profile web remove adhdgofly-dsh-ext`）、配置、开发循环说明。
- 发布：npm publish 或 git 安装（git 安装需在 profile 的 `pnpm-workspace.yaml` 配 `allowBuilds`，仅当包有 prepare 脚本时）。

---

## 六、注意事项与风险

1. **React 协调 vs DOM 变异（最高风险）**：直接改 React 拥有的 DOM 文本节点，React 后续 `textContent` 覆盖会把高亮 span 抹掉（不崩、会闪）；若 React 尝试移除被包层的节点，理论上可能抛 `NotFoundError`。缓解：重入锁 + 防抖 + WeakSet 记录已处理节点（React 换节点后自动失效重处理）；接受"重渲染时高亮短暂重置"；不要在流式消息"流完之前"反复包层（按 settled 状态或防抖窗口处理）。
2. **流式消息**：`MarkdownText` 增量解析，每 chunk 重渲染。高亮器必须扛住高频 mutation；必要时对仍在增长的节点跳过，等停顿后处理。
3. **偏移体系**：处理的是**渲染后 DOM 文本**，偏移直接对应文本节点内容，无"源码 markdown 偏移→DOM 偏移"映射问题（这正是 preview 方案能成立的原因）。分词仍按 UTF-16 code unit，与 DOM 一致。
4. **词典体积**：压缩词典 + 高亮代码 ≈ 8MB（未压缩）。本地 `/plugins` 加载可接受；后续可 minify+gzip、按语言懒加载、或转 **host 侧分词**（`host.call` 传文本返回命中词，offset 仍映射 DOM 文本）以彻底去掉客户端词典——列为 v2 优化项。
5. **无 Web 端 HMR**：dsh-web-app patch 里 `hmr` 被 `disabled`。client 改动 = 重新 build + 刷新页面；manifest/patch/bundles 改动 = 重启 profile。开发循环要有预期。
6. **client 插件读行 config 的方式**：静态 client 插件如何拿到行 `config`（默认值/覆盖值）需在实现时用 `cordis_inspect_list/query` 确认（Cordis 中 config 通常作为 `apply(config, ctx)` 首参，但 client 半的加载路径特殊）。未确认前先内置默认值 + 设置页。
7. **版本漂移**：DSH 0.1.0-rc.6，client bundle 格式、Slot/Service API 都可能变。peer 版本钉死到已装版本；升级 DSH 后先跑 `cordis_inspect_*` 复查再发版。
8. **沙箱与文件权限**：写 `~/.dsh/profiles/web/cordis.patch.yml`、读 profile 目录属工作区外，默认 `workspace-write` 策略下会被拦，需一次性提权（用户批准）。**官方 `agent-presets` 目录严禁改动**（升级会被覆盖且会破坏 preset 能力）。
9. **外部依赖纪律**：client bundle 不得打包 `@deepseek-ai/*`（浏览器模块表提供，peer 声明即可）；不得 `import`/JSX/TS/`window` 直改；不得 `JSON.stringify` 内部对象。
10. **隐私/安全**：高亮只在本机浏览器与本地词典间完成，不上传文本；后续若加 host 分词 RPC，注意消息内容只进本机进程。

---

## 七、验收标准（Definition of Done）

- [ ] `dsh plugin --profile web add adhdgofly-dsh-ext` 一键安装，bundles 自动 reconcile，无需手改 profile 文件。
- [ ] 对话消息（含流式输出）中英文词性高亮正确，颜色与 adhdgofly-ide-ext 一致（名绿/动红/形紫/其他灰，深浅双色板）。
- [ ] 词性筛选即时生效（CSS 覆盖，文字保留颜色移除），并随会话持久化。
- [ ] 代码块/行内代码/链接/表情符号不破坏渲染、不被误高亮。
- [ ] 主题切换颜色跟随；无控制台报错；长消息性能可接受。
- [ ] README 含安装/卸载/配置/开发循环说明；构建脚本可一键复现 bundle 与词典产物。
- [ ] 代码全部来自 MIT 生态（引擎复制、压缩词典生成脚本），无 GPL 类依赖。

---

## 八、参考资源

**adhdgofly-ide-ext（本机）**
- `README.md`、`docs/000-ide-extension.md`（架构）、`docs/006-dict-format.md`（词典 JSON 规范）、`docs/013-dual-theme-preview-colors.md`（双色板）
- 可复用源码：`src/highlightEngine/*`（纯逻辑）、`src/preview/highlighter.ts`（移植蓝本）、`scripts/build-preview.mjs`（压缩词典 + 浏览器 bundle 范例）
- 注意：`dictionaries/EN_word.json`、`ZH_word.json` 为大词典文件，只经构建脚本读取，不直接查看/入库。

**DSH（本机安装）**
- launcher：`~/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/lib/bin.js`（CLI 语法）
- 插件管理：同目录 `plugin-9h8shc4d.js`（pnpm 转发 + bundles reconcile 逻辑）
- bundle 范例：`@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`（`cordis.patch.yml` + `dsh.bundle.patch`）
- client 包范例：`@deepseek-ai/dsh-client-ui-sidebar`（`dsh.client` 字段 + `lib/client.js` 的 `__ModuleLoader__.load` 输出格式；host 半空 `apply`）
- client 模块链路：`@deepseek-ai/dsh-client-modules`（README 描述 boot 图 / `/plugins` / lazy-CJS）
- 官方开发技能（DSH 自带，最高权威）：`node_modules/@deepseek-ai/dsh/config/agent-presets/cordis/skills/cordis-plugin-development/SKILL.md`、`.../editing-cordis-compositions/SKILL.md`
- 运行时目录：`~/.dsh/profiles/web/`（package.json / cordis.patch.yml）

## 九、开放问题（实现前用 cordis_inspect 确认）

1. 静态 client 插件读取行 `config` 的准确方式（默认值合并逻辑）。
2. 对话消息内容区的稳定容器选择器/Slot（避开 React 内部结构）。
3. `Theme` service 可查询的 token 清单与明暗判定信号（`--dsw-*` 变量 or body class or `prefers-color-scheme`）。
4. `settings.section` 的注册协议与 props（标准 props + owner props）。
5. client bundle 构建参数（外部化清单、CSS 虚拟模块、`immediately` 语义）——对照已安装包的 `lib/client.js` 输出，必要时查看 deepseek-harness 源码仓库 `packages/client/*` 的 tsdown 配置。
6. 是否需要 `inject` 声明 `@deepseek-ai/dsh-client-ui-primitives`（若高亮器要复用其工具函数；若完全自包含则不需要）。
7. **智能模式 LLM 接入**：Host 插件能否注入 `llm` 服务及其 generate/stream 方法签名（`Service.listService` 查证）；若走 aiJudge 式直连，key/baseURL 从 DSH 设置/凭据 seam（`ctx.credentials`、`apiKeyEnv`、`baseURL`、`models`）读取的公开访问路径。
8. **设置承载**：`settings.section` 的设置 namespace 注册方式，以及"词典勾选列表 / 关键词面板"这类列表型 UI 的数据存储（settings namespace 还是 localIndexedDB/localStorage）。

---

## 十、远期规划：三模式高亮（预设 / 智能 / 全能）

### 10.1 三模式总览

| 模式 | 词典源 | 高亮效果 | 计算量 | 前置条件 |
|---|---|---|---|---|
| **默认模式** `preset` | 预设大词典（官方 en/zh）+ 用户勾选的其他合规词典，**多词典合并**后处理 | 命中预设词典的词性着色（名绿/动红/形紫/其他灰） | 中（分词于大词典） | 无 |
| **智能模式** `smart` | **仅**"对话关键词词典"——基于 DSH 已配置的 API Key + 提示词从对话内容抽取关键词形成词典，多轮持续增强 | 只高亮本对话关键词（专属样式，一眼看要点） | 低（小词典）+ LLM 调用成本 | 已配置 LLM |
| **全能模式** `all` | 勾选的预设词典（合并后） **∪** 智能关键词词典（并集） | 全面高亮 + 关键词突出（`data-src` 区分样式、可独立开关） | 高（大词典分词 + LLM） | 同智能模式 |

三模式**共享同一引擎与渲染管线，只换"词典源"**；设置页切换 `highlightMode`。切换时对当前会话重新渲染（§10.4 策略）。

### 10.2 默认模式：多词典合并（复用 ide-ext 已实现逻辑）

ide-ext 已有实现（本机源码，直接参考）：
- `src/dictionary/merger.ts`：`mergeDicts(...layers)` —— 逐层覆盖合并，**后层优先**（builtin → community → user）；
- `src/dictionary/loader.ts`：`normalizeDictionary(raw)` —— 把 `{version, words:{word:{pos}}}` 规范化为 `word→{pos:[]}`（key 转小写）；`loadBuiltinDict()` 读 `dictionaries/<LANG>_word.json`；
- `src/dictionary/manager.ts`：`getMergedDict(langs)` —— 按语言合并并缓存（`mergeCache`），`setDisabledDicts(ids)` 黑名单禁用并使缓存失效；层级 builtin → community → userAdded（含 legacy）。

移植要点：
- 把"多词典合并"剥离为**纯逻辑 `DictMerger`**（输入：词典列表 + 优先级 + 禁用集 → 输出合并 DictMap；脱离 vscode 存储适配层）；
- client 端词典源：内置压缩词典（en/zh，word→posKey）+ 用户勾选的合规词典（格式见 `docs/006-dict-format.md`）；
- 设置页"词典勾选列表"：列出内置 en/zh 与用户导入的合规词典，勾选=参与合并，`disabledDicts` 语义保留；
- 注：v1（§3–§7）只有内置 en/zh 两张，合并接口按 N 张设计、按 2 张实现，后续加勾选列表无痛。

### 10.3 智能模式：LLM 对话关键词词典（核心远期能力）

```
对话 settle（防抖，仅当有新增内容）
  → 1. 提取新增消息文本（清洗：去代码块/停用词/标点/长度过滤）
  → 2. 组装增量提示词：
        系统提示 = 关键词抽取规则 + 输出 JSON schema
        上下文   = 当前关键词词典（word + pos + count）+ 本轮新增消息（按 token 预算截断）
  → 3. 调用 LLM（10.3.1 接入）→ 返回 { keywords: [{ word, pos, action: add|keep|remove, importance }] }
  → 4. 合并进会话关键词词典（LLM 增删 + 词频自然增长），容量上限（默认 50）
  → 5. 重渲染新增与旧内容（§10.4 策略）
  → 6. LLM 不可用/失败 → 降级为统计抽取（§10.5），不阻塞高亮
```

**10.3.1 LLM 接入（复用 DSH 已配置的 API Key，用户无需另配）**
- **方案 A（推荐 v1）：Host 插件直连 OpenAI 兼容接口**。移植 ide-ext `src/vscode/aiJudge.ts` 的调用模式（`fetch` POST `{model, messages, temperature, max_tokens}`，`Authorization: Bearer <key>`，解析 `choices[0].message.content` 中的 JSON）。连接事实从 DSH 设置读取：`$DSH_HOME/settings.yaml` 的 `llm-deepseek:` 段（schema：`apiKeyEnv`、`baseURL`、`models`；**DSH 不存明文 key**，key 经 `ctx.credentials`/环境变量解析——插件需遵循同一解析链，实现时用 `cordis_inspect`/`Service.listService` 确认公开 seam）。
- **方案 B（更原生）：注入 DSH 的 llm 服务**。Host 插件 `inject: ['llm']`（或 `ctx.get('llm')`）调用 `ctx.llm.*` 生成接口（`listModels`/`resolveModelInfo`/provider route 已确认存在；generate/stream 方法签名实现时查证）。好处：复用 DSH 的模型路由、重试、配额与凭据解析，**最符合"用 dsh 里设置的 api key"**。
- 成本控制：仅"有新增内容"的 settle 触发；`autoRefresh`（默认开）+ "手动刷新关键词"按钮；会话级调用预算提示；`model` 可指定（默认跟随 DSH 当前模型或 `deepseek-v4-flash`）。

**10.3.2 提示词与多轮增强**
- 输出严格 JSON（正则抓 `{...}` 再解析，容错）；
- **增量语义**：携带旧词典 + 仅新消息，让 LLM 只回"增/删/改"列表 → 词典随多轮**持续增强**而非每轮重造；
- 去重/子串过滤/容量上限（防 LLM 幻觉膨胀）；关键词可带 `pos`（n/v/adj…）与 `importance`（影响高亮样式/排序）；
- 失败兜底：JSON 解析失败、超时、无 Key → 自动用 §10.5 统计抽取结果继续。

### 10.4 重渲染策略（新增 + 旧内容统一重渲染）

词典每轮增长，**旧消息必须跟着变**。两种策略：
- **方案 A（v1，简单正确）——全量重处理**：卸载旧 span（span 还原为文本节点）→ 重新 `TreeWalker` 全对话文本 → 用当前词典源重新包 span。代价 O(全对话文本)，典型对话毫秒级；300–500ms 防抖 + 重入锁，流式期间不触发。
- **方案 B（v2，增量）——按词典 delta 打补丁**：保留既有 span，只处理变化部分：新增关键词仅扫描**含该词**的文本节点补 span；被挤出 Top-N 的关键词 CSS 隐藏色值（文字保留）或卸载 span；触发点收敛到"关键词集合变化"（集合 diff）。
- 共性保障：只处理已 settle 节点；跳过 `pre/code/markdown-code-block`；WeakSet 记录已处理节点；重入锁 + 防抖。
- 评估：A 先验证"多轮增长 + 新旧重渲染"体验闭环；B 面向超长会话，降低 React 抖动。

### 10.5 统计抽取兜底（智能模式降级路径）

- **Latin**：词级切分（无需词典）+ 小写归并 + 停用词过滤 + 计数；短语可做 2-gram。
- **CJK**：(a) 纯统计 n-gram（2–4 字频率 + PMI/左右邻接熵，零词典但短文本噪声大，需 minSupport）；**(b) 切分辅助（推荐）**——仅用压缩预设词典做候选词切分（**不参与高亮**），切出的词按频率进关键词词典；视觉高亮仍完全由关键词词典决定。
- 位置权重：用户消息 / 首条 / 标题行 / `**加粗**` 内容更高；助手长文降频。
- 过滤：停用词、纯数字、超长串、互为子串的候选。

### 10.6 全能模式：预设 ∪ 智能

- 词典源：`presetMergedDict ∪ smartDict`；同词冲突时 **smartDict 优先**（关键词更"准"）；
- 渲染：同一 `segmentMixed`（词典为并集）；span 增加 `data-src='preset'|'smart'`，CSS 按源区分样式（smart 词加粗/描边/专属色），并提供 `sourceFilter` 独立开关（仅预设 / 仅智能 / 两者）；
- 计算量：与默认模式同阶（大词典分词）+ 小关键词词典 + LLM 调用；缓解：mergeCache、防抖、可见区优先；
- 收益：预设词典保证覆盖面，智能词典保证"本对话要点"一眼可见。

### 10.7 数据模型与设置（三模式共用）

- 设置（`settings.section`）：
  ```ts
  highlightMode: 'preset' | 'smart' | 'all'
  preset: { enabledDicts: string[]; languages: string[]; minWordLength: number;
            decorationStyle: 'color' | 'highlight'; posFilter: string[] }
  smart:  { maxKeywords: number; minFrequency: number; autoRefresh: boolean;
            model?: string; sourceFilter: 'both' | 'preset' | 'smart' }
  ```
- 会话关键词词典（增加来源标记）：
  ```ts
  { sessionId: string; updatedAt: number;
    words: Record<string, { pos: string[]; count: number; firstSeen: number;
                            lastSeen: number; source: 'llm' | 'stat' }> }
  ```
- 持久化：v1 内存 + `localStorage`（按 sessionId，恢复会话即出高亮）；v2 host 侧 storage/settings（跨会话统计）。

### 10.8 里程碑（更新）

| 里程碑 | 内容 | 验收 |
|---|---|---|
| K1 | 默认模式多词典合并（纯逻辑 `DictMerger` + 设置页勾选列表） | 勾选/禁用词典即时反映到高亮 |
| K2 | 智能模式 v1（LLM 抽取 + 增量增强 + 重渲染 + 统计降级） | 多轮对话关键词持续增长，新旧内容同步更新 |
| K3 | 全能模式（并集 + `data-src` 双样式 + `sourceFilter`） | 预设+智能同时生效，样式可区分 |
| K4 | 增量重渲染（方案 B）+ 持久化 + 关键词面板（查看/手动编辑） | 超长会话流畅、刷新恢复、可人工修正 |

### 10.9 风险与注意（更新）

1. **LLM 成本/延迟/失败**：仅 settle + 增量 + 手动刷新兜底；失败自动降级统计抽取。
2. **关键词质量**：LLM 幻觉 → 严格 JSON + 容量上限 + 手动编辑入口；统计噪声 → minFrequency/停用词/Top-N 阈值。
3. **API Key**：从 DSH 既有设置/凭据 seam 读取（不新增存储、不明文落盘）；仅本机进程调用。
4. **计算量（全能模式）**：大词典分词 + LLM → mergeCache/防抖/可见区优先。
5. **React 抖动**：同 §6.1；方案 B 降低 DOM 改写量。
6. **多会话隔离**：词典严格按 sessionId；切换会话即时切换高亮源。
7. **流式边界**：只对 settle 消息抽取/重渲染。
