# adhdgofly-dsh-ext

把 [adhdgofly-ide-ext](https://github.com/zuoguyoupan2023/adhdgofly-ide-ext) 的词性高亮机制搬进 **DeepSeek Harness（DSH）Web 界面**：在已渲染的 Markdown 内容区（对话消息、Deliverables 等）把**名词染绿、动词染红、形容词/副词染紫、其他染灰**，支持深/浅双色板、词性筛选即时开关、流式输出防抖与代码块豁免。

本插件是**纯客户端 DOM 后处理**插件（`dsh.client` 双面包），不改 DSH 源码；分词引擎与压缩词典来自 ADHDGoFly 生态（MIT），经 `npx @deepseek-ai/dsh plugin --profile web add` 一条命令安装。

---

## 功能

- **词性高亮**：英文（含后缀词形还原）+ 中文（正向最大匹配），名词绿 / 动词红 / 形副紫 / 其他灰。
- **深/浅色板**：跟随 DSH 主题（`theme` 服务），颜色与 adhdgofly-ide-ext 一致。
- **词性筛选**：即时生效——文字保留、颜色移除（CSS 覆盖，无需重新分词）。
- **高亮样式**：`color`（文字变色，默认）/ `highlight`（背景框 + 边框）。
- **流式兼容**：`[data-streaming]` 消息流完前跳过，settle 后自动高亮；MutationObserver + 防抖 + 重入锁。
- **代码块豁免**：`pre/code`、`.markdown-code-block`、按钮/输入框/装饰区不参与高亮。
- **属性契约（v0.1.2）**：任何带 `data-adhdgofly-highlight` 属性的元素**自动被高亮**（无需写入 `containers` 配置、无需重新加载）——`openharness-reader` 的 Markdown 预览即用此契约接入；其他插件可照此联动。未带该属性的页面不受影响。
- **设置页（v0.1.3 双模式）**：配置面有**两个并存入口**——① Settings → **ADHDGoFly** 左侧分区（保留原位，老习惯不变）；② Settings → 插件 → **「插件配置」**标签页里的 **ADHDGoFly 卡片**（rc.7 官方插件设置机制）。两者绑定同一个 `adhdgofly` settings 命名空间（宿主侧 schema 持久化，loopback 下改任一处另一处自动同步）；远程浏览器自动回退 localStorage。可在设置里用「设置入口 / Settings entry」选择只留一种（`both`/`classic`/`plugin-card`，刷新生效）。

## 安装

前置：本机已安装 DeepSeek Harness（DSH），且已初始化 `web` profile（`npx @deepseek-ai/dsh web` 跑过一次即可）。当前版本 **0.1.4**。

### 方式一：App 插件中心（推荐，无需命令行）

1. 下载并安装 DSH 桌面 App，打开后在**左侧边栏**进入「**插件中心**」；
2. 在「**特别推荐**」里找到 **adhdgofly-dsh-ext**；
3. 点击「**安装**」，等待安装完成——DSH 会**自动重启并应用**，无需手动操作；
4. 重启后即可在 Web 设置里看到配置入口（见 §配置）。

### 方式二：命令行安装

```bash
# 1) 安装 DSH（首次）
npx @deepseek-ai/dsh web

# 2) 安装插件
npx @deepseek-ai/dsh plugin --profile web add adhdgofly-dsh-ext

#    若 pnpm ≥ 10 报 ERR_PNPM_ADDING_TO_ROOT，命令末尾加 -w：
npx @deepseek-ai/dsh plugin --profile web add -w adhdgofly-dsh-ext
```

> ⚠️ **命令行安装后必须重启 DSH 才生效**
>
> 1. 在正在运行的 DSH Web 终端按 `Ctrl+C` 停止当前进程；
> 2. 重新启动：`npx @deepseek-ai/dsh web`
>    （若机器已把 `dsh` 装进 PATH，`dsh web` / `dsh --profile web` 与之等价，任选其一）
> 3. 等 Web 界面重新打开后**刷新浏览器页面**。
>
> 不重启的话，正在运行的 DSH 进程的 boot 图里没有本插件，刷新页面也不会加载它。

`npx @deepseek-ai/dsh plugin add` 会：
1. 在 `~/.dsh/profiles/web` 里 `pnpm add` 本包；
2. **自动 reconcile**：检测到 `dsh.bundle` 声明，把 `adhdgofly-dsh-ext` 追加进 `dsh.profile.bundles`，成为 profile 补丁层。

### 升级 / 卸载

```bash
# 升级到最新版（当前 0.1.4）
npx @deepseek-ai/dsh plugin --profile web update adhdgofly-dsh-ext

# 卸载
npx @deepseek-ai/dsh plugin --profile web remove adhdgofly-dsh-ext
```

- 命令行升级/卸载后，同样需要 `Ctrl+C` 停止 → `npx @deepseek-ai/dsh web` 重启 → 刷新浏览器。
- App 插件中心里升级/卸载会自动重启并应用。

### 本地开发安装（file: 符号链接，改代码无需重装）

```bash
# 在插件仓库目录或其父目录执行（file: 相对路径以调用目录为锚）
npx @deepseek-ai/dsh plugin --profile web add file:../adhdgofly-dsh-ext
```

file: 依赖是符号链接：客户端改动 `npm run build` 后**刷新页面**即可（DSH Web 无 HMR）；patch / bundles 改动需重启 profile。安装后同样需要按上面的提醒重启一次才生效。

### 验证

```bash
npx @deepseek-ai/dsh --profile web --dump-config | grep -A3 adhdgofly   # 合成树里应有插件行
# 浏览器 DevTools → Network 应能看到 /plugins/adhdgofly-dsh-ext/client.js 正常返回
```

> 说明：v0.1.3 起配置面走 rc.7 插件设置机制——host 半注册 `adhdgofly` settings 命名空间（schemastery schema，row config 作为 base 层），client 半经 `ctx.settingsScope` 读取；loopback 下由宿主持久化，localStorage 仅作远程浏览器的回退缓存（见 §配置）。

## 公开发布（让其他用户安装）

本插件是标准的 DSH npm 插件包：`dsh.bundle.patch` 声明 + `exports["./client"]` 浏览器 bundle。**推荐发布到 npm**（DSH 官方同步开放 npm 插件生态），GitHub 仅作源码托管；从 GitHub 直接安装也可用，但需要额外配置（见下）。

### 方式一：发布到 npm（推荐）

前置：npm 账号已登录（`npm login`；未登录发布会报 E401），包名未被占用（`npm view adhdgofly-dsh-ext` 返回 404 即可用）。

```bash
npm run build:all          # 1) 生成压缩词典 2) 构建 lib/（prepublishOnly 会自动执行）
npm test                   # jsdom 冒烟测试（prepublishOnly 会自动执行）
npm publish                # 发布：自动跑 prepublishOnly（build:all + test）后再上传
```

- 发布内容由 `files` 字段决定：`lib/`（host + client bundle）、`dicts/`（压缩词典）、`cordis.patch.yml`、`README.md`（LICENSE / package.json 自动包含），压缩后约 4.4MB。
- 升级版本：`npm version patch|minor|major && npm publish`。
- 其他用户安装（见 §安装）：App 插件中心「特别推荐」，或命令行 `npx @deepseek-ai/dsh plugin --profile web add adhdgofly-dsh-ext`（pnpm ≥ 10 报错时末尾加 `-w`）；升级用 `npx @deepseek-ai/dsh plugin --profile web update adhdgofly-dsh-ext`。

### 方式二：从 GitHub 直接安装（备选）

```bash
npx @deepseek-ai/dsh plugin --profile web add github:你的用户名/adhdgofly-dsh-ext
# 或 git+https://github.com/你的用户名/adhdgofly-dsh-ext.git
```

注意：pnpm 默认**阻止依赖的构建脚本**（prepare），且本仓库 `.gitignore` 排除了 `lib/` 与 `dicts/` 构建产物。git 安装若要可用，二选一：

1. 发布分支**强制包含构建产物**：`git add -f lib dicts`（构建产物随源码提交，仓库体积约 +17MB）；
2. 或包内增加 `prepare` 构建脚本，并在安装方 `~/.dsh/profiles/web/pnpm-workspace.yaml` 的 `allowBuilds` 中放行本包（pnpm 会在安装时打印所需的精确配置项）。

因此日常发布以 **npm 为主**，GitHub 用于源码协作、issue 与版本标签。

## 配置

| 配置项 | 默认 | 说明 |
|---|---|---|
| `enabled` | `true` | 总开关 |
| `languages` | `['en','zh']` | 启用词典语言 |
| `minWordLength` | `2` | 最小词长 |
| `decorationStyle` | `'color'` | `color` 变色 / `highlight` 背景框 |
| `posFilter` | `['n','v','a','o']` | 词性筛选（n 名词 / v 动词 / a 形副 / o 其他） |
| `containers` | `['[data-conversation-scroll]']` | 高亮根容器 CSS 选择器，可追加其他 Markdown 渲染区 |

三种改法（按优先级）：

1. **设置页**（推荐，v0.1.3 双入口）：Settings → ADHDGoFly 左侧分区 **或** Settings → 插件 →「插件配置」的 ADHDGoFly 卡片。两者绑定同一个 `adhdgofly` 命名空间，loopback 下由宿主持久化、互相同步；改动即时生效。
2. **行 config**（`~/.dsh/profiles/web/cordis.patch.yml` 按 id 覆盖整行）：作为命名空间的 base 层，经 `ctx.settingsScope` 流入 client（rc.7 起生效）。
3. **代码默认值**：改 `src/host/index.ts` 的 `SCHEMA` 默认值 与 `src/client/config.ts` 的 `DEFAULT_CONFIG` 后重新构建。

> 远程浏览器（非 loopback）说明：DSH 的 settings RPC 仅限 loopback，远程浏览器里设置不持久化、插件卡片不显示；此时高亮使用 localStorage 回退缓存（本地记忆）或内置默认。

## 开发循环

```bash
npm install
npm run build:all      # 1) 生成压缩词典（读 adhdgofly-ide-ext 大词典）2) 构建 lib/
npm run typecheck
npm test               # jsdom 冒烟测试（分词/代码块豁免/流式/色板/筛选）
```

- `IDE_EXT_ROOT` 环境变量可指向其他 adhdgofly-ide-ext 检出（默认 `/Users/burenweiye/Documents/GitHub/adhdgofly-ide-ext`）。
- 客户端改动：`npm run build` → **刷新页面**（file: 依赖是符号链接，无需重装；DSH Web 无 HMR，见下）。
- patch / bundles 改动：重启 web profile。
- 注意：DSH Web 无客户端 HMR（`hmr` 行被 `disabled`），client 改动 = 重新 build + 刷新。

## 构建产物

| 产物 | 说明 |
|---|---|
| `lib/client.js` | 浏览器 bundle（`window.__ModuleLoader__.load` 格式），内嵌压缩词典，约 8MB 未压缩 |
| `lib/index.js` | host 半：注册 `adhdgofly` settings 命名空间（schemastery schema + base 层），ESM |
| `dicts/en.compact.json`、`dicts/zh.compact.json` | `word → posKey('n'\|'v'\|'a'\|'o')`，构建期从 ide-ext 大词典生成，运行时只读压缩形态 |

## 架构

```
MarkdownText 渲染完成 → MutationObserver（防抖 400ms + 重入锁 + WeakMap 已处理文本）
  → 取目标容器文本节点（跳过 pre/code/.markdown-code-block/交互控件/[data-streaming]）
  → 纯引擎 segmentMixed（内嵌压缩词典 + en 词形还原）→ matchSegments（长度/词性筛选）
  → 包 <span class="adhdgofly-hl" data-pos="n|v|a|o">
  → 注入/更新 #adhdgofly-style（配色 + decorationStyle + posFilter CSS 覆盖）
  → 主题变化（theme/change）→ 重渲染样式表，span 自动跟随
```

详见仓库根目录 `000-adhdgofly-dsh-ext-plan.md`（规划）与 `001-adhdgofly-ide-ext-reference.md`（移植参考）。

## 相关项目（ADHDGoFly 生态）

| 项目 | 说明 | 获取方式 |
|---|---|---|
| **adhdgoflyplugin（浏览器扩展）** | 浏览器**任意网页**的词性高亮 | [Chrome 应用商店](https://chromewebstore.google.com/detail/adhdgofly-%E7%82%B9%E4%BA%AE%E4%BD%A0%E7%9A%84%E8%A7%86%E9%87%8E-chrome/bdpadkojpehfdepjjadmpjeieiddeodl?hl=en-US) · [Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/adhdgofly-%E7%82%B9%E4%BA%AE%E4%BD%A0%E7%9A%84%E8%A7%86%E9%87%8E-edge/odleggjpbedagojaljdopcgolkcibljh?hl=zh-CN) |
| **adhdgofly-ide-ext** | VS Code 扩展：编辑器内词性高亮 | [GitHub](https://github.com/zuoguyoupan2023/adhdgofly-ide-ext) |
| **adhdgofly-dsh-ext（本插件）** | DSH Web 界面词性高亮 | `npx @deepseek-ai/dsh plugin --profile web add adhdgofly-dsh-ext` |

## 许可与数据来源

- 代码：MIT（本仓库 + adhdgofly-ide-ext，同属 ADHDGoFly 生态）。
- 词典数据：源自 adhdgofly-ide-ext 内置词典（`dictionaries/EN_word.json`、`ZH_word.json`，MIT 生态），其中**英文词典来自 Princeton WordNet**（[WordNet License](https://wordnet.princeton.edu/license-and-commercial-use)），**中文词典来自 jieba 分词词库**（[MIT](https://github.com/fxsjy/jieba)）；经 `scripts/build-dicts.mjs` 压缩为 `dicts/*.compact.json` 随包分发，独立发布时请注明数据来源与生成脚本。

## 已知限制（v0.1.3）

- 高亮为渲染后 DOM 后处理：React 重渲染时高亮可能短暂重置（已用防抖/流式跳过/已处理文本跟踪缓解）。
- 不覆盖代码编辑器（DSH 无）、浏览器任意网页（那是 [adhdgoflyplugin 浏览器扩展](https://chromewebstore.google.com/detail/adhdgofly-%E7%82%B9%E4%BA%AE%E4%BD%A0%E7%9A%84%E8%A7%86%E9%87%8E-chrome/bdpadkojpehfdepjjadmpjeieiddeodl?hl=en-US) / [Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/adhdgofly-%E7%82%B9%E4%BA%AE%E4%BD%A0%E7%9A%84%E8%A7%86%E9%87%8E-edge/odleggjpbedagojaljdopcgolkcibljh?hl=zh-CN) 的职责）。
- 设置持久化：loopback 下由宿主 settings 持久化（跨浏览器/会话一致）；远程浏览器（非 loopback）settings RPC 不生效，回退到浏览器 localStorage（跨浏览器不同步）。

## 我开发的 DSH 插件

我（zuoguyoupan2023）开发维护的一系列 DeepSeek Harness（dsh）插件，均可按需通过 App 插件中心「特别推荐」，或命令行 `npx @deepseek-ai/dsh plugin --profile web add <name>` 安装：

| 插件 | 作用 | GitHub 仓库 | 安装 |
|---|---|---|---|
| **adhdgofly-dsh-ext** | DSH Web 界面词性高亮（名绿/动红/形紫/其他灰） | [zuoguyoupan2023/adhdgofly-dsh-ext](https://github.com/zuoguyoupan2023/adhdgofly-dsh-ext) | `npx @deepseek-ai/dsh plugin --profile web add adhdgofly-dsh-ext` |
| **openharness-reader** | 工作区文件浏览/编辑 + Markdown 预览 | [zuoguyoupan2023/openharness-reader](https://github.com/zuoguyoupan2023/openharness-reader) | `npx @deepseek-ai/dsh plugin --profile web add openharness-reader` |
| **openharness-reply-in-cn** | 强制模型用简体中文回复，侧边栏「中文回复」项 | [zuoguyoupan2023/openharness-reply-in-cn](https://github.com/zuoguyoupan2023/openharness-reply-in-cn) | `npx @deepseek-ai/dsh plugin --profile web add openharness-reply-in-cn` |
| **openharness-rule-for-dsh-plugin** | 注入 DSH 插件开发的 CAN/SHOULD/MUST NOT 规范，侧边栏「插件开发规范」项 | [zuoguyoupan2023/openharness-rule-for-dsh-plugin](https://github.com/zuoguyoupan2023/openharness-rule-for-dsh-plugin) | `npx @deepseek-ai/dsh plugin --profile web add openharness-rule-for-dsh-plugin` |
