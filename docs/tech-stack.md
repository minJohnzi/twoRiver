# TwoRiver 技术栈说明

本文档说明 TwoRiver Blog 当前使用的主要技术栈、项目分层、运行时依赖、测试工具和部署方式，便于新成员快速理解项目结构。

## 1. 项目概览

TwoRiver Blog 是一个基于 TypeScript 的中英双语技术博客系统，采用 pnpm workspace 管理 monorepo：

```text
.
|-- apps/
|   |-- api/       # Fastify API 服务
|   `-- web/       # React/Vite 前端应用
|-- packages/
|   `-- shared/    # 前后端共享 schema 与类型
|-- docs/          # 项目文档
|-- scripts/       # 部署、更新和诊断脚本
|-- package.json
`-- pnpm-workspace.yaml
```

整体架构是典型的前后端分离应用：

- 前端负责公开博客、后台管理、Markdown 预览、主题与语言切换。
- API 负责文章、分类、标签、关于页、认证、上传和 AI 辅助接口。
- SQLite 负责持久化博客内容、管理员账号、session 和上传文件引用。
- `packages/shared` 通过 Zod schema 统一前后端数据契约。

## 2. Monorepo 与工程化

| 类型 | 技术/工具 | 用途 |
| --- | --- | --- |
| 包管理 | pnpm 9.15.4 | workspace 管理、依赖安装、统一脚本入口 |
| 语言 | TypeScript 5.8 | 前端、后端、共享包统一类型系统 |
| 模块系统 | ESM | 根项目和各 package 均使用 `"type": "module"` |
| 编译目标 | ES2022 | 现代 Node.js 和浏览器环境 |
| 类型约束 | `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` | 提高类型安全和边界处理质量 |

根目录常用脚本：

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm lint
pnpm api:migrate
pnpm api:seed-admin
```

## 3. 前端技术栈

前端位于 `apps/web`，是一个 React 单页应用。

| 类型 | 技术/依赖 | 用途 |
| --- | --- | --- |
| UI 框架 | React 19、React DOM | 构建公开页面和后台管理界面 |
| 路由 | React Router DOM 7 | 首页、文章页、分类/标签页、关于页和后台路由 |
| 构建工具 | Vite 6 | 本地开发、生产构建和静态资源打包 |
| Markdown | marked | 将文章 Markdown 渲染为 HTML |
| 安全清洗 | DOMPurify | 清洗 Markdown 渲染后的 HTML，降低 XSS 风险 |
| 代码高亮 | highlight.js | 文章代码块高亮 |
| 图标 | Iconify React | 页面和管理界面图标 |
| 字体 | `@fontsource-variable/noto-serif-sc`、`@fontsource-variable/playfair-display` | 中文和展示字体资源 |
| 测试 | Vitest、Testing Library、jsdom | 组件、页面和前端工具函数测试 |

前端 Vite 配置要点：

- 开发环境把 `/api` 代理到 `http://localhost:4000`。
- 构建时将 Markdown 相关依赖和 React 相关依赖拆成独立 chunk。
- 测试环境使用 `jsdom`。
- 环境变量从仓库根目录读取，便于共享 `.env`。

## 4. 后端 API 技术栈

API 位于 `apps/api`，使用 Fastify 构建 HTTP 服务。

| 类型 | 技术/依赖 | 用途 |
| --- | --- | --- |
| HTTP 框架 | Fastify 5 | 路由、插件、请求生命周期和错误处理 |
| Cookie | `@fastify/cookie` | HTTP-only session cookie 签名与解析 |
| 文件上传 | `@fastify/multipart` | 后台图片上传 |
| 静态文件 | `@fastify/static` | 通过 `/uploads/` 暴露上传文件 |
| 数据库 | better-sqlite3 | 同步 SQLite 访问 |
| 密码哈希 | argon2 | 管理员密码存储与校验 |
| 数据校验 | Zod | 请求、响应和共享领域模型校验 |
| 开发运行 | tsx | TypeScript 后端开发热重载与脚本执行 |
| 测试 | Vitest | API、仓储、配置、上传和认证相关测试 |

API 当前包含的主要模块：

- `routes/`：公开接口、认证接口、后台文章/分类/标签/关于页/上传和资源管理接口。
- `repositories/`：SQLite 数据访问层。
- `services/`：session、密码、slug、上传清理、AI 辅助等领域逻辑。
- `db/`：SQLite 连接、schema 和迁移脚本。
- `plugins/auth.ts`：后台认证与 CSRF 校验相关能力。

API 在请求层设置了多项安全响应头：

- `Content-Security-Policy`
- `X-Content-Type-Options`
- `Referrer-Policy`
- `X-Frame-Options`
- 生产环境启用 `Strict-Transport-Security`

## 5. 数据与持久化

项目使用 SQLite 作为主数据库，默认路径由 `DATABASE_PATH` 控制：

```env
DATABASE_PATH=./apps/api/data/blog.sqlite
```

数据层特点：

- 通过 `better-sqlite3` 直接访问 SQLite。
- schema 定义在 `apps/api/src/db/schema.sql`。
- 迁移入口为 `pnpm api:migrate`。
- 管理员初始化入口为 `pnpm api:seed-admin`。
- 上传文件保存在 SQLite 数据库同级目录下的 `uploads/` 目录。

备份时需要同时保留：

```text
SQLite 数据库文件
uploads/ 上传文件目录
```

## 6. 共享类型与数据契约

共享包位于 `packages/shared`，核心依赖是 Zod。

它提供：

- `Locale`、`PostStatus` 等基础枚举。
- 文章、分类、标签、关于页等领域 schema。
- 登录、分页、文章 upsert 等输入 schema。
- 由 schema 推导出的 TypeScript 类型。

这种设计让前端和 API 共用同一套数据契约，减少接口字段漂移和重复定义。

## 7. 认证、安全与上传

后台管理采用单管理员工作流：

- 管理员密码使用 Argon2 哈希。
- 登录态使用 HTTP-only session cookie。
- 后台写操作校验 CSRF token。
- CORS 生产来源由 `CORS_ALLOWED_ORIGINS` 显式配置。
- 生产环境拒绝默认 `SESSION_SECRET` 和 `ADMIN_PASSWORD`。

上传能力：

- 支持文章图片、关于页头像和后台资源管理文件上传。
- 通过 `@fastify/multipart` 接收文件。
- 单图大小限制由 API 上传服务控制。
- 静态访问路径为 `/uploads/...`。
- 手动管理资源保存在 `uploads/resources/`，适合放可公开访问的 PDF、文本、字体和 Markdown 素材。
- 提供孤儿上传文件清理逻辑和诊断脚本，清理时会保留手动管理资源。

## 8. AI 辅助能力

项目预留了 DeepSeek 兼容 AI 服务：

```env
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

当前 API 中的 AI 服务模块包括：

- 摘要草稿辅助。
- 标签建议。
- 翻译草稿辅助。

这些能力是可选配置；未配置 API key 时，核心博客和后台管理流程仍可运行。

## 9. 测试体系

| 测试层级 | 技术/命令 | 说明 |
| --- | --- | --- |
| 脚本测试 | `node --test scripts/*.test.mjs` | 根目录脚本测试 |
| 前端单元/组件测试 | `pnpm --filter @tworiver/web test` | Vitest、Testing Library、jsdom |
| API 测试 | `pnpm --filter @tworiver/api test` | Fastify app、数据库、认证、上传和仓储测试 |
| 端到端测试 | `pnpm test:e2e` | Playwright |
| 类型检查 | `pnpm typecheck` | 全 workspace TypeScript 检查 |
| 构建验证 | `pnpm build` | 全 workspace 构建 |
| 编码检查 | `pnpm check:encoding` | 检查 UTF-8 文本内容 |

CI 和本地验证建议执行：

```bash
pnpm check:encoding
pnpm typecheck
pnpm test
pnpm build
```

## 10. 部署与运行环境

项目面向轻量 Ubuntu 服务器部署：

| 类型 | 技术/工具 | 用途 |
| --- | --- | --- |
| Web 服务器 | Nginx | 托管前端静态文件、反向代理 API |
| 进程管理 | systemd | 运行 Fastify API 服务 |
| HTTPS | Let's Encrypt / Certbot | 免费 TLS 证书 |
| DNS | GoDaddy 指向 Aliyun ECS | 域名解析到服务器 |
| 部署脚本 | Bash | 首次部署、增量更新、强制重建和诊断 |

部署脚本：

```bash
bash scripts/deploy-setup.sh
bash scripts/deploy-update.sh
```

生产部署模型：

- 前端构建产物位于 `apps/web/dist`。
- API 通过 `node dist/src/main.js` 运行。
- Nginx 对外提供 HTTPS 和静态资源服务。
- API 端口默认 `4000`，生产环境建议只允许本机访问。

## 11. 关键环境变量

| 变量 | 说明 |
| --- | --- |
| `NODE_ENV` | 运行环境：`development`、`test` 或 `production` |
| `PORT` | Fastify API 端口，默认 `4000` |
| `DATABASE_PATH` | SQLite 数据库路径 |
| `SESSION_SECRET` | session 签名密钥 |
| `ADMIN_USERNAME` | 初始管理员用户名 |
| `ADMIN_PASSWORD` | 初始管理员密码 |
| `CORS_ALLOWED_ORIGINS` | 生产环境允许的浏览器来源 |
| `DEEPSEEK_API_KEY` | 可选 AI 服务 API key |
| `DEEPSEEK_BASE_URL` | DeepSeek 兼容 API base URL |
| `VITE_API_BASE_URL` | 前端 API base URL |

## 12. 技术栈总结

TwoRiver Blog 的技术选型偏轻量、可维护和易部署：

- 使用 TypeScript 统一前后端语言和类型系统。
- 使用 React/Vite 提供快速前端开发和静态构建。
- 使用 Fastify 和 SQLite 降低后端运行复杂度。
- 使用 Zod 共享数据契约，提升接口可靠性。
- 使用 pnpm workspace 管理多 package 项目。
- 使用 Vitest、Testing Library、Playwright 和 TypeScript 类型检查覆盖主要质量关口。
- 使用 Nginx、systemd、Bash 脚本和 SQLite 文件备份适配单机部署场景。
