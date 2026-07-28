# 项目文档

本目录只保留需要随代码长期维护的文档。历史实施清单和一次性迁移记录不在仓库中继续维护；功能变化记录在根目录 `CHANGELOG.md`，待办事项应进入项目 Issue。

## 产品与设计

- [产品要求](product.md)：功能范围、用户流程和长期约束。
- [总体架构](architecture.md)：Renderer、Preload、Main、Helper 和数据层边界。
- [项目结构](project-structure.md)：当前仓库目录、模块职责和依赖方向。
- [数据模型](data-model.md)：SQLite 实体、唯一键和数据保留规则。

## 接口与安全

- [IPC 与 Helper 协议](ipc-and-helper-protocol.md)：跨进程接口、协议版本与错误处理。
- [安全与隐私](security.md)：凭据、日志、网络、文件写入和发布安全要求。
- [版本元数据](version-metadata.md)：抽卡版本资料的来源、校验和冲突处理。

## 开发与交付

- [开发指南](development.md)：环境、代码规范、主题字体规范和工作流。
- [测试与发布](testing-and-release.md)：测试层次、质量门禁、构建产物和发布检查。
- [架构决策记录](adr/README.md)：影响长期技术方向的已接受决策。

面向使用者的功能说明、快速开始和构建命令以根目录 [README](../README.md) 为准。
