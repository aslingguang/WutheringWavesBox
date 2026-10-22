# 数据模型

## 1. SQLite 原则

- 开启外键约束和 WAL
- 所有结构变化通过迁移文件完成
- 时间统一以 UTC ISO 8601 或 Unix 毫秒保存
- 用户可见时间在 UI 按时区转换
- URL、Token、Cookie 和账号票据不进入数据库

## 2. 核心表

### `game_installations`

| 字段               | 类型         | 说明                                 |
| ------------------ | ------------ | ------------------------------------ |
| `id`               | TEXT PK      | UUID/ULID                            |
| `name`             | TEXT         | 显示名称                             |
| `region`           | TEXT         | `cn` / `global`                      |
| `root_path`        | TEXT         | 游戏根目录                           |
| `executable_path`  | TEXT         | 可执行文件                           |
| `local_version`    | TEXT NULL    | 最近读取的已安装客户端（资源包）版本 |
| `last_verified_at` | INTEGER NULL | 最近验证时间                         |

该表已在 Electron Main 中使用 Node 24 内置 SQLite 实现。数据库位于 Electron `userData/data.db`，启用 WAL 与外键约束；自动探测和手动选择使用相同 ID 幂等更新。移除安装记录只删除数据库行，不操作游戏文件。

### `account_profiles`

| 字段              | 类型      | 说明                    |
| ----------------- | --------- | ----------------------- |
| `id`              | TEXT PK   | 账号档案 ID             |
| `display_name`    | TEXT      | 自定义名称              |
| `region`          | TEXT      | 区服                    |
| `player_id`       | TEXT NULL | 游戏 UID，仅用于展示    |
| `installation_id` | TEXT NULL | 关联的游戏安装 ID       |
| `note`            | TEXT NULL | 用户备注，最多 120 字符 |
| `active`          | INTEGER   | 是否为当前档案          |
| `created_at`      | INTEGER   | 创建时间                |

当前实现不保存任何凭据或安全存储引用。

### `gacha_records`

| 字段            | 类型    | 说明                         |
| --------------- | ------- | ---------------------------- |
| `record_id`     | TEXT    | 服务端唤取记录 ID            |
| `record_order`  | INTEGER | 同一卡池接口响应中的顺序索引 |
| `player_id`     | TEXT    | 玩家 UID                     |
| `pool_type`     | TEXT    | 卡池类型                     |
| `resource_id`   | INTEGER | 资源 ID                      |
| `quality_level` | INTEGER | 星级                         |
| `resource_type` | TEXT    | 角色/武器等                  |
| `name`          | TEXT    | 名称快照                     |
| `time`          | TEXT    | 抽取时间                     |
| `imported_at`   | INTEGER | 导入时间                     |

复合主键为 `(player_id, pool_type, record_id)`。重复导入同一批记录时使用 `INSERT OR IGNORE` 去重；同一十连内名称和时间相同但记录 ID 不同的结果会分别保留。旧结构会在启动时自动迁移，既有记录使用稳定的 `legacy|rowid` 标识。

再次导入时，服务端记录会先按 UID、卡池、资源、名称和时间认领对应的 `legacy|` 记录，再补充其他服务端 ID。这样不会把迁移前的数据重复插入，也能恢复旧复合键曾合并的同时间同名记录。

同一秒内的记录按 `record_order` 升序保存为“新到旧”的接口顺序，分析时反转为真实时间顺序计算保底。旧数据库自动增加该字段，重新分析后会用当前接口顺序校正。

### `gacha_import_batches`

保存导入方式、开始/结束时间、成功数、重复数和错误数；不保存完整敏感 URL。

### `redemption_codes`

| 字段          | 类型      | 说明                 |
| ------------- | --------- | -------------------- |
| `region`      | TEXT      | `cn` / `global`      |
| `code`        | TEXT      | 大小写不敏感的兑换码 |
| `description` | TEXT NULL | 适用范围或说明       |
| `reward`      | TEXT NULL | 奖励快照             |
| `valid`       | INTEGER   | 数据源标记是否有效   |
| `used`        | INTEGER   | 用户是否已使用       |
| `start_time`  | TEXT NULL | 数据源提供的生效时间 |
| `end_time`    | TEXT NULL | 数据源提供的失效时间 |
| `source`      | TEXT      | 最近同步来源         |
| `updated_at`  | INTEGER   | 最近同步时间         |

复合主键为 `(region, code)`，因此同一区服内的兑换码不可重复；同一码可在国服与国际服分别存在并独立记录使用状态。网页同步使用 UPSERT 更新来源字段，但不会覆盖用户的 `used` 标记。

### `settings`

使用 `(key, value_json)` 保存非敏感设置。安全相关功能开关应有显式默认值，不能因字段缺失而自动开启。

## 3. 备份格式

- 导出文件包含 `schemaVersion`、`exportedAt` 和各数据集合
- 默认不导出凭据
- 用户主动选择包含账号切换状态时，应生成加密备份并要求密码
- 导入前验证版本、大小、记录数量和字段格式
