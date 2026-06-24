
# 0. 安全测试总目标

你的项目安全重点不是传统企业后台那种复杂权限，而是这几类：

```text
1. 后台管理员不能被绕过登录
2. session cookie 和 CSRF 不能被利用
3. Markdown 渲染不能造成 XSS
4. /uploads/ 上传文件不能变成攻击入口
5. SQLite 数据库文件不能泄露、损坏或被注入攻击影响
6. Zod schema 必须真正覆盖请求输入和响应输出
7. CORS、CSP、安全响应头必须和前后端分离架构匹配
8. Nginx 不能暴露 API 端口、数据库文件、.env、uploads 目录列表
9. DeepSeek API Key 不能泄露，AI 辅助接口不能被滥用
10. pnpm workspace 依赖、构建产物、部署脚本不能泄露密钥
```

OWASP WSTG 的输入验证测试覆盖反射型 XSS、存储型 XSS、HTTP Verb Tampering、HTTP 参数污染、SQL 注入、ORM 注入、命令注入、Host Header Injection 等内容，非常适合作为你这个项目的基础测试框架。([OWASP Foundation][1])

---

# 1. 上线前 P0 必测清单

这些不通过，不建议上线。

```text
认证与后台
[ ] 未登录访问 /admin 会跳转登录页
[ ] 未登录访问 /admin/posts/new 不能进入
[ ] 未登录请求 POST /api/admin/posts 返回 401
[ ] 未登录请求 PUT /api/admin/posts/:id 返回 401
[ ] 未登录请求 DELETE /api/admin/posts/:id 返回 401
[ ] 未登录请求 POST /api/admin/upload 返回 401
[ ] 错误 session cookie 不能访问后台接口
[ ] 过期 session cookie 不能访问后台接口
[ ] 退出登录后旧 session 不能继续使用
[ ] 登录失败不会提示“用户名存在”
[ ] 登录接口有限流

密码与 session
[ ] 管理员密码使用 Argon2 哈希
[ ] SQLite users/admin 表中没有明文密码
[ ] 生产环境拒绝默认 ADMIN_PASSWORD
[ ] 生产环境拒绝默认 SESSION_SECRET
[ ] SESSION_SECRET 足够长且随机
[ ] session cookie 设置 HttpOnly
[ ] 生产环境 session cookie 设置 Secure
[ ] session cookie 设置 SameSite=Lax 或 Strict
[ ] session cookie 不出现在 URL 中
[ ] 日志中不记录完整 cookie/session

CSRF
[ ] 后台写操作必须带 CSRF token
[ ] POST /api/admin/posts 不带 CSRF 返回 403
[ ] PUT /api/admin/posts/:id 不带 CSRF 返回 403
[ ] DELETE /api/admin/posts/:id 不带 CSRF 返回 403
[ ] POST /api/admin/upload 不带 CSRF 返回 403
[ ] 修改站点设置不带 CSRF 返回 403
[ ] GET 请求不能执行写操作
[ ] CSRF token 不能被跨站页面直接获取

Markdown / XSS
[ ] marked 渲染后的 HTML 必须经过 DOMPurify
[ ] 文章标题不能执行脚本
[ ] 文章摘要不能执行脚本
[ ] Markdown 正文不能执行 script
[ ] Markdown 中 img onerror 不能执行
[ ] Markdown 中 javascript: 链接不能执行
[ ] 代码块中的 HTML/JS 只显示，不执行
[ ] 后台 Markdown 预览也要经过清洗
[ ] 搜索关键词回显不能 XSS
[ ] 分类名、标签名、关于页内容不能 XSS

上传
[ ] 未登录不能上传
[ ] 上传接口必须校验 CSRF
[ ] 只允许 jpg / jpeg / png / webp / gif
[ ] 默认禁止 svg
[ ] 禁止 php / js / html / sh / exe
[ ] 禁止 shell.php.jpg 双后缀绕过
[ ] 禁止路径穿越文件名
[ ] 文件名由服务端生成，不使用原始文件名
[ ] 上传目录不能执行脚本
[ ] /uploads/ 不能列目录
[ ] 上传文件大小有限制
[ ] 上传文件 MIME 和文件内容都要校验

SQLite
[ ] DATABASE_PATH 不在 web 可访问目录
[ ] SQLite 文件不能通过浏览器访问
[ ] SQLite -wal / -shm 文件不能通过浏览器访问
[ ] 数据库文件权限仅允许 API 运行用户读写
[ ] 数据库备份文件不能放在 web 根目录
[ ] 所有 SQL 查询使用参数绑定
[ ] 搜索、slug、分类、标签参数不能 SQL 注入

Nginx / 部署
[ ] API 4000 端口只允许本机访问
[ ] Nginx 对外只开放 80 / 443
[ ] HTTP 自动跳转 HTTPS
[ ] HTTPS 证书有效
[ ] .env 不能访问
[ ] .git 不能访问
[ ] package.json 不公开，或确认无敏感信息
[ ] uploads 目录关闭 autoindex
[ ] 生产环境 NODE_ENV=production
[ ] systemd 环境变量权限正确

密钥
[ ] .env 没有提交 Git
[ ] 打包后的 dist 中没有 SESSION_SECRET
[ ] 打包后的 dist 中没有 ADMIN_PASSWORD
[ ] 打包后的 dist 中没有 DEEPSEEK_API_KEY
[ ] 前端只暴露 VITE_API_BASE_URL 这类可公开变量
[ ] DeepSeek API Key 只在 API 服务端读取
```

---

# 2. Monorepo / pnpm workspace 安全测试

你的项目是 pnpm workspace monorepo，结构里有 `apps/api`、`apps/web`、`packages/shared`、`scripts`、`docs`。

## 2.1 workspace 边界测试

```text
[ ] apps/web 不能 import apps/api 内部服务代码
[ ] apps/web 不能 import 服务端 env 读取模块
[ ] packages/shared 只能放 schema/type，不能放密钥或服务端实现
[ ] packages/shared 中不能包含 DATABASE_PATH / SESSION_SECRET / DEEPSEEK_API_KEY
[ ] scripts 里的部署脚本不能打印完整密钥
[ ] docs 里不能包含真实管理员密码、服务器 IP 私密信息、API Key
```

## 2.2 依赖安装安全

```text
[ ] pnpm-lock.yaml 已提交
[ ] 生产环境使用 pnpm install --frozen-lockfile
[ ] 不使用 npm install 混装
[ ] 根 package.json scripts 没有危险命令
[ ] preinstall / postinstall 脚本经过审查
[ ] 没有使用来源不明的私有包
[ ] 没有把测试依赖打进生产 API 包
```

建议执行：

```bash
pnpm audit
pnpm list --depth 3
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

---

# 3. TypeScript / ESM / 类型边界测试

你的项目使用 TypeScript 5.8、ESM、ES2022，并开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`。

## 3.1 类型检查

```text
[ ] pnpm typecheck 通过
[ ] 没有使用 any 绕过核心 API 输入
[ ] 没有使用 as unknown as 强转请求体
[ ] 没有对 req.body 直接信任
[ ] 没有对 req.query 直接信任
[ ] 没有对 req.params 直接信任
[ ] 所有外部输入最终都经过 Zod 校验
[ ] 类型定义和数据库字段保持一致
```

## 3.2 ESM / 路径安全

```text
[ ] 没有动态 import 用户可控路径
[ ] 没有把用户输入拼接成本地文件路径
[ ] 上传文件路径通过 path.resolve 后校验仍在 uploads 目录下
[ ] scripts 中没有 eval / new Function 执行用户输入
```

---

# 4. React 19 / Vite 6 前端安全测试

你的前端是 React SPA，负责公开博客、后台管理、Markdown 预览、主题和语言切换。

## 4.1 前端路由保护

```text
[ ] /admin 未登录不能访问
[ ] /admin/posts 未登录不能访问
[ ] /admin/posts/new 未登录不能访问
[ ] /admin/settings 未登录不能访问
[ ] 刷新后台页面后仍然校验登录态
[ ] 浏览器后退不能看到已退出登录的后台敏感页面
[ ] 前端路由守卫失败时，后端 API 仍然拒绝请求
```

注意：前端路由保护只是体验层，真正安全必须靠 Fastify API 鉴权。

## 4.2 Vite 环境变量泄露测试

Vite 中带 `VITE_` 前缀的变量会进入前端构建产物，所以要重点检查。

```text
[ ] VITE_API_BASE_URL 可以公开
[ ] SESSION_SECRET 没有 VITE_ 前缀
[ ] ADMIN_PASSWORD 没有 VITE_ 前缀
[ ] DEEPSEEK_API_KEY 没有 VITE_ 前缀
[ ] DATABASE_PATH 没有 VITE_ 前缀
[ ] dist/assets/*.js 中没有敏感变量
[ ] 生产 sourcemap 没有暴露敏感信息
```

检查命令：

```bash
grep -R "SESSION_SECRET" apps/web/dist || true
grep -R "ADMIN_PASSWORD" apps/web/dist || true
grep -R "DEEPSEEK_API_KEY" apps/web/dist || true
grep -R "DATABASE_PATH" apps/web/dist || true
grep -R "sqlite" apps/web/dist || true
```

## 4.3 React XSS 测试

```text
[ ] 没有直接渲染未清洗 HTML
[ ] 所有 dangerouslySetInnerHTML 都有 DOMPurify 清洗
[ ] 后台文章预览使用同一套 sanitize 逻辑
[ ] 分类名、标签名、站点标题、文章标题不使用 dangerouslySetInnerHTML
[ ] 搜索关键词回显使用文本节点，不拼 HTML
[ ] 主题/语言参数不进入 HTML
```

测试 payload：

```html
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
<a href="javascript:alert(1)">click</a>
<iframe srcdoc="<script>alert(1)</script>"></iframe>
```

预期：

```text
[ ] 不弹窗
[ ] 不执行脚本
[ ] 不产生异常 DOM
[ ] 控制台无明显 sanitize 报错
```

## 4.4 前端缓存与退出登录

```text
[ ] 退出登录后清理前端用户状态
[ ] 退出登录后访问后台 API 返回 401
[ ] 后台页面不被 Service Worker 或浏览器缓存保留敏感内容
[ ] API 响应中的后台数据设置 Cache-Control: no-store
[ ] 前台公开文章可以正常缓存
```

---

# 5. marked + DOMPurify + highlight.js 安全测试

你的 Markdown 流程是 `marked -> HTML -> DOMPurify -> React 渲染`，这是项目最关键的 XSS 风险点。DOMPurify 官方说明它是用于清洗 HTML、MathML、SVG 的 XSS sanitizer，并且默认安全但可配置，因此测试重点是“配置是否被放宽”和“清洗后是否又被二次拼接”。([GitHub][2])

## 5.1 Markdown 原始 HTML 测试

把下面内容分别放入文章正文和后台预览：

````md
# XSS 测试

<script>alert(1)</script>

<img src=x onerror=alert(1)>

[JavaScript Link](javascript:alert(1))

<svg onload=alert(1)></svg>

<iframe src="https://evil.example"></iframe>

<style>
body { display: none; }
</style>

```html
<script>alert(1)</script>
````

````

检查：

```text
[ ] script 标签被移除或转义
[ ] onerror 被移除
[ ] javascript: 链接被移除或失效
[ ] svg 事件属性不能执行
[ ] iframe 默认不允许
[ ] style 默认不允许或严格限制
[ ] 代码块内容只作为代码显示
[ ] 前台文章详情安全
[ ] 后台 Markdown 预览安全
````

## 5.2 DOMPurify 配置测试

```text
[ ] 没有 ADD_TAGS 放开 script / iframe / object / embed
[ ] 没有 ADD_ATTR 放开 onerror / onclick / onload
[ ] 没有允许 javascript: 协议
[ ] 没有允许 data:text/html
[ ] 如果允许 img data:，确认只允许安全图片类型
[ ] 清洗后没有再拼接原始 HTML
[ ] 清洗结果没有被 highlight.js 再次破坏
[ ] DOMPurify 版本无已知高危漏洞
```

## 5.3 highlight.js 代码块测试

```text
[ ] 未指定语言的代码块安全显示
[ ] 伪造语言名不会造成异常
[ ] 超长代码块不会卡死页面
[ ] 超大量代码块不会明显拖垮页面
[ ] 代码块中的 <script> 不执行
[ ] 代码复制功能不会复制隐藏恶意内容
```

测试 Markdown：

````md
```unknown-language
<script>alert(1)</script>
<img src=x onerror=alert(1)>
````

````

---

# 6. React Router DOM 7 路由安全测试

```text
[ ] /posts/:slug 只接受合法 slug
[ ] /categories/:slug 只接受合法 slug
[ ] /tags/:slug 只接受合法 slug
[ ] /admin/* 未登录统一拦截
[ ] 不存在的路由显示 404，不暴露内部路径
[ ] 路由参数不会直接用于 dangerouslySetInnerHTML
[ ] 路由参数不会直接拼接 API URL 导致请求污染
[ ] 语言切换参数只能是 zh / en 等合法 Locale
````

测试 URL：

```text
/posts/<script>alert(1)</script>
/posts/../../admin
/posts/%2e%2e%2fadmin
/tags/javascript:alert(1)
/admin/%2e%2e%2fsettings
```

---

# 7. Fastify 5 API 安全测试

你的 API 使用 Fastify 5，负责文章、分类、标签、关于页、认证、上传和 AI 辅助接口。 Fastify 官方生态里有 CORS、CSRF、Helmet 安全响应头、rate-limit 等插件能力，和你的架构高度相关。([Fastify][3])

## 7.1 API 路由鉴权矩阵

逐个测试这些接口：

```text
公开接口
[ ] GET /api/posts
[ ] GET /api/posts/:slug
[ ] GET /api/categories
[ ] GET /api/tags
[ ] GET /api/about

认证接口
[ ] POST /api/auth/login
[ ] POST /api/auth/logout
[ ] GET /api/auth/session
[ ] GET /api/auth/csrf

后台文章
[ ] GET /api/admin/posts
[ ] POST /api/admin/posts
[ ] PUT /api/admin/posts/:id
[ ] DELETE /api/admin/posts/:id

后台分类
[ ] POST /api/admin/categories
[ ] PUT /api/admin/categories/:id
[ ] DELETE /api/admin/categories/:id

后台标签
[ ] POST /api/admin/tags
[ ] PUT /api/admin/tags/:id
[ ] DELETE /api/admin/tags/:id

关于页
[ ] PUT /api/admin/about

上传
[ ] POST /api/admin/upload
[ ] DELETE /api/admin/uploads/:id

AI 辅助
[ ] POST /api/admin/ai/summary
[ ] POST /api/admin/ai/tags
[ ] POST /api/admin/ai/translate
```

每个后台接口都测：

```text
[ ] 无 cookie
[ ] 错误 cookie
[ ] 过期 cookie
[ ] 正确 cookie 但无 CSRF
[ ] 正确 cookie 但错误 CSRF
[ ] 正确 cookie + 正确 CSRF
```

预期：

```text
无 cookie：401
错误 cookie：401
过期 cookie：401
无 CSRF：403
错误 CSRF：403
合法请求：200 / 201 / 204
```

## 7.2 Fastify 请求体限制

```text
[ ] JSON body 有大小限制
[ ] multipart 上传有大小限制
[ ] 超大 JSON 返回 413
[ ] 超大图片返回 413
[ ] 超长 title 返回 400
[ ] 超长 content 返回 400 或 413
[ ] 超长 slug 返回 400
[ ] 超多 tags 返回 400
[ ] Fastify 错误处理不会暴露堆栈
```

测试：

```bash
python3 - <<'PY'
print('A' * 10000000)
PY
```

然后作为文章 content 或 JSON 字段提交。

## 7.3 HTTP 方法测试

```text
[ ] GET /api/admin/posts 不应创建文章
[ ] GET /api/admin/posts/:id/delete 不存在
[ ] TRACE 方法禁用
[ ] OPTIONS 不泄露多余信息
[ ] 不支持的方法返回 405 或合理错误
[ ] X-HTTP-Method-Override 不能绕过方法限制
```

测试：

```bash
curl -i -X TRACE https://your-domain.com/api/posts
curl -i -X GET https://your-domain.com/api/admin/posts/1
curl -i -X POST https://your-domain.com/api/posts/valid-slug
```

---

# 8. @fastify/cookie / HTTP-only session 安全测试

你的登录态是 HTTP-only session cookie。

## 8.1 Cookie 属性

登录后查看 `Set-Cookie`：

```text
[ ] HttpOnly 存在
[ ] Secure 在生产环境存在
[ ] SameSite 存在
[ ] Path 合理，建议 /
[ ] Domain 不要过宽
[ ] Max-Age / Expires 合理
[ ] cookie 名称不暴露技术细节也可以
[ ] cookie 值不可预测
[ ] cookie 签名无法被篡改
```

示例预期：

```http
Set-Cookie: session=...; HttpOnly; Secure; SameSite=Lax; Path=/
```

## 8.2 Session 生命周期

```text
[ ] 登录后 session 写入 SQLite
[ ] 登出后 session 删除或标记失效
[ ] session 过期后不能访问后台
[ ] 修改管理员密码后，旧 session 是否失效，有明确策略
[ ] 重新登录后旧 CSRF token 是否失效，有明确策略
[ ] 被篡改的 cookie 不能通过签名校验
```

## 8.3 Session 固定攻击测试

```text
[ ] 登录前后 session id 会变化
[ ] 攻击者预设 cookie 后，登录不会沿用该 session
[ ] 退出登录后再次登录生成新 session
```

---

# 9. CSRF 安全测试

你的后台写操作校验 CSRF token。 因为你使用 cookie 登录态，CSRF 是 P0。

## 9.1 后台写接口 CSRF

```text
[ ] POST /api/admin/posts 无 CSRF 失败
[ ] PUT /api/admin/posts/:id 无 CSRF 失败
[ ] DELETE /api/admin/posts/:id 无 CSRF 失败
[ ] POST /api/admin/upload 无 CSRF 失败
[ ] PUT /api/admin/about 无 CSRF 失败
[ ] POST /api/admin/ai/summary 无 CSRF 失败
[ ] POST /api/admin/ai/tags 无 CSRF 失败
[ ] POST /api/admin/ai/translate 无 CSRF 失败
```

## 9.2 跨站表单测试

创建本地 HTML：

```html
<form action="https://your-domain.com/api/admin/posts" method="POST">
  <input name="title" value="CSRF Attack">
  <input name="content" value="bad">
  <button type="submit">submit</button>
</form>
```

管理员登录后打开这个 HTML，预期：

```text
[ ] 文章不会被创建
[ ] 服务端返回 403
[ ] 日志记录 CSRF 校验失败
```

## 9.3 CSRF token 质量

```text
[ ] CSRF token 不可预测
[ ] CSRF token 与 session 绑定
[ ] 其他 session 的 CSRF token 不能复用
[ ] 退出登录后 token 失效
[ ] token 不出现在 Referer 中
[ ] token 不被写入日志
```

---

# 10. CORS 安全测试

你的生产 CORS 来源由 `CORS_ALLOWED_ORIGINS` 显式配置。

## 10.1 允许来源测试

```text
[ ] 生产环境只允许你的正式前台域名
[ ] 不允许 Access-Control-Allow-Origin: *
[ ] 不允许任意 Origin 反射
[ ] 如果允许 credentials，则 Origin 必须精确匹配
[ ] 不允许 evil.example 携带 cookie 调用后台接口
[ ] OPTIONS 预检返回的 Methods 不过宽
[ ] OPTIONS 预检返回的 Headers 不过宽
```

测试命令：

```bash
curl -i https://your-domain.com/api/admin/posts \
  -H "Origin: https://evil.example"

curl -i -X OPTIONS https://your-domain.com/api/admin/posts \
  -H "Origin: https://evil.example" \
  -H "Access-Control-Request-Method: POST"
```

预期：

```text
[ ] 不返回 Access-Control-Allow-Origin: https://evil.example
[ ] 不返回 Access-Control-Allow-Credentials: true 给非法来源
```

---

# 11. Zod 共享 schema 安全测试

你的 `packages/shared` 用 Zod 统一前后端数据契约。 这很好，但要测试“是否真的在服务端使用”，不能只在前端校验。

## 11.1 请求输入 schema

```text
登录
[ ] username 必填
[ ] username 长度限制
[ ] password 必填
[ ] password 长度限制
[ ] 多余字段被拒绝或剥离

分页
[ ] page >= 1
[ ] pageSize 有最大值，例如 50 或 100
[ ] pageSize 不能为 999999
[ ] sort 字段白名单
[ ] order 只能 asc / desc

文章
[ ] title 必填
[ ] title 长度限制
[ ] slug 格式限制
[ ] slug 唯一
[ ] content 长度限制
[ ] summary 长度限制
[ ] locale 只能是合法 Locale
[ ] status 只能是 draft / published
[ ] tags 数量限制
[ ] categoryId 必须存在

分类 / 标签
[ ] name 必填
[ ] slug 格式限制
[ ] slug 唯一
[ ] sort 必须是数字
[ ] color 格式合法，如果支持颜色
```

## 11.2 多余字段 / Mass Assignment 测试

提交：

```json
{
  "title": "test",
  "content": "test",
  "status": "published",
  "isAdmin": true,
  "role": "admin",
  "passwordHash": "hacked",
  "createdAt": "2099-01-01"
}
```

预期：

```text
[ ] 多余字段不会进入数据库
[ ] 管理员字段不能被前端覆盖
[ ] createdAt / updatedAt 由服务端控制
[ ] viewCount / likeCount 不能由普通保存文章接口随意设置
```

## 11.3 响应 schema 测试

```text
[ ] 公开文章接口不返回草稿字段
[ ] 公开接口不返回 session 信息
[ ] 公开接口不返回管理员账号
[ ] 公开接口不返回数据库路径
[ ] 登录接口不返回 passwordHash
[ ] 错误响应不返回堆栈
```

---

# 12. SQLite / better-sqlite3 安全测试

你的项目使用 SQLite，默认路径由 `DATABASE_PATH` 控制，并且上传文件保存在 SQLite 数据库同级目录下的 `uploads/` 目录。备份时需要同时保留 SQLite 数据库文件和 uploads 目录。

## 12.1 数据库文件暴露

```text
[ ] /apps/api/data/blog.sqlite 不可通过浏览器访问
[ ] /apps/api/data/blog.sqlite-wal 不可访问
[ ] /apps/api/data/blog.sqlite-shm 不可访问
[ ] /data/blog.sqlite 不可访问
[ ] /backup/blog.sqlite 不可访问
[ ] /backup.sql 不可访问
[ ] /blog.sqlite 不可访问
```

测试路径：

```text
https://your-domain.com/apps/api/data/blog.sqlite
https://your-domain.com/data/blog.sqlite
https://your-domain.com/blog.sqlite
https://your-domain.com/backup.sql
```

## 12.2 文件权限

```text
[ ] blog.sqlite 仅 API 运行用户可读写
[ ] blog.sqlite-wal 权限合理
[ ] blog.sqlite-shm 权限合理
[ ] uploads 目录可写但不可执行
[ ] 备份目录不在 Nginx root 下
[ ] systemd 服务用户不是 root，或至少权限最小化
```

检查：

```bash
ls -lah apps/api/data
ls -lah apps/api/data/uploads
ps aux | grep "node dist/src/main.js"
```

## 12.3 SQL 注入

即使 SQLite 是本地文件，也必须测 SQL 注入。

测试入口：

```text
[ ] 登录 username
[ ] 文章 slug
[ ] 文章搜索 keyword
[ ] 分类 slug
[ ] 标签 slug
[ ] 后台文章筛选 status
[ ] page / pageSize
[ ] sort / order
[ ] locale
```

payload：

```text
'
" 
' OR '1'='1
admin'--
1 OR 1=1
1; DROP TABLE posts;
%' OR '1'='1
```

预期：

```text
[ ] 登录不能绕过
[ ] 数据不异常扩大
[ ] 不显示 SQLite 错误
[ ] 不显示 better-sqlite3 堆栈
[ ] 数据库没有被修改或删除
[ ] 原生 SQL 全部使用 prepare + bind
[ ] sort/order 使用白名单，不拼接用户输入
```

## 12.4 SQLite 锁和资源耗尽

```text
[ ] 高频搜索不会导致数据库锁死
[ ] 高频上传不会阻塞所有请求
[ ] 超大文章保存会被限制
[ ] pageSize 超大不会导致全表扫描返回海量数据
[ ] 迁移脚本不会在生产运行中误执行破坏性操作
[ ] API 进程异常退出后数据库仍可打开
```

---

# 13. Argon2 密码安全测试

你的管理员密码使用 Argon2 哈希。

## 13.1 哈希存储

```text
[ ] SQLite 中没有明文 ADMIN_PASSWORD
[ ] passwordHash 形如 $argon2id$...
[ ] 相同密码重复 seed 结果不应简单相同，取决于 salt
[ ] 登录日志不记录密码
[ ] 错误日志不记录密码
[ ] seed-admin 不会把密码打印到终端日志
```

## 13.2 seed-admin 脚本

```text
[ ] pnpm api:seed-admin 生产环境拒绝默认 ADMIN_PASSWORD
[ ] ADMIN_PASSWORD 为空时拒绝初始化
[ ] ADMIN_PASSWORD 太短时拒绝初始化
[ ] 重复执行 seed 不会创建多个异常管理员
[ ] 修改管理员密码有审计记录
```

## 13.3 登录爆破

```text
[ ] 连续 5 次失败触发限流
[ ] 同一 IP 高频登录触发限流
[ ] 同一用户名高频登录触发限流
[ ] 返回 429 或统一错误
[ ] 失败响应时间不明显泄露用户名是否存在
```

---

# 14. 文件上传 / @fastify/multipart / /uploads 安全测试

你的上传使用 `@fastify/multipart`，静态访问路径是 `/uploads/...`。 OWASP 文件上传清单建议使用允许扩展名、限制文件名长度、限制字符、随机文件名、校验内容、选择安全存储位置等措施。([OWASP Cheat Sheet Series][4])

## 14.1 上传权限

```text
[ ] 未登录上传失败
[ ] 无 CSRF 上传失败
[ ] 错误 CSRF 上传失败
[ ] 非管理员上传失败
[ ] 上传接口有频率限制
[ ] 上传接口有单文件大小限制
[ ] 上传接口有总请求大小限制
```

## 14.2 文件类型

允许：

```text
[ ] .jpg
[ ] .jpeg
[ ] .png
[ ] .webp
[ ] .gif
```

拒绝：

```text
[ ] .svg
[ ] .html
[ ] .js
[ ] .php
[ ] .phtml
[ ] .jsp
[ ] .asp
[ ] .aspx
[ ] .sh
[ ] .exe
[ ] .bat
[ ] .cmd
[ ] .zip，除非你明确支持
```

## 14.3 双后缀绕过

```text
[ ] shell.php.jpg 被拒绝或安全重编码
[ ] shell.jpg.php 被拒绝
[ ] shell.pHp 被拒绝
[ ] shell.PHP 被拒绝
[ ] test.html.png 被拒绝或安全重编码
[ ] test.png%00.php 被拒绝
[ ] test.asp;.jpg 被拒绝
```

## 14.4 MIME 伪造

```text
[ ] Content-Type: image/png 但内容是 HTML，被拒绝
[ ] Content-Type: image/jpeg 但内容是 JS，被拒绝
[ ] 文件头 magic number 不匹配，被拒绝
[ ] 空文件被拒绝
[ ] 超大图片被拒绝
[ ] 畸形图片不会导致 API 崩溃
```

测试文件内容：

```html
<script>alert(1)</script>
```

保存为：

```text
xss.jpg
xss.png
xss.webp
```

预期：

```text
[ ] 不允许作为有效图片通过，或服务端重编码后脚本失效
```

## 14.5 文件名与路径穿越

测试文件名：

```text
../../test.jpg
../admin/test.jpg
..%2f..%2ftest.jpg
<script>alert(1)</script>.jpg
a'.jpg
a".jpg
超长文件名................................................................jpg
.hidden.jpg
--danger.jpg
```

预期：

```text
[ ] 最终文件名由服务端生成
[ ] 文件不会写出 uploads 目录
[ ] 不覆盖已有文件
[ ] 不保留危险原始文件名
[ ] 数据库中 originalName 展示时会转义
```

## 14.6 /uploads 静态访问

```text
[ ] /uploads/ 不列目录
[ ] 上传文件响应 Content-Type 正确
[ ] 上传文件响应带 X-Content-Type-Options: nosniff
[ ] 上传目录不能执行脚本
[ ] 上传目录不能访问 SQLite 文件
[ ] 删除文章后孤儿上传清理逻辑不会误删正在使用的图片
[ ] 清理脚本不会删除 uploads 目录外文件
```

OWASP 对不受限制文件上传的说明中也明确提到，上传目录不应有执行权限，应移除脚本处理能力，并限制文件名长度、使用算法生成文件名。([OWASP Foundation][5])

---

# 15. @fastify/static 静态文件安全测试

```text
[ ] 只暴露 uploads 目录，不暴露 apps/api/data
[ ] dotfiles 不可访问
[ ] 不允许访问 ../ 路径
[ ] 不允许访问 blog.sqlite
[ ] 不允许访问 .env
[ ] 不允许访问源代码
[ ] 静态文件缓存策略合理
[ ] 后台 API 不被静态缓存
```

测试：

```bash
curl -i https://your-domain.com/uploads/../blog.sqlite
curl -i https://your-domain.com/uploads/.env
curl -i https://your-domain.com/uploads/
```

---

# 16. 安全响应头测试

你的 API 已设置：

```text
Content-Security-Policy
X-Content-Type-Options
Referrer-Policy
X-Frame-Options
生产环境 Strict-Transport-Security
```

这些在技术栈文档中已经列出。

## 16.1 必测响应头

```text
[ ] Content-Security-Policy 存在
[ ] X-Content-Type-Options: nosniff
[ ] Referrer-Policy 合理
[ ] X-Frame-Options: DENY 或 SAMEORIGIN
[ ] Strict-Transport-Security 仅生产 HTTPS 开启
[ ] 后台页面不能被 iframe 嵌入
[ ] 登录页不能被 iframe 嵌入
[ ] uploads 响应也有 nosniff
```

检查：

```bash
curl -I https://your-domain.com/
curl -I https://your-domain.com/api/posts
curl -I https://your-domain.com/uploads/test.jpg
```

## 16.2 CSP 专项测试

```text
[ ] default-src 不过宽
[ ] script-src 不允许任意第三方
[ ] script-src 尽量不使用 unsafe-inline
[ ] object-src 'none'
[ ] frame-ancestors 'none' 或受限
[ ] img-src 包含 self 和必要图片来源
[ ] connect-src 包含 API 域名和必要 AI/接口来源
[ ] CSP 不阻断正常代码高亮、字体、主题切换
[ ] CSP Report-Only 阶段观察无误后再强制启用
```

---

# 17. AI 辅助接口 / DeepSeek 安全测试

你的 API 预留 DeepSeek 兼容 AI 服务，用于摘要草稿、标签建议、翻译草稿，未配置 Key 时核心流程仍可运行。

## 17.1 API Key 安全

```text
[ ] DEEPSEEK_API_KEY 不进入前端 dist
[ ] DEEPSEEK_API_KEY 不出现在接口响应
[ ] DEEPSEEK_API_KEY 不出现在日志
[ ] DEEPSEEK_API_KEY 不提交 Git
[ ] 未配置 Key 时 AI 接口返回明确错误，不影响博客核心功能
[ ] 生产环境 Key 使用环境变量注入
```

检查：

```bash
grep -R "DEEPSEEK_API_KEY" apps/web/dist || true
grep -R "sk-" apps/web/dist || true
grep -R "api.deepseek.com" apps/web/dist || true
```

## 17.2 AI 接口鉴权

```text
[ ] 未登录不能调用摘要接口
[ ] 未登录不能调用标签建议接口
[ ] 未登录不能调用翻译接口
[ ] 无 CSRF 不能调用 AI 写接口
[ ] AI 接口有限流
[ ] AI 输入长度有限制
[ ] AI 输出不会直接绕过 DOMPurify
[ ] AI 输出保存为文章前仍经过 Zod 校验
```

## 17.3 Prompt Injection / 数据泄露

```text
[ ] AI 输入不会带上 SESSION_SECRET
[ ] AI 输入不会带上 ADMIN_PASSWORD
[ ] AI 输入不会带上数据库路径
[ ] AI 输入不会带上完整用户 session
[ ] AI 输出不会直接覆盖管理员设置
[ ] AI 生成标签必须经过标签 schema 校验
[ ] AI 翻译结果不能自动发布，必须人工确认
```

---

# 18. 文章、分类、标签、关于页业务安全测试

## 18.1 文章状态

```text
[ ] draft 文章不出现在首页
[ ] draft 文章不出现在搜索
[ ] draft 文章不出现在分类页
[ ] draft 文章不出现在标签页
[ ] draft 文章不出现在 sitemap
[ ] draft 文章不出现在 RSS，如果有
[ ] 直接访问 draft slug 返回 404 或需要权限
[ ] published 才能公开访问
[ ] 删除后的文章不可访问
```

## 18.2 slug 安全

```text
[ ] slug 只能包含小写字母、数字、短横线
[ ] slug 不能是 admin
[ ] slug 不能是 api
[ ] slug 不能是 uploads
[ ] slug 不能包含 ..
[ ] slug 不能包含 /
[ ] slug 不能包含 %
[ ] slug 唯一
[ ] 修改 slug 后旧 URL 处理策略明确
```

## 18.3 中英双语 Locale

```text
[ ] locale 只能是 zh / en 或项目定义值
[ ] 不存在 locale 返回 400
[ ] 中文文章和英文文章不会互相覆盖
[ ] 相同 slug 不同 locale 的唯一性策略清晰
[ ] 语言切换不会访问草稿内容
```

## 18.4 分类 / 标签

```text
[ ] 删除分类前处理关联文章
[ ] 删除标签前处理 post_tags 关联
[ ] 标签名不能 XSS
[ ] 分类名不能 XSS
[ ] 标签 slug 唯一
[ ] 分类 slug 唯一
[ ] 批量创建标签数量有限制
```

## 18.5 关于页

```text
[ ] 关于页 Markdown/HTML 内容经过清洗
[ ] 头像上传走同一套上传安全逻辑
[ ] 关于页外链使用 rel="noopener noreferrer"
[ ] 关于页不能插入 script
[ ] 关于页不能插入 javascript: 链接
```

---

# 19. 搜索功能安全测试

```text
[ ] 空搜索词处理正常
[ ] 超长搜索词返回 400 或截断
[ ] 搜索词不能 SQL 注入
[ ] 搜索词回显不能 XSS
[ ] 搜索结果高亮不能 XSS
[ ] 搜索结果不包含草稿
[ ] 搜索结果不包含删除文章
[ ] pageSize 有最大值
[ ] 搜索接口有限流
[ ] 高频搜索不会锁死 SQLite
```

payload：

```text
'
" OR "1"="1
<script>alert(1)</script>
<img src=x onerror=alert(1)>
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

---

# 20. Playwright E2E 安全测试建议

你的项目已经有 `pnpm test:e2e`。 建议增加这些 E2E 用例。

```text
认证
[ ] 未登录访问 /admin 自动跳转登录
[ ] 登录成功进入后台
[ ] 退出登录后不能访问后台
[ ] 复制后台 URL 到新页面，未登录不能访问

CSRF
[ ] 登录后手动去掉 CSRF header，保存文章失败
[ ] 登录后错误 CSRF，删除文章失败

XSS
[ ] 创建包含 <script> 的文章，前台不弹窗
[ ] 创建包含 img onerror 的文章，前台不弹窗
[ ] 创建包含 javascript: 链接的文章，点击不执行

上传
[ ] 上传正常 png 成功
[ ] 上传 php 失败
[ ] 上传伪装 jpg 失败
[ ] 上传超大图片失败

草稿
[ ] 草稿保存成功
[ ] 草稿不在首页
[ ] 草稿直接访问 404
[ ] 发布后前台可见
```

---

# 21. Vitest / API 单元测试建议

你的 API 测试使用 Vitest，覆盖 Fastify app、数据库、认证、上传和仓储。

## 21.1 Auth 测试

```text
[ ] login 正确账号密码返回 session
[ ] login 错误密码返回 401
[ ] login 空密码返回 400
[ ] login SQL 注入 payload 失败
[ ] logout 后 session 失效
[ ] session 过期后失败
[ ] 默认 SESSION_SECRET 在 production 抛错
[ ] 默认 ADMIN_PASSWORD 在 production 抛错
```

## 21.2 CSRF 测试

```text
[ ] GET 公开接口不需要 CSRF
[ ] POST 后台接口需要 CSRF
[ ] PUT 后台接口需要 CSRF
[ ] DELETE 后台接口需要 CSRF
[ ] token 与 session 不匹配时失败
```

## 21.3 Zod schema 测试

```text
[ ] article upsert schema 拒绝非法 status
[ ] article upsert schema 拒绝非法 locale
[ ] article upsert schema 拒绝非法 slug
[ ] pagination schema 限制 pageSize
[ ] login schema 限制 username/password 长度
[ ] 上传响应 schema 不返回本地文件绝对路径
```

## 21.4 Repository 测试

```text
[ ] 查询使用参数绑定
[ ] slug 查询不能注入
[ ] 搜索不能注入
[ ] 删除文章同时处理关联标签
[ ] 删除分类不会留下脏数据
[ ] 迁移重复执行不会破坏数据
```

---

# 22. Nginx 安全测试

你的生产部署是 Nginx 托管前端静态文件，并反向代理 Fastify API；API 端口默认 4000，生产环境建议只允许本机访问。

## 22.1 端口与反代

```text
[ ] 公网只开放 80 / 443
[ ] 4000 端口公网不可访问
[ ] API 只通过 Nginx 反代访问
[ ] Nginx 正确转发 X-Forwarded-Proto
[ ] Nginx 正确转发 Host
[ ] API 不信任任意伪造的 X-Forwarded-*，除非配置可信代理
```

检查：

```bash
sudo ss -lntp
curl -i http://your-domain.com:4000/api/posts
```

预期：

```text
[ ] 4000 公网无法访问
```

## 22.2 静态文件

```text
[ ] apps/web/dist 正常服务
[ ] apps/api/data 不在 Nginx root 下
[ ] uploads location 单独配置
[ ] uploads 关闭 autoindex
[ ] uploads 禁止脚本执行
[ ] .env deny all
[ ] .git deny all
[ ] backup deny all
```

Nginx 检查项：

```nginx
autoindex off;
client_max_body_size 10m;
```

## 22.3 HTTPS

```text
[ ] HTTP 自动 301 到 HTTPS
[ ] Let's Encrypt 证书有效
[ ] Certbot 自动续期正常
[ ] 没有 mixed content
[ ] HSTS 仅在 HTTPS 生产环境启用
```

---

# 23. systemd 服务安全测试

你的 API 通过 systemd 运行 `node dist/src/main.js`。

```text
[ ] 服务不以 root 用户运行，或尽量使用专门用户
[ ] WorkingDirectory 正确
[ ] EnvironmentFile 权限为 600 或至少不公开
[ ] Restart 策略合理
[ ] 日志不打印密钥
[ ] systemctl status 不显示完整敏感环境变量
[ ] 服务用户只能读写必要目录
[ ] 服务崩溃后能自动恢复
[ ] 部署更新后旧进程正确停止
```

检查：

```bash
systemctl status tworiver-api
journalctl -u tworiver-api -n 200
ps aux | grep "node dist/src/main.js"
```

---

# 24. 部署脚本安全测试

你的部署脚本包括：

```bash
bash scripts/deploy-setup.sh
bash scripts/deploy-update.sh
```

技术栈文档中也列出了部署、更新和诊断脚本。

```text
[ ] 脚本不 echo SESSION_SECRET
[ ] 脚本不 echo ADMIN_PASSWORD
[ ] 脚本不 echo DEEPSEEK_API_KEY
[ ] 脚本遇到错误会停止，例如 set -e
[ ] 脚本不会删除 DATABASE_PATH 指向之外的数据
[ ] 脚本不会删除 uploads 目录
[ ] 更新前自动备份 SQLite
[ ] 更新前自动备份 uploads
[ ] 失败后可以回滚
[ ] 诊断脚本输出会脱敏
```

---

# 25. 备份与恢复测试

你的备份必须同时包含 SQLite 数据库文件和 uploads 上传文件目录。

```text
[ ] 备份 blog.sqlite
[ ] 如果启用 WAL，同时备份 blog.sqlite-wal
[ ] 如果启用 WAL，同时备份 blog.sqlite-shm
[ ] 备份 uploads 目录
[ ] 备份 .env，但不能放 Web 目录
[ ] 备份 systemd unit
[ ] 备份 Nginx 配置
[ ] 备份文件加密
[ ] 备份文件不公开访问
[ ] 至少做一次恢复演练
```

恢复后验证：

```text
[ ] 首页正常
[ ] 文章正常
[ ] 图片正常
[ ] 分类正常
[ ] 标签正常
[ ] 关于页正常
[ ] 管理员能登录
[ ] session 表状态合理
[ ] 上传引用没有断链
```

---

# 26. DeepSeek / 外部请求 / SSRF 风险测试

因为 `DEEPSEEK_BASE_URL` 可配置，所以要防止它被错误配置成内网地址或攻击地址。

```text
[ ] 生产环境 DEEPSEEK_BASE_URL 固定为可信地址
[ ] 后台不能通过请求参数覆盖 DEEPSEEK_BASE_URL
[ ] AI 接口不能访问 http://127.0.0.1
[ ] AI 接口不能访问 http://localhost
[ ] AI 接口不能访问云服务器元数据地址
[ ] AI 接口超时设置合理
[ ] AI 接口失败不会导致 API 崩溃
[ ] AI 返回内容不会自动作为 HTML 渲染
```

如果你未来允许管理员自定义 AI Base URL，需要额外做白名单。

---

# 27. 日志与错误处理测试

```text
错误响应
[ ] 生产 500 不显示堆栈
[ ] 不显示 better-sqlite3 原始错误
[ ] 不显示文件绝对路径
[ ] 不显示 DATABASE_PATH
[ ] 不显示 SESSION_SECRET
[ ] 不显示 DeepSeek Key

日志
[ ] 登录成功记录
[ ] 登录失败记录
[ ] CSRF 失败记录
[ ] 上传失败记录
[ ] 删除文章记录
[ ] 修改设置记录
[ ] AI 调用失败记录
[ ] 日志不记录密码
[ ] 日志不记录完整 session cookie
[ ] 日志不记录完整 CSRF token
[ ] 日志不记录 DEEPSEEK_API_KEY
```

---

# 28. 依赖漏洞测试

重点依赖：

```text
前端
[ ] react
[ ] react-dom
[ ] react-router-dom
[ ] vite
[ ] marked
[ ] dompurify
[ ] highlight.js
[ ] @iconify/react

后端
[ ] fastify
[ ] @fastify/cookie
[ ] @fastify/multipart
[ ] @fastify/static
[ ] better-sqlite3
[ ] argon2
[ ] zod
[ ] tsx

测试
[ ] vitest
[ ] jsdom
[ ] playwright
[ ] testing-library
```

执行：

```bash
pnpm audit
pnpm outdated
pnpm test
pnpm build
```

特别关注：

```text
[ ] DOMPurify 是否有 XSS 绕过漏洞
[ ] marked 是否有 XSS 相关漏洞
[ ] highlight.js 是否有 ReDoS / HTML 注入相关漏洞
[ ] Vite 是否有 dev server 或 sourcemap 暴露问题
[ ] Fastify 插件版本是否匹配 Fastify 5
[ ] better-sqlite3 是否有原生模块漏洞
[ ] argon2 是否有安装/运行异常导致降级
```

Fastify v5 官方文档说明它需要 Node.js v20+，并且 v5 的参数对象无原型设计可以增强对 prototype pollution 的防护，因此你的生产 Node 版本和 Fastify 5 兼容性也要纳入测试。([Fastify][6])

---

# 29. CI / 本地质量关口

你的文档建议本地和 CI 执行：

```bash
pnpm check:encoding
pnpm typecheck
pnpm test
pnpm build
```

这部分来自你的技术栈说明。

建议扩展成安全上线命令：

```bash
pnpm check:encoding
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm audit
```

上线前检查：

```text
[ ] 所有测试通过
[ ] e2e 覆盖登录、发文、上传、退出
[ ] e2e 覆盖 XSS payload
[ ] e2e 覆盖 CSRF 失败场景
[ ] audit 无 high / critical 漏洞
[ ] build 产物无密钥
[ ] 部署脚本 dry-run 或测试环境通过
```

---

# 30. 推荐安全测试用例文件结构

你可以在项目中新增：

```text
apps/api/src/__tests__/security/
├── auth.security.test.ts
├── csrf.security.test.ts
├── cors.security.test.ts
├── posts.security.test.ts
├── upload.security.test.ts
├── sqlite-injection.security.test.ts
├── ai.security.test.ts
└── headers.security.test.ts

apps/web/src/__tests__/security/
├── markdown-xss.security.test.tsx
├── admin-route.security.test.tsx
├── search-xss.security.test.tsx
└── env-leak.security.test.ts

apps/web/e2e/security/
├── auth.spec.ts
├── csrf.spec.ts
├── xss.spec.ts
├── upload.spec.ts
└── draft-visibility.spec.ts
```

---

# 31. 最终完整勾选版

可以直接复制到 `docs/security-test-checklist.md`。

```text
# TwoRiver Blog 安全测试清单

## 认证
[ ] 登录成功流程正常
[ ] 错误密码不能登录
[ ] 不存在用户不能登录
[ ] 登录失败提示不泄露账号是否存在
[ ] 登录接口有限流
[ ] Argon2 哈希存储密码
[ ] SQLite 中没有明文密码
[ ] 默认 ADMIN_PASSWORD 在 production 被拒绝
[ ] 默认 SESSION_SECRET 在 production 被拒绝
[ ] seed-admin 不打印密码

## Session Cookie
[ ] Cookie HttpOnly
[ ] Cookie Secure
[ ] Cookie SameSite
[ ] Cookie Path 合理
[ ] Cookie 不出现在 URL
[ ] Cookie 不能被篡改
[ ] 退出登录后 session 失效
[ ] 过期 session 不能访问后台
[ ] session 日志脱敏

## CSRF
[ ] POST 后台接口必须 CSRF
[ ] PUT 后台接口必须 CSRF
[ ] DELETE 后台接口必须 CSRF
[ ] 上传接口必须 CSRF
[ ] AI 接口必须 CSRF
[ ] 错误 CSRF 返回 403
[ ] 跨站表单不能创建文章
[ ] GET 不能执行写操作

## CORS
[ ] CORS_ALLOWED_ORIGINS 生产环境显式配置
[ ] 不允许 Origin: *
[ ] 不反射任意 Origin
[ ] evil.example 不能跨站带 cookie 调后台
[ ] OPTIONS 不泄露过宽 Methods
[ ] credentials 只对可信源开放

## Zod
[ ] 所有 req.body 经过 Zod
[ ] 所有 req.query 经过 Zod
[ ] 所有 req.params 经过 Zod
[ ] pageSize 有最大值
[ ] slug 格式限制
[ ] locale 枚举限制
[ ] status 枚举限制
[ ] 多余字段被拒绝或剥离
[ ] 响应不返回 passwordHash
[ ] 响应不返回本地文件路径

## Markdown / XSS
[ ] marked 输出经过 DOMPurify
[ ] 前台文章详情不执行 script
[ ] 后台预览不执行 script
[ ] img onerror 被清理
[ ] javascript: 链接被清理
[ ] svg 事件属性被清理
[ ] iframe 默认禁止
[ ] 代码块只显示不执行
[ ] 搜索词回显不 XSS
[ ] 分类名不 XSS
[ ] 标签名不 XSS
[ ] 关于页不 XSS

## React / Vite
[ ] dist 不包含 SESSION_SECRET
[ ] dist 不包含 ADMIN_PASSWORD
[ ] dist 不包含 DEEPSEEK_API_KEY
[ ] dist 不包含 DATABASE_PATH
[ ] 生产 sourcemap 不泄露敏感信息
[ ] /admin 路由未登录拦截
[ ] 退出登录后不能通过后退查看后台敏感数据
[ ] dangerouslySetInnerHTML 使用前已 sanitize

## Fastify API
[ ] 所有后台 API 鉴权
[ ] 所有写操作鉴权
[ ] 请求体大小限制
[ ] multipart 大小限制
[ ] 错误处理不暴露堆栈
[ ] 不支持方法返回合理错误
[ ] TRACE 禁用
[ ] X-HTTP-Method-Override 不能绕过
[ ] 高频接口有限流

## SQLite
[ ] blog.sqlite 不可 Web 访问
[ ] blog.sqlite-wal 不可 Web 访问
[ ] blog.sqlite-shm 不可 Web 访问
[ ] 数据库文件权限最小化
[ ] 备份文件不在 Web 根目录
[ ] SQL 使用参数绑定
[ ] sort/order 使用白名单
[ ] 搜索不能 SQL 注入
[ ] slug 不能 SQL 注入
[ ] 高频请求不会锁死数据库

## 上传
[ ] 未登录不能上传
[ ] 无 CSRF 不能上传
[ ] 只允许安全图片格式
[ ] 默认禁止 SVG
[ ] 禁止 PHP/JS/HTML/SH/EXE
[ ] 禁止双后缀绕过
[ ] 校验 MIME
[ ] 校验文件头
[ ] 文件名服务端生成
[ ] 禁止路径穿越
[ ] 上传大小限制
[ ] /uploads/ 不列目录
[ ] /uploads/ 不执行脚本
[ ] 上传响应 nosniff

## /uploads 静态资源
[ ] 只暴露 uploads
[ ] 不暴露 apps/api/data
[ ] 不暴露 SQLite
[ ] 不暴露 .env
[ ] 不允许 ../ 访问
[ ] Content-Type 正确
[ ] 缓存策略合理

## AI 辅助
[ ] 未登录不能调用 AI
[ ] 无 CSRF 不能调用 AI
[ ] AI 接口有限流
[ ] 输入长度限制
[ ] DEEPSEEK_API_KEY 不进前端
[ ] DEEPSEEK_API_KEY 不进日志
[ ] 未配置 Key 时核心博客仍可用
[ ] AI 输出保存前经过 Zod
[ ] AI 输出展示前经过 DOMPurify
[ ] DEEPSEEK_BASE_URL 不能被请求参数覆盖

## 业务逻辑
[ ] 草稿不在首页
[ ] 草稿不在搜索
[ ] 草稿不在分类页
[ ] 草稿不在标签页
[ ] 草稿不能直接访问
[ ] 已删除文章不能访问
[ ] slug 唯一
[ ] slug 不能是 admin/api/uploads
[ ] 删除分类处理关联文章
[ ] 删除标签处理关联关系
[ ] 删除图片不误删正在引用文件

## Nginx
[ ] 公网只开放 80/443
[ ] 4000 端口公网不可访问
[ ] HTTP 跳转 HTTPS
[ ] TLS 证书有效
[ ] uploads 关闭 autoindex
[ ] .env 不可访问
[ ] .git 不可访问
[ ] backup 不可访问
[ ] client_max_body_size 合理
[ ] 反代 header 配置正确

## systemd
[ ] API 不以 root 运行
[ ] EnvironmentFile 权限合理
[ ] journal 日志不含密钥
[ ] 崩溃后可恢复
[ ] 更新后旧进程被正确停止
[ ] 服务用户权限最小化

## 部署脚本
[ ] deploy-setup 不打印密钥
[ ] deploy-update 不打印密钥
[ ] 更新前备份 SQLite
[ ] 更新前备份 uploads
[ ] 失败可回滚
[ ] 诊断脚本输出脱敏
[ ] 不误删 data/uploads

## 安全响应头
[ ] CSP 存在
[ ] X-Content-Type-Options: nosniff
[ ] Referrer-Policy 存在
[ ] X-Frame-Options 存在
[ ] HSTS 生产 HTTPS 开启
[ ] 登录页不能 iframe
[ ] 后台页不能 iframe
[ ] uploads 响应 nosniff

## 依赖
[ ] pnpm audit 无 high/critical
[ ] DOMPurify 无高危漏洞
[ ] marked 无高危漏洞
[ ] highlight.js 无高危漏洞
[ ] Fastify 插件版本匹配
[ ] better-sqlite3 无高危漏洞
[ ] argon2 正常工作
[ ] lockfile 已提交
[ ] 不混用 npm/yarn/pnpm

## 日志
[ ] 登录成功记录
[ ] 登录失败记录
[ ] CSRF 失败记录
[ ] 上传失败记录
[ ] 发布文章记录
[ ] 删除文章记录
[ ] 修改设置记录
[ ] AI 调用失败记录
[ ] 不记录明文密码
[ ] 不记录完整 cookie
[ ] 不记录 SESSION_SECRET
[ ] 不记录 DEEPSEEK_API_KEY

## 备份恢复
[ ] 备份 blog.sqlite
[ ] 备份 blog.sqlite-wal，如果存在
[ ] 备份 blog.sqlite-shm，如果存在
[ ] 备份 uploads
[ ] 备份 .env 到安全位置
[ ] 备份 Nginx 配置
[ ] 备份 systemd unit
[ ] 备份文件不公开
[ ] 备份文件可恢复
[ ] 恢复后文章正常
[ ] 恢复后图片正常
[ ] 恢复后管理员可登录
```

---

# 32. 推荐测试顺序

```text
第一轮：认证、session、CSRF
第二轮：Markdown XSS、搜索 XSS、后台预览 XSS
第三轮：上传安全、/uploads 静态访问
第四轮：SQLite 注入、数据库文件暴露、备份恢复
第五轮：CORS、CSP、安全响应头
第六轮：AI 辅助接口、DeepSeek Key 泄露
第七轮：Nginx、systemd、部署脚本
第八轮：pnpm audit、Playwright E2E、Vitest API 安全用例
```

对你的 TwoRiver Blog 来说，最应该优先投入的安全测试是：

```text
1. HTTP-only cookie + CSRF 是否完整
2. marked + DOMPurify 是否真正阻止 Markdown XSS
3. @fastify/multipart + /uploads 是否安全
4. SQLite 文件和备份是否不会被 Nginx 暴露
5. SESSION_SECRET / ADMIN_PASSWORD / DEEPSEEK_API_KEY 是否不会进入前端 dist 或日志
```
