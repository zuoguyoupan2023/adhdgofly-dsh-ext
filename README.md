# adhdgofly-dsh-ext

把 [adhdgofly-ide-ext](https://github.com/zuoguyoupan2023/adhdgofly-ide-ext) 的词性高亮机制搬进 **DeepSeek Harness（DSH）Web 界面**：在已渲染的 Markdown 内容区（对话消息、Deliverables 等）把**名词染绿、动词染红、形容词/副词染紫、其他染灰**，支持深/浅双色板、词性筛选即时开关、流式输出防抖与代码块豁免。

本插件是**纯客户端 DOM 后处理**插件（`dsh.client` 双面包），不改 DSH 源码；分词引擎与压缩词典来自 ADHDGoFly 生态（MIT），经 `dsh plugin add` 一条命令安装。

---

## 功能

- **词性高亮**：英文（含后缀词形还原）+ 中文（正向最大匹配），名词绿 / 动词红 / 形副紫 / 其他灰。
- **深/浅色板**：跟随 DSH 主题（`theme` 服务），颜色与 adhdgofly-ide-ext 一致。
- **词性筛选**：即时生效——文字保留、颜色移除（CSS 覆盖，无需重新分词）。
- **高亮样式**：`color`（文字变色，默认）/ `highlight`（背景框 + 边框）。
- **流式兼容**：`[data-streaming]` 消息流完前跳过，settle 后自动高亮；MutationObserver + 防抖 + 重入锁。
- **代码块豁免**：`pre/code`、`.markdown-code-block`、按钮/输入框/装饰区不参与高亮。
- **设置页**：Settings → **ADHDGoFly** 分区（启用、语言、最小词长、样式、词性筛选、高亮容器），改动即时生效并持久化到 localStorage。

## 安装

前置：本机已安装 DSH（`dsh --version`），且已初始化 `web` profile（`dsh --profile web` 跑过一次即可）。

### 公开安装（从 npm 发布后，面向所有用户）

```bash
dsh plugin --profile web add adhdgofly-dsh-ext
# 若 pnpm ≥ 10 报 ERR_PNPM_ADDING_TO_ROOT，在命令末尾追加 -w：
# dsh plugin --profile web add -w adhdgofly-dsh-ext
```

> ⚠️ **安装完成后必须重启 DSH 才能生效**
>
> 1. 在正在运行的 DSH Web 终端按 `Ctrl+C` 停止当前进程；
> 2. 重新启动：
>    ```bash
>    npx @deepseek-ai/dsh web
>    ```
>    （与 `dsh web` / `dsh --profile web` 等价，任选其一）
> 3. 等 Web 界面重新打开后**刷新浏览器页面**。
>
> 不重启的话，正在运行的 DSH 进程的 boot 图里没有本插件，刷新页面也不会加载它。

`dsh plugin add` 会：
1. 在 `~/.dsh/profiles/web` 里 `pnpm add` 本包；
2. **自动 reconcile**：检测到 `dsh.bundle` 声明，把 `adhdgofly-dsh-ext` 追加进 `dsh.profile.bundles`，成为 profile 补丁层。

### 本地开发安装（file: 符号链接，改代码无需重装）

```bash
# 在插件仓库目录或其父目录执行（file: 相对路径以调用目录为锚）
dsh plugin --profile web add file:../adhdgofly-dsh-ext
```

file: 依赖是符号链接：客户端改动 `npm run build` 后**刷新页面**即可（DSH Web 无 HMR）；patch / bundles 改动需重启 profile。安装后同样需要按上面的提醒重启一次才生效。

### 验证

```bash
dsh --profile web --dump-config | grep -A3 adhdgofly   # 合成树里应有插件行
# 浏览器 DevTools → Network 应能看到 /plugins/adhdgofly-dsh-ext/client.js 正常返回
```

> 说明：DSH 0.1.0-rc.6 的客户端 Loader 只按包名激活插件行，行级 `config` 不会下发给 client 半；因此 v1 的设置默认值内置在 bundle 中，用户在设置页修改并持久化到 localStorage（见 §配置）。

## 卸载

```bash
dsh plugin --profile web remove adhdgofly-dsh-ext
# 同样需要重启 web profile（Ctrl+C 后重新 npx @deepseek-ai/dsh web），再刷新页面
```

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
- 其他用户安装（见 §安装）：`dsh plugin --profile web add adhdgofly-dsh-ext`（pnpm ≥ 10 报错时末尾加 `-w`）；升级用 `dsh plugin --profile web update adhdgofly-dsh-ext`。

### 方式二：从 GitHub 直接安装（备选）

```bash
dsh plugin --profile web add github:你的用户名/adhdgofly-dsh-ext
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

1. **设置页**（推荐）：Settings → ADHDGoFly，改动即时生效并持久化（localStorage `adhdgofly.config.v1`）。
2. **行 config**（`~/.dsh/profiles/web/cordis.patch.yml` 按 id 覆盖整行）：仅影响 host 半与文档语义，DSH 0.1.0-rc.6 下不会自动下发到 client，需配合设置页或默认值使用。
3. **代码默认值**：改 `src/client/config.ts` 的 `DEFAULT_CONFIG` 后重新构建。

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
| `lib/index.js` | host 半（空 `apply()` + 预留 RPC 桩），ESM |
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

## 许可与数据来源

- 代码：MIT（本仓库 + adhdgofly-ide-ext，同属 ADHDGoFly 生态）。
- 词典数据：adhdgofly-ide-ext 内置词典（`dictionaries/EN_word.json`、`ZH_word.json`，MIT 生态），压缩产物随包分发；独立发布时请注明数据来源与生成脚本（`scripts/build-dicts.mjs`）。

## 已知限制（v1）

- 高亮为渲染后 DOM 后处理：React 重渲染时高亮可能短暂重置（已用防抖/流式跳过/已处理文本跟踪缓解）。
- 不覆盖代码编辑器（DSH 无）、浏览器任意网页（那是 adhdgoflyplugin 扩展的职责）。
- 设置持久化在浏览器 localStorage（跨浏览器不同步）；host 侧设置存储与 host 分词 RPC 为 v2 项。
