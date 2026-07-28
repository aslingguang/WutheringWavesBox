# 开发指南

## 环境

- Windows 10 22H2 或 Windows 11
- Node.js 24+
- npm 11+
- .NET 10 SDK
- Git

依赖版本锁定在根目录 `package-lock.json`。安装依赖使用 `npm ci`，不要重新引入 pnpm 工作区文件。

## 常用命令

```powershell
npm ci                       # 按锁文件安装依赖
npm run dev                  # 启动 Electron 开发环境
npm run check                # 格式、Lint、类型、测试和生产构建
npm run helper:build         # 构建 .NET 解决方案
npm run helper:test          # 执行 Helper xUnit 测试
npm run release:win          # 构建 Windows x64 安装包
npm run release:portable     # 构建 Windows x64 便携版
```

开发模式使用当前源码启动 Helper，不复用旧的 Debug 可执行文件。修改 C# 后需要完整重启 `npm run dev`。

## 修改边界

- Renderer 只能调用 `window.wwbox`，不能直接访问 Node.js、任意 IPC、文件系统或注册表。
- 新增跨进程能力时同时修改共享契约、Preload、Main 处理器和对应测试。
- SQLite 结构变化必须迁移既有数据，不能通过删除数据库解决。
- 网络数据源必须设置超时、校验响应并提供离线或错误状态。
- 日志、测试样例和截图不得包含真实 UID、Token、手机号或抽卡 URL 参数。

## 提交要求

提交前至少执行 `npm run check`。涉及 Helper 时追加 `npm run helper:test`；涉及安装打包时还需要执行对应 release 命令并在干净 Windows 环境冒烟测试。

推荐使用 Conventional Commits，例如 `fix(desktop): prevent dialog layout shift`。数据库迁移、协议变化和安全边界变化必须在提交或 PR 说明中单独列出。

## 主题字体规范

- 所有界面继承 `--ui-font`；代码、UID 和等宽数据使用 `--ui-font-mono`。
- 页面标题、弹窗标题、分组标题、正文、说明和控件文字分别使用现有 `--ui-type-*` 令牌。
- 正文、强调和标题字重使用 `--ui-weight-regular`、`--ui-weight-medium`、`--ui-weight-bold`。
- 主题文字颜色使用 `--ui-text`、`--ui-text-strong`、`--ui-muted`、`--ui-disabled`、`--ui-accent` 和 `--ui-danger`，业务组件不得硬编码另一套主题文字色。
- 同一操作区按钮共享字体族、字号、字重、行高和字距；主次状态只通过颜色、边框或背景区分。
- 弹窗控件的悬停和焦点效果不得扩大滚动范围或改变弹窗尺寸。
