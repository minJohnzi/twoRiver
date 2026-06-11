# TwoRiver Blog

TwoRiver Blog 是一个极简的中英双语技术博客。它由 React/Vite 前端、Fastify API、SQLite 持久化和单管理员发布工作流组成，适合部署到一台轻量 Ubuntu 服务器上。

## 功能特性

- 支持中文和英文两套文章内容
- 公开博客页面包含首页、文章详情、分类、标签、关于页、Markdown 渲染和代码高亮
- 管理员登录使用 HTTP-only session cookie 保护，并对后台写操作校验 CSRF token
- 后台文章编辑器支持草稿/发布状态、分类、标签分配、Markdown 预览和 AI 辅助草稿
- 支持在文章 Markdown 中上传图片，也支持上传关于页头像，文件存储在数据库目录下
- 前后端共享 Zod schema，保证类型一致
- 提供 SQLite 迁移和管理员初始化脚本
- 可选 DeepSeek 兼容 AI 服务，用于摘要、标签和翻译草稿辅助

## 技术栈

- **包管理：** pnpm workspace
- **前端：** React 19、React Router、Vite、marked、highlight.js
- **API：** Fastify、better-sqlite3、argon2、Zod
- **共享包：** TypeScript schema 和推导类型
- **测试：** Vitest、Testing Library、jsdom

## 仓库结构

```text
.
|-- apps/
|   |-- api/          # Fastify API、SQLite schema、repositories、routes、tests
|   `-- web/          # React/Vite 前端
|-- packages/
|   `-- shared/       # 共享 Zod schema 和 TypeScript 类型
|-- docs/
|   |-- deployment/   # Ubuntu 部署说明
|   |-- operations.md # 日常运维、备份和恢复
|   `-- checklist.md  # 手动 QA 清单
|-- scripts/          # 服务器部署和更新脚本
|-- .env.example
|-- package.json
`-- pnpm-workspace.yaml
```

## 环境要求

- 推荐 Node.js 22 或更新版本
- pnpm 9.15.4，需与 `package.json` 中的 `packageManager` 字段一致

## 快速开始

安装依赖：

```bash
pnpm install
```

创建本地环境变量文件：

```bash
cp .env.example .env
```

首次运行前需要编辑 `.env`。本地开发时大部分默认值可直接使用，但 `SESSION_SECRET` 至少需要 32 个字符，`ADMIN_PASSWORD` 至少需要 12 个字符。

执行数据库迁移并初始化第一个管理员：

```bash
pnpm api:migrate
pnpm api:seed-admin
```

同时启动 API 和前端：

```bash
pnpm dev
```

默认地址：

- API：`http://localhost:4000`
- 前端：Vite 会输出本地访问地址，通常是 `http://localhost:5173`
- 管理员登录：`/admin/login`

## 环境变量

| 名称 | 用途 | 默认值/示例 |
| --- | --- | --- |
| `NODE_ENV` | 运行模式：`development`、`test` 或 `production` | `development` |
| `PORT` | Fastify API 端口 | `4000` |
| `DATABASE_PATH` | SQLite 数据库文件路径 | `./apps/api/data/blog.sqlite` |
| `SESSION_SECRET` | Session 签名密钥，请使用足够长的随机值 | `replace-with-at-least-32-random-characters` |
| `ADMIN_USERNAME` | 初始化管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 初始化管理员密码，至少 12 个字符 | `change-me-before-deploy` |
| `CORS_ALLOWED_ORIGINS` | 生产环境可信浏览器来源，逗号分隔 | `https://example.me,https://www.example.me` |
| `DEEPSEEK_API_KEY` | 可选 AI 辅助服务 API Key | 空 |
| `DEEPSEEK_BASE_URL` | DeepSeek 兼容 API Base URL | `https://api.deepseek.com` |
| `VITE_API_BASE_URL` | 前端 API Base URL | `http://localhost:4000` |

生产环境启动时会拒绝默认的 `SESSION_SECRET` 和 `ADMIN_PASSWORD`，部署前必须替换。生产环境也要求配置 `CORS_ALLOWED_ORIGINS`。

如果通过 Nginx 做同源生产部署，不要设置 `VITE_API_BASE_URL`；前端应直接请求同域下的 `/api/...`。

上传图片存储在 `<database-dir>/uploads/` 下，其中 `<database-dir>` 是 `DATABASE_PATH` 所在目录。备份时需要同时备份 SQLite 数据库和 `uploads/` 目录。

更多运行、备份和排障建议见 [docs/operations.md](docs/operations.md)。

## 常用命令

```bash
pnpm dev              # 开发模式同时运行 API 和前端
pnpm build            # 构建所有 workspace package
pnpm typecheck        # 类型检查所有 workspace package
pnpm test             # 运行全部测试
pnpm test:e2e         # 运行 Playwright 端到端测试
pnpm lint             # 运行各 package 的 lint/type-check 脚本
pnpm api:migrate      # 执行 SQLite schema 迁移
pnpm api:seed-admin   # 创建或更新配置中的管理员用户
```

也可以运行 package 级命令：

```bash
pnpm --filter @tworiver/api test
pnpm --filter @tworiver/web test
pnpm --filter @tworiver/api build
pnpm --filter @tworiver/web build
```

## 部署脚本

Ubuntu 服务器首次交互式部署：

```bash
bash scripts/deploy-setup.sh
```

有新提交后的复用更新流程：

```bash
bash scripts/deploy-update.sh
```

如果 `git pull` 没有带来新提交，更新脚本会自动跳过部署。需要强制重新构建和重启时可以使用：

```bash
bash scripts/deploy-update.sh --force
```

在服务器上运行脚本前，可以先做 Bash 语法检查：

```bash
bash -n scripts/deploy-setup.sh
bash -n scripts/deploy-update.sh
```

## API 概览

公开接口：

- `GET /api/health`
- `GET /api/posts`
- `GET /api/posts/:slug`
- `GET /api/tags`
- `GET /api/tags/:slug`
- `GET /api/categories`
- `GET /api/categories/:slug`
- `GET /api/about`

认证接口：

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

后台接口需要有效 session cookie：

- `GET /api/admin/posts`
- `POST /api/admin/posts`
- `GET /api/admin/posts/:id`
- `PUT /api/admin/posts/:id`
- `DELETE /api/admin/posts/:id`
- `POST /api/admin/uploads/images`
- `POST /api/admin/uploads/about-avatar`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/tags`
- `POST /api/admin/tags`
- `PUT /api/admin/tags/:id`
- `DELETE /api/admin/tags/:id`
- `GET /api/admin/about`
- `PUT /api/admin/about`

## 内容模型

文章包含：

- URL 安全的 `slug`
- `draft` 或 `published` 状态
- 可选的 `publishedAt` 发布时间
- 可选分类
- 零个或多个标签
- 一个或多个 `zh` / `en` 翻译版本

每个翻译版本包含标题、摘要、Markdown 正文和可选 SEO 元数据。

## 图片上传

后台编辑器支持通过按钮、拖拽和粘贴上传图片。第一版只支持图片文件：

- 支持 `jpg` / `jpeg`、`png`、`webp`、`gif`
- 单图大小限制为 10MB
- 原样保存，不压缩、不转码
- 图片按文章稳定 `uid` 存储在 `<database-dir>/uploads/images/posts/<post_uid>/`
- 删除文章时会 best-effort 清理该文章对应的图片目录

新文章需要先保存为草稿，获得文章 `uid` 后才能上传图片。

关于页头像通过独立上传接口保存到 `<database-dir>/uploads/images/about/`。替换头像后，建议在定期巡检时清理不再被引用的旧头像文件。

## 部署

文档入口见 [docs/README.md](docs/README.md)。Ubuntu 部署流程见 [docs/deployment/ubuntu.md](docs/deployment/ubuntu.md)，内容包括：

- 使用 Nginx 托管静态前端
- 使用 systemd 运行 Fastify API
- 首次交互式部署脚本和可复用更新脚本
- GoDaddy DNS 指向 Aliyun ECS 公网 IP
- 使用 Let's Encrypt 免费 HTTPS 证书
- SQLite 和上传图片存储在部署项目的数据目录下

历史计划文档不再提交到仓库；本地生成的 `docs/superpowers/` 已加入 `.gitignore`。
