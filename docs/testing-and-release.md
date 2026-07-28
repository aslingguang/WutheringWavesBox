# 测试与发布

## 自动检查

根目录完整检查：

```powershell
npm run check
npm run helper:test
```

`npm run check` 依次执行 Prettier 检查、ESLint、所有工作区类型检查、Vitest 和生产构建。Helper 使用 xUnit 独立验证。

## 测试重点

- 游戏目录探测、版本比较、显示设置写入和进程控制。
- 抽卡获取、服务端 ID 去重、多 UID 隔离、分析统计和版本元数据冲突。
- 兑换码与库街区数据的持久化、更新和错误降级。
- 启动器账号扫描、国服 SDK 登录缓存切换及游戏运行中拒绝切换。
- 深色、浅色、玻璃和抽卡高对比度模式下的弹窗、下拉框、焦点与快照。
- 常用窗口尺寸下工具栏、表格、弹窗和响应式布局不重叠、不抖动。

涉及账号缓存和游戏配置写入的测试必须使用沙盒或脱敏副本，不使用真实主账号数据。

## 生产构建

```powershell
npm run build
```

该命令构建共享 TypeScript 契约以及 Electron Main、Preload 和 Renderer，但不生成安装包。

## Windows 产物

```powershell
npm run release:win
npm run release:portable
```

两个命令都会先发布 `win-x64` 自包含单文件 Helper，再通过 electron-builder 生成桌面产物：

- 安装包：`WutheringWavesBox-<version>-win-x64-setup.exe`
- 便携版：`WutheringWavesBox-<version>-win-x64-portable.exe`

产物位于根目录 `release/`。

## 发布检查

1. 从干净检出执行 `npm ci`、`npm run check` 和 `npm run helper:test`。
2. 构建安装包与便携版，确认没有引用开发目录中的 Helper。
3. 在受支持的干净 Windows 系统验证安装、首次启动、Helper 健康检查和卸载。
4. 验证游戏扫描、手动添加、启动、结束进程和官方启动器更新入口。
5. 验证账号、抽卡、库街区、兑换码以及三种主题的关键流程。
6. 检查日志、数据库、截图和崩溃信息中没有凭据或未脱敏个人数据。
7. 生成版本说明和 SHA-256；正式发布时还应完成代码签名和第三方许可证清单。

当前项目没有自动更新和稳定发布通道。不要把“本地构建成功”等同于已经完成可公开分发的发布验证。
