# TwoRiver 日常运维手册

这份文档记录 TwoRiver Blog 上线后的常用操作。部署步骤见 [Ubuntu 部署指南](deployment/ubuntu.md)，人工验收项见 [项目测试清单](checklist.md)。

## 1. 生产目录约定

默认部署脚本使用以下路径：

```text
/home/twoRiver                  项目目录
/home/twoRiver/.env             生产环境变量
/home/twoRiver/apps/api/data    SQLite 数据库和上传文件目录
/home/twoRiver/apps/web/dist    前端构建产物
/etc/systemd/system/tworiver-api.service
/etc/nginx/sites-available/tworiver
```

如果服务器使用了自定义路径，请以实际 `.env` 中的 `DATABASE_PATH` 和 systemd 配置为准。

## 2. 常规巡检

登录服务器后建议依次检查：

```bash
cd /home/twoRiver
git status --short
systemctl status tworiver-api --no-pager
nginx -t
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS https://example.me/api/health
df -h
du -sh apps/api/data
```

重点关注：

- API 服务是否持续运行。
- Nginx 配置是否有效。
- HTTPS 域名和 `/api/health` 是否正常。
- 磁盘剩余空间是否充足，尤其是 `apps/api/data/uploads/`。
- `git status` 是否存在服务器上的未提交改动。

## 3. 发布更新

常规更新：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh
```

没有新提交但需要强制重新构建：

```bash
bash scripts/deploy-update.sh --force
```

## TipTap 小批量转换上线

在开启 TipTap 发布闸门前，先按“小批量、可回退、可核对”的方式转换少量文章：

1. 部署前确认数据库和 `apps/api/data/uploads` 已完成备份，且当前工作树干净。
2. 先只开启 `VITE_TIPTAP_NEW_ARTICLE_ENABLED=true`，继续保持 `TIPTAP_PUBLISH_ENABLED=false` 和 `VITE_TIPTAP_PUBLISH_ENABLED=false`。
3. 选择 3–5 篇低风险文章作为首批转换对象，优先选择：
   - 结构简单、最近有人审阅过的文章；
   - 含图片、标题、列表等常见结构，能覆盖真实编辑路径；
   - 不要先拿首页高流量或强 SEO 依赖文章做第一批。
4. 每篇文章都先在后台执行“预检 TipTap 转换”，确认没有 blocker，再执行“转换为富文本”。
5. 转换后逐篇检查：
   - 富文本编辑器是否能正常加载；
   - 兼容 Markdown 投影是否仍可阅读；
   - “恢复 Markdown 快照”按钮是否可见；
   - 图片、链接、代码块、表格是否仍能正确预览。
6. 若文章需要双语，先完成 TipTap AI 翻译，再由编辑人工审阅目标语言草稿；结构漂移或翻译失败时不要手动覆盖原文，保留原语言并重试。
7. 首批文章全部通过人工验收后，再开启 `TIPTAP_PUBLISH_ENABLED=true` 与 `VITE_TIPTAP_PUBLISH_ENABLED=true`，发布这批文章。
8. 发布后至少观察一个发布窗口，重点检查：
   - `/posts/:slug` 公开页是否正常渲染；
   - 首页列表、目录、代码高亮、图片灯箱是否正常；
   - API 日志中是否出现 TipTap 渲染或翻译错误；
   - 是否有人误把已转换文章又降级保存回 Markdown。
9. 若发现线上问题，优先使用文章级“恢复 Markdown 快照”回退单篇内容；只有当问题影响面较大时，才考虑关闭 TipTap 发布闸门并执行代码回滚。

推荐节奏：第一批 3–5 篇，稳定后扩展到 10–20 篇，再评估是否把 TipTap 设为新文章默认格式。

只更新前端：

```bash
bash scripts/deploy-update.sh --frontend-only
```

只更新 API：

```bash
bash scripts/deploy-update.sh --api-only
```

更新脚本会在迁移前备份 SQLite，在重新构建前备份前端 `dist`。如果部署失败，优先查看脚本输出中的备份路径和诊断命令。

## 4. 备份

生产数据由两部分组成：

```text
SQLite 数据库：DATABASE_PATH 指向的 .sqlite 文件
上传文件：DATABASE_PATH 同级目录下的 uploads/
```

手动备份示例：

```bash
cd /home/twoRiver
timestamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
cp -a apps/api/data/blog.sqlite "backups/blog.sqlite.$timestamp"
tar -czf "backups/uploads.$timestamp.tar.gz" -C apps/api/data uploads
```

备份完成后建议检查文件大小：

```bash
ls -lh backups
```

如果要把备份复制到本地电脑，可在本地执行：

```bash
scp root@example.me:/home/twoRiver/backups/blog.sqlite.20260611-120000 .
scp root@example.me:/home/twoRiver/backups/uploads.20260611-120000.tar.gz .
```

## 5. 恢复

恢复前先停止 API，避免 SQLite 文件正在被写入：

```bash
systemctl stop tworiver-api
cd /home/twoRiver
cp -a apps/api/data/blog.sqlite "apps/api/data/blog.sqlite.before-restore.$(date +%Y%m%d-%H%M%S)"
cp -a backups/blog.sqlite.20260611-120000 apps/api/data/blog.sqlite
tar -xzf backups/uploads.20260611-120000.tar.gz -C apps/api/data
systemctl start tworiver-api
curl -fsS http://127.0.0.1:4000/api/health
```

恢复后打开前台页面和后台页面，重点检查文章、关于页头像和文章内图片是否正常显示。

## 6. 管理员账号

如果需要重置管理员账号或密码，先编辑 `/home/twoRiver/.env`：

```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-new-password
```

然后执行：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh --seed-admin --force --skip-pull --skip-build --skip-migrate
```

`ADMIN_PASSWORD` 至少需要 12 个字符。生产环境不要使用 `.env.example` 中的默认值。

## 7. 上传文件清理

文章图片位于：

```text
apps/api/data/uploads/images/posts/<post_uid>/
```

删除文章时，API 会尽力删除对应文章图片目录。关于页头像位于：

```text
apps/api/data/uploads/images/about/
```

关于页头像替换后，旧头像文件不会自动删除。清理前先确认当前后台关于页保存的头像 URL，只删除不再被引用的文件。

## 8. 常见排障命令

API 日志：

```bash
journalctl -u tworiver-api -n 100 --no-pager
```

Nginx 日志：

```bash
tail -n 100 /var/log/nginx/error.log
tail -n 100 /var/log/nginx/access.log
```

端口监听：

```bash
ss -lntp
```

域名解析：

```bash
nslookup example.me
nslookup www.example.me
```

证书续期检查：

```bash
certbot renew --dry-run
```

## 9. 安全注意事项

- `.env` 不要提交到 Git。
- `SESSION_SECRET` 使用 `openssl rand -hex 32` 生成。
- `CORS_ALLOWED_ORIGINS` 只填写可信域名。
- 服务器只对公网开放 `22`、`80`、`443`，不要开放 API 端口 `4000`。
- 定期更新系统安全补丁，并保留最近几次数据库和上传目录备份。

## CI and local verification

Pull requests and pushes to `main` run the GitHub Actions workflow in `.github/workflows/ci.yml`.
The workflow installs dependencies with pnpm, then runs:

```bash
pnpm check:encoding
pnpm typecheck
pnpm test
pnpm build
```

Run the same commands locally before deployment when possible. On Windows PowerShell, if `pnpm` is blocked by execution policy, use the `.cmd` shim, for example:

```powershell
C:\nvm4w\nodejs\pnpm.cmd check:encoding
```

`pnpm check:encoding` validates decoded UTF-8 text content. It is intended to catch real replacement characters or mojibake committed to the repository; terminal display issues alone should not fail the check.

## Upload cleanup

The API includes `cleanupOrphanUploads(config, db, { dryRun })` in `apps/api/src/services/uploads/orphanCleanupService.ts`.
Use dry-run mode first before deleting files:

```bash
pnpm --filter @tworiver/api cleanup:uploads
pnpm --filter @tworiver/api cleanup:uploads -- --delete
```

The cleanup keeps upload files referenced by post Markdown, the about avatar URL, and manually managed files under `uploads/resources/`. It removes empty upload subdirectories after deletion, and reports or removes unreferenced files elsewhere under the configured uploads root.
