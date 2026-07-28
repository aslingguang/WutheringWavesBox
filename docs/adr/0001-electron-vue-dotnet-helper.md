# ADR-0001：采用 Electron、Vue 3、TypeScript 与 .NET 10 Helper

- 状态：已接受
- 日期：2026-07-15

## 背景

项目需要丰富的数据可视化和快速 UI 迭代，同时需要安全访问 Windows 注册表、进程、凭据和游戏文件。单独使用 JavaFX 会增加 UI 维护成本；单独依赖 Electron/Node.js 执行高风险系统操作又会扩大权限边界。

## 决策

- 使用 Electron 承载桌面生命周期。
- 使用 Vue 3 + TypeScript 构建 Renderer。
- 使用隔离的 preload 提供白名单 IPC。
- 使用 .NET 10 Helper 实现 Windows 原生及高权限能力。
- 使用版本化的 JSON-RPC 风格协议连接 Main 与 Helper。
- 使用 SQLite 保存非敏感本地数据，凭据保存到 Windows 安全存储。

## 后果

优点：

- UI 和图表生态成熟，迭代效率高。
- 原生操作与 UI 故障隔离。
- Helper 可以独立测试账号切换和文件事务。
- TypeScript 与 C# 都有清晰契约。

代价：

- 安装包和内存占用高于纯原生方案。
- 需要维护跨语言协议和配套版本。
- Java 参考项目的实现需要按领域规则重新落地。

## 备选方案

- 继续 JavaFX：复用更直接，但现代 UI 和前端生态较弱。
- Tauri + Rust：体积更小，但团队学习和迁移成本更高。
- 全 C# WinUI 3：Windows 集成优秀，但复杂图表和 Web 风格页面迭代成本可能更高。
