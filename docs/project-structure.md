# 项目结构

## 当前仓库

```text
WutheringWavesBox/
├─ apps/
│  └─ desktop/
│     ├─ src/main/             Electron Main 与业务服务
│     ├─ src/preload/          contextBridge 白名单 API
│     ├─ src/renderer/         Vue 界面、主题、组件与资源
│     ├─ electron.vite.config.ts
│     └─ package.json
├─ packages/
│  └─ contracts/               桌面端共享 TypeScript 契约
├─ native/
│  ├─ WutheringWavesBox.Helper/
│  ├─ WutheringWavesBox.Contracts/
│  ├─ WutheringWavesBox.Helper.Tests/
│  └─ WutheringWavesBox.slnx
├─ docs/                        长期维护文档
├─ release/                     本地构建产物
├─ package-lock.json
└─ package.json
```

仓库使用 npm Workspaces。目前只有 `apps/desktop` 和 `packages/contracts` 两个 Node.js 工作区；不要在文档或代码中引用尚不存在的领域、数据库或 UI 工作区。

## 桌面应用

### Main

`apps/desktop/src/main/index.ts` 负责窗口生命周期、IPC 注册和服务组合。`src/main/services/` 包含 SQLite 仓储、游戏设置与版本、启动器账号、抽卡、兑换码、库街区和版本元数据服务。

Main 可以使用 Node.js、Electron 和本地数据库，但所有 Renderer 请求必须经过明确的 IPC 方法，不提供任意文件或命令执行入口。

### Preload

`apps/desktop/src/preload/` 使用 `contextBridge` 暴露 `window.wwbox`。Preload 只转发已定义能力并维持上下文隔离，不向 Renderer 暴露 `ipcRenderer`、Node.js 模块或文件系统对象。

### Renderer

`apps/desktop/src/renderer/src/App.vue` 是桌面主界面，`components/` 保存库街区、统一弹窗、下拉框和图片组件。样式分为：

- `styles.css`：应用布局和基础组件几何样式。
- `theme-system.css`：主题色、字体、弹窗和跨组件状态。
- `gacha-overlays.css`：抽卡高对比度及最后加载的顶层覆盖。

`assets/` 中保存运行时不应依赖网络加载的本地图标和数据。用户壁纸与缓存不进入源码目录。

## .NET Helper

Helper 通过 JSON-RPC 接收 Main 的受控请求，目前负责：

- 系统健康与版本信息。
- 游戏安装目录探测和验证。
- 游戏版本、进程启动与结束。
- 从游戏日志发现抽卡链接。

Helper 不负责界面和普通 HTTP 数据源。新增 Windows 原生能力时，需要同步更新 C# 契约、TypeScript 契约、Main 客户端和测试。

## 依赖方向

```text
Renderer -> Preload API / TypeScript contracts
Preload  -> Electron IPC / TypeScript contracts
Main     -> services / SQLite / Helper client / TypeScript contracts
Helper   -> C# contracts / Windows and game resources
```

Renderer 不得绕过 Preload。Helper 不应依赖 Electron 或 Vue。网络适配器和 SQLite 访问不应放进 Vue 组件。

## 命名与数据

- TypeScript 类型、类和 Vue 组件使用 `PascalCase`。
- 函数、变量和 IPC 方法使用 `camelCase`。
- TypeScript 文件使用 `kebab-case.ts`，Vue 文件使用 `PascalCase.vue`。
- C# 遵循 .NET 命名约定，SQLite 表和列使用 `snake_case`。
- 运行时数据使用 Electron `userData` 目录；仓库中的 `release/` 仅保存本机构建产物。
