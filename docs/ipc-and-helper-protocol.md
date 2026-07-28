# Electron IPC 与 Helper 协议

## 1. 通用约束

- Renderer 不能访问原始 `ipcRenderer`
- 所有请求和响应都使用共享契约
- Main 和 Helper 两层都必须验证输入
- 每次请求包含协议版本、请求 ID 和方法名
- 错误使用稳定错误码，消息只用于展示
- 日志不记录请求中的敏感参数

## 2. Renderer API 示例

```ts
export interface DesktopApi {
  system: {
    health(): Promise<AppInfo>;
    chooseWallpaper(mode: 'image' | 'folder'): Promise<WallpaperSelection | null>;
    loadWallpaper(
      mode: 'image' | 'folder',
      sourcePath: string,
      index?: number,
    ): Promise<WallpaperSelection | null>;
    setAutoStart(enabled: boolean): Promise<void>;
    setCloseGameOnExit(enabled: boolean): Promise<void>;
  };
  game: {
    detectInstallations(): Promise<GameInstallation[]>;
    getVersion(installationId: string): Promise<GameVersionState>;
    launch(input: LaunchGameInput): Promise<TaskAccepted>;
    stopAll(): Promise<number>;
    openUpdater(installationId: string): Promise<void>;
  };
  account: {
    list(): Promise<AccountProfile[]>;
    switchTo(accountId: string): Promise<TaskAccepted>;
    activateLauncher(accountId: string): Promise<void>;
  };
  gacha: {
    import(input: ImportGachaInput): Promise<ImportGachaResult>;
    getSummary(query: GachaSummaryQuery): Promise<GachaSummary>;
  };
}
```

Preload 应逐个使用 `ipcRenderer.invoke` 映射方法，禁止提供 `invoke(channel: string)` 之类的通用入口。

## 3. Helper 协议

首版建议使用按行分隔的 JSON-RPC 风格消息，通过标准输入输出通信；当并发任务和长期进度增加后再切换 Windows Named Pipe。标准错误仅供 Helper 自身诊断，不承载协议消息。

请求：

```json
{
  "jsonrpc": "2.0",
  "protocolVersion": 2,
  "id": "01J...",
  "method": "game.detectInstallations",
  "params": {}
}
```

成功响应：

```json
{ "jsonrpc": "2.0", "id": "01J...", "result": { "installations": [] } }
```

错误响应：

```json
{
  "jsonrpc": "2.0",
  "id": "01J...",
  "error": { "code": "GAME_NOT_FOUND", "message": "未找到有效游戏目录", "details": {} }
}
```

进度事件：

```json
{
  "jsonrpc": "2.0",
  "method": "task.progress",
  "params": { "taskId": "01J...", "percent": 42, "stage": "verifying" }
}
```

## 4. 首批 Helper 方法

| 方法                        | 用途             | 风险等级 |
| --------------------------- | ---------------- | -------- |
| `system.health`             | 协议和版本检查   | 低       |
| `game.detectInstallations`  | 扫描安装目录     | 低       |
| `game.validateInstallation` | 验证目录         | 低       |
| `game.readLocalVersion`     | 读取版本         | 低       |
| `game.launch`               | 启动游戏         | 中       |
| `game.getProcessState`      | 查询运行状态     | 低       |
| `game.stopAll`              | 停止受管理的游戏 | 中       |
| `account.capture`           | 捕获当前账号状态 | 高       |
| `account.switch`            | 执行切换事务     | 高       |
| `account.deleteCredential`  | 删除安全凭据     | 高       |
| `task.cancel`               | 取消可取消任务   | 中       |

`game.detectInstallations` 和 `game.validateInstallation` 已实现。当前验证要求根目录同时存在 `Wuthering Waves.exe` 与 `Client/Binaries/Win64/Client-Win64-Shipping.exe`，并根据游戏 SDK 目录识别国服、国际服、Bilibili 和 WeGame。

`game.launch` 与 `game.getProcessState` 已实现。启动仅接受 `default`、`dx11`、`dx12` 三种渲染模式；Helper 会再次验证目录、阻止重复启动，并在启动器进程退出后继续跟踪实际客户端进程。

`game.stopAll` 已实现，用于用户明确启用“退出软件时关闭游戏”后终止 Helper 当前跟踪的游戏进程。Renderer 不能传入任意 PID；Main 仅调用 Helper 的受限方法，避免形成通用进程终止接口。

壁纸选择和读取使用 Main 内部的 `system.chooseWallpaper`、`system.loadWallpaper` 与 `system.getDefaultWallpaperDirectory` IPC。Main 支持默认目录、单张图片和文件夹模式，过滤受支持的图片扩展名、限制缩略图尺寸并缓存少量数据 URL；Renderer 不获得任意文件读取能力。`system.setAutoStart` 和 `system.setCloseGameOnExit` 分别管理开机启动与退出行为。自绘标题栏通过受限的 `system.controlWindow` 执行最小化、最大化/还原和关闭，不接受任意窗口句柄或系统命令。

兑换码使用 Main 内部的 `redemption.list`、`redemption.copy` 与 `redemption.markUsed` IPC。Main 分别从 WuWa Tools 中文页面和 Wuthering Waves Fandom MediaWiki 数据获取国服、国际服列表，写入 SQLite 后再返回 Renderer；复制仅写系统剪贴板，标记状态只更新数据库中的目标区服与兑换码。

安装实例列表使用 Main 内部的 `game.listInstallations` 和 `game.removeInstallation` IPC。它们不转发给 Helper：Main 负责 SQLite，Helper 只负责验证实际文件系统状态。移除操作不会删除游戏文件。

远端版本检测使用 Main 内部的 `game.checkVersion` IPC。Renderer 只传安装实例 ID，Main 从数据库取得可信区服信息并选择对应启动器索引。请求超时为 5 秒，成功结果缓存 5 分钟；失败返回 `unknown` 状态，不影响游戏启动。

`game.openUpdater` 只接受数据库中的安装实例 ID，由 Main 定位并打开对应官方启动器。当前应用不直接下载或覆盖游戏文件；检测到新版本时将“启动游戏”入口切换为“更新游戏”，实际更新仍交由官方启动器完成。

`account.activateLauncher` 只接受已扫描账户 ID。国服实现会解码 `%APPDATA%/KR_G152/A1381/KRSDKUserCache.json` 的 XOR 9 数据，更新 `last_login_cuid` 并调整 `account_list` 顺序后重新编码；启动游戏前会再次执行同步。Renderer 不接触 OAuth Code、缓存原文或任意路径。当前写入已有自动化样例覆盖，但完整备份、原子替换和失败回滚仍需在发布前补齐。

抽卡链接提取使用 Helper 的 `gacha.findConveneUrl`。Helper 最多读取日志末尾 64 MiB，使用共享读模式避免要求游戏退出，并支持 `Client.log` XOR 解码及国际服 `debug.log` 回退。Main 的 `gacha.copyConveneUrl` 会截留完整 URL、写入系统剪贴板，只向 Renderer 返回来源和结果状态。

## 5. 错误码

- `INVALID_ARGUMENT`
- `UNSUPPORTED_PROTOCOL`
- `HELPER_UNAVAILABLE`
- `PERMISSION_DENIED`
- `GAME_NOT_FOUND`
- `GAME_RUNNING`
- `INVALID_GAME_DIRECTORY`
- `REMOTE_VERSION_UNAVAILABLE`
- `ACCOUNT_NOT_FOUND`
- `CREDENTIAL_NOT_FOUND`
- `ACCOUNT_SWITCH_FAILED`
- `ACCOUNT_ROLLBACK_FAILED`
- `TASK_CANCELLED`
- `IO_ERROR`
- `INTERNAL_ERROR`

## 6. 兼容策略

- `protocolVersion` 只在破坏性变更时增加
- 新增字段默认可选，旧客户端应忽略未知字段
- Electron 启动时先调用 `system.health`
- Main 与 Helper 主协议不兼容时禁止执行写操作，并提示修复安装

## 7. 主页游戏配置 IPC

Electron 主进程提供以下受信任渲染进程接口：

- `game.getDisplaySettings(installationId)`：读取对应安装目录中的 `GameUserSettings.ini`。
- `game.saveDisplaySettings(installationId, input)`：校验显示模式与分辨率范围，更新配置并保留其他游戏设置。
- `game.checkVersion(installationId)`：先调用 Helper 的安装校验获取最新本地版本并更新安装仓库，再执行远端版本查询。
- `game.launch(input)`：可携带 `displayMode`、`width`、`height`。Main 与 Helper 分别校验枚举和数值范围，Helper 只生成固定格式的 `-ResX`、`-ResY`、`-fullscreen`、`-windowed` 和 `-borderless` 参数，不接收任意启动参数。

配置文件优先读取 `Client/Saved/Config/WindowsNoEditor/GameUserSettings.ini`，同时兼容 Unreal 新版本使用的 `Windows` 目录。
