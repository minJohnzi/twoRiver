# TwoRiver 文档

本目录保存当前有效的项目文档。文档主语言为中文；命令、路径、接口名称和配置项保留英文原文，便于直接复制和检索。

## 文档目录

- [Ubuntu 部署指南](deployment/ubuntu.md)：阿里云 Ubuntu ECS、GoDaddy DNS、Nginx、systemd、HTTPS、首次部署和增量更新流程。
- [日常运维手册](operations.md)：生产环境巡检、备份、恢复、发布、排障和安全注意事项。
- [项目测试清单](checklist.md)：公开页面、后台流程、API 行为、安全和性能的人工 QA 清单。

## 文档维护规则

- README 面向首次接手项目的人，保持简洁完整。
- `docs/deployment/ubuntu.md` 只记录部署到服务器所需的步骤。
- `docs/operations.md` 记录上线后的日常操作和事故处理。
- `docs/checklist.md` 记录人工验收项，不放实现计划。
- 本地 agent 或工具生成的计划文件不要提交到仓库，`docs/superpowers/` 已加入 `.gitignore`。

## 常用入口

首次部署：

```bash
bash scripts/deploy-setup.sh
```

已有服务器更新：

```bash
bash scripts/deploy-update.sh
```

本地验证：

```bash
pnpm typecheck
pnpm test
```
