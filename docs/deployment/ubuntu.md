# Ubuntu + Aliyun + GoDaddy Deployment

这份文档记录 TwoRiver Blog 部署到阿里云 Ubuntu ECS，并绑定 GoDaddy 域名的完整流程。

目标结构：

```text
GoDaddy domain
  -> Aliyun ECS public IP
  -> Nginx :80/:443
      -> /              apps/web/dist static frontend
      -> /api/*         Fastify API on 127.0.0.1:4000
      -> /uploads/*     uploaded images under apps/api/data/uploads
  -> systemd service    keeps the API running
  -> SQLite + uploads   apps/api/data/blog.sqlite and apps/api/data/uploads
```

示例域名统一写作 `example.me`。实际部署时替换成你的域名。

## 1. Server Checklist

推荐系统：

```text
Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
Node.js 22+
pnpm 9.15.4
Nginx
Certbot
```

阿里云安全组入方向至少开放：

```text
TCP 22    SSH
TCP 80    HTTP
TCP 443   HTTPS
```

`4000` 不需要对公网开放。API 只监听给 Nginx 反代使用。

登录服务器：

```bash
ssh root@your-aliyun-public-ip
```

本文后续服务器文件编辑命令统一使用 `vim`。

## 2. Install Base Packages

```bash
apt update
apt install -y nginx git curl ufw build-essential python3 make g++
```

安装 Node.js 22：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
```

如果在国内服务器上安装依赖较慢，先配置 npm 国内镜像：

```bash
npm config set registry https://registry.npmmirror.com
npm config get registry
```

安装 pnpm：

```bash
npm install -g pnpm@9.15.4
pnpm config set registry https://registry.npmmirror.com
pnpm config get registry
pnpm -v
which pnpm
```

如果 `which pnpm` 输出 `/usr/local/bin/pnpm`，后面的 systemd 服务也使用这个路径。

## 3. Prepare Project

把代码放到服务器，例如：

```bash
cd /home
git clone your-repository-url twoRiver
cd /home/twoRiver
pnpm install --frozen-lockfile
```

如果代码已经在 `/home/twoRiver`，直接进入目录安装依赖即可。

## 4. Production Environment

创建生产环境文件：

```bash
cd /home/twoRiver
cp .env.example .env
vim .env
```

HTTP 阶段先使用：

```env
NODE_ENV=production
PORT=4000
DATABASE_PATH=/home/twoRiver/apps/api/data/blog.sqlite
SESSION_SECRET=replace-with-a-random-secret-at-least-32-chars
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-a-password-at-least-12-chars
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
CORS_ALLOWED_ORIGINS=http://example.me,http://www.example.me
```

关键点：

- `SESSION_SECRET` 不要使用默认值，建议用 `openssl rand -hex 32` 生成。
- `ADMIN_PASSWORD` 至少 12 个字符，否则 API 启动会失败。
- HTTP 阶段 `CORS_ALLOWED_ORIGINS` 写 `http://...`。
- HTTPS 配好后再改成 `https://...`。
- 生产环境不要设置 `VITE_API_BASE_URL`，前端会同源请求 `/api/...`。

生成 `SESSION_SECRET`：

```bash
openssl rand -hex 32
```

## 5. Build and Initialize Database

### Option A: Interactive Setup Script

如果是在服务器上做首次部署，推荐使用交互式部署脚本：

```bash
cd /home/twoRiver
bash scripts/deploy-setup.sh
```

脚本会通过命令行询问：

```text
项目路径，默认 /home/twoRiver
主域名，例如 example.me
是否配置 www.example.me
是否现在启用 HTTPS
systemd API 服务名，默认 tworiver-api
Nginx site 名称，默认 tworiver
API 端口，默认 4000
管理员用户名
管理员密码
DeepSeek API Key，可空
DeepSeek Base URL
pnpm 路径，默认自动检测
```

脚本会自动执行：

```text
生成或更新 /home/twoRiver/.env
pnpm install --frozen-lockfile
pnpm build
加载 .env 后执行 migrate
加载 .env 后执行 seed:admin
写入 /etc/systemd/system/tworiver-api.service
启动并启用 systemd API 服务
写入 /etc/nginx/sites-available/tworiver
启用 Nginx site 并 reload
可选运行 certbot --nginx
curl 验证本机 API、Nginx 反代和公网地址
```

写入已有文件前，脚本会创建 `.bak.<timestamp>` 备份，例如：

```text
/home/twoRiver/.env.bak.20260609-143000
/etc/systemd/system/tworiver-api.service.bak.20260609-143000
/etc/nginx/sites-available/tworiver.bak.20260609-143000
```

因为脚本会写入 `/etc/systemd/system` 和 `/etc/nginx/sites-*`，请使用 root 执行。

首次运行脚本前，可以先做语法检查：

```bash
cd /home/twoRiver
bash -n scripts/deploy-setup.sh
```

如果没有输出，表示 Bash 语法检查通过。

### Option B: Manual Build

如果不使用脚本，可以手动执行：

```bash
cd /home/twoRiver
pnpm build
pnpm --filter @tworiver/api migrate
pnpm --filter @tworiver/api seed:admin
```

注意：手动执行 `seed:admin` 时，如果希望使用生产 `.env` 中的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD`，需要先加载 `.env`：

```bash
cd /home/twoRiver
set -a
source .env
set +a
pnpm --filter @tworiver/api seed:admin
```

构建成功后，前端静态文件位于：

```text
/home/twoRiver/apps/web/dist
```

API 启动脚本是：

```bash
pnpm --filter @tworiver/api start
```

## 6. Run API with systemd

创建 systemd 服务：

```bash
vim /etc/systemd/system/tworiver-api.service
```

写入：

```ini
[Unit]
Description=TwoRiver Blog API
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/twoRiver
EnvironmentFile=/home/twoRiver/.env
ExecStart=/usr/local/bin/pnpm --filter @tworiver/api start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
```

如果 `which pnpm` 不是 `/usr/local/bin/pnpm`，把 `ExecStart` 的路径替换成实际输出。

启用并启动服务：

```bash
systemctl daemon-reload
systemctl enable tworiver-api
systemctl start tworiver-api
systemctl status tworiver-api --no-pager
```

验证 API：

```bash
curl http://127.0.0.1:4000/api/health
```

成功返回：

```json
{"ok":true,"service":"tworiver-blog-api"}
```

如果服务没有启动，查看日志：

```bash
journalctl -u tworiver-api -n 80 --no-pager
```

常见错误：

- `ADMIN_PASSWORD` 少于 12 个字符。
- `SESSION_SECRET` 仍是默认值或太短。
- `CORS_ALLOWED_ORIGINS` 在 `NODE_ENV=production` 时没有配置。
- `ExecStart` 中的 `pnpm` 路径不对。

## 7. Configure Nginx

创建站点配置：

```bash
vim /etc/nginx/sites-available/tworiver
```

写入：

```nginx
server {
    listen 80;
    server_name example.me www.example.me;

    root /home/twoRiver/apps/web/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        alias /home/twoRiver/apps/api/data/uploads/;
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

启用站点：

```bash
ln -s /etc/nginx/sites-available/tworiver /etc/nginx/sites-enabled/tworiver
```

如果默认站点仍存在，可以禁用它：

```bash
rm /etc/nginx/sites-enabled/default
```

检查并重载 Nginx：

```bash
nginx -t
systemctl reload nginx
```

本机验证：

```bash
curl http://127.0.0.1/api/health
curl -I http://127.0.0.1
```

预期：

```text
/api/health returns {"ok":true,"service":"tworiver-blog-api"}
frontend returns HTTP/1.1 200 OK
```

## 8. Configure GoDaddy DNS

进入 GoDaddy 域名 DNS 设置，添加或修改：

```text
Type   Name   Value
A      @      your-aliyun-public-ip
A      www    your-aliyun-public-ip
```

也可以使用：

```text
Type   Name   Value
A      @      your-aliyun-public-ip
CNAME  www    example.me
```

等待 DNS 生效后检查：

```bash
nslookup example.me
nslookup www.example.me
```

返回 IP 应该等于阿里云 ECS 公网 IP。

公网验证：

```bash
curl -I http://example.me
curl http://example.me/api/health
```

如果域名解析正确但浏览器打不开，重点检查：

- 阿里云安全组是否开放 `80/80`。
- Ubuntu `ufw` 是否拦截。
- Nginx 配置中的 `server_name` 是否是正确域名。

查看 ufw：

```bash
ufw status
```

如果 `ufw` 是 active：

```bash
ufw allow 'Nginx Full'
ufw reload
```

## 9. Enable HTTPS

HTTPS 可以使用 Let's Encrypt 免费证书，不需要购买 GoDaddy 或阿里云付费 SSL 证书。

先确认：

- `example.me` 已经解析到 ECS 公网 IP。
- 如果要申请 `www.example.me`，`www` 也必须解析到 ECS。
- 阿里云安全组已经开放 `80` 和 `443`。

安装 Certbot：

```bash
apt install -y certbot python3-certbot-nginx
```

如果只有主域名：

```bash
certbot --nginx -d example.me
```

如果主域名和 `www` 都要支持：

```bash
certbot --nginx -d example.me -d www.example.me
```

交互选项建议：

```text
Email: 输入你的邮箱
Agree terms: Y
Share email with EFF: N
Redirect HTTP to HTTPS: 选择 redirect
```

验证 HTTPS：

```bash
curl -I https://example.me
curl https://example.me/api/health
```

成功后更新 `.env`：

```bash
cd /home/twoRiver
vim .env
```

把：

```env
CORS_ALLOWED_ORIGINS=http://example.me,http://www.example.me
```

改成：

```env
CORS_ALLOWED_ORIGINS=https://example.me,https://www.example.me
```

重启 API：

```bash
systemctl restart tworiver-api
systemctl status tworiver-api --no-pager
```

验证自动续期：

```bash
certbot renew --dry-run
```

## 10. Deployment Update Flow

推荐使用仓库里的通用更新脚本：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh
```

运行前可以先做语法检查：

```bash
cd /home/twoRiver
bash -n scripts/deploy-update.sh
```

如果没有输出，表示 Bash 语法检查通过。2026-06-09 的服务器部署过程中，`deploy-setup.sh` 和 `deploy-update.sh` 都已在 Ubuntu 上通过 `bash -n` 检查。

默认流程会执行：

```text
git pull
如果没有新 commit，自动跳过部署
pnpm install --frozen-lockfile
备份 SQLite 数据库
备份 apps/web/dist
pnpm build
pnpm --filter @tworiver/api migrate
systemctl restart tworiver-api
nginx -t
systemctl reload nginx
curl verification
```

脚本会从 `.env` 的 `CORS_ALLOWED_ORIGINS` 自动推断公网验证地址。也可以手动指定：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh --url https://www.example.me
```

更新脚本会在迁移前备份 SQLite，在构建前备份前端产物：

```text
/home/twoRiver/apps/api/data/blog.sqlite.bak.<timestamp>
/home/twoRiver/apps/api/data/uploads/
/home/twoRiver/apps/web/dist.bak.<timestamp>
```

如果部署失败，脚本会打印常用排查命令，并显示已经创建的备份路径。

如果没有新 commit，但仍想强制重新构建和重启：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh --force
```

如果只是前端页面、样式、文案更新：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh --frontend-only
```

如果只是后端 API 更新：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh --api-only
```

如果修改了 `.env` 里的管理员账号或密码，需要让脚本重新 seed 管理员：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh --seed-admin --force
```

关键点：脚本会先加载 `/home/twoRiver/.env`，所以 `migrate` 和 `seed:admin` 会使用生产环境的 `DATABASE_PATH`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`，不会掉回默认用户 `admin`。

常用选项：

```text
--force            没有新 commit 也强制部署
--dry-run          只打印会执行的命令，不实际执行
--no-backup        不备份 SQLite 或 apps/web/dist
--skip-pull        不执行 git pull
--skip-install     不执行 pnpm install --frozen-lockfile
--skip-build       不执行 pnpm build
--skip-migrate     不执行数据库迁移
--no-api-restart   不重启 API
--no-nginx-reload  不重载 Nginx
--no-verify        不执行 curl 验证
--url URL          指定公网验证地址
```

预览将执行哪些步骤但不真正部署：

```bash
cd /home/twoRiver
bash scripts/deploy-update.sh --dry-run
```

如果不用脚本，也可以手动更新：

```bash
cd /home/twoRiver
git pull
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @tworiver/api migrate
systemctl restart tworiver-api
systemctl reload nginx
```

验证：

```bash
curl -I https://example.me
curl https://example.me/api/health
systemctl status tworiver-api --no-pager
```

## 11. Useful Diagnostics

API 服务状态：

```bash
systemctl status tworiver-api --no-pager
journalctl -u tworiver-api -n 80 --no-pager
```

Nginx 配置和日志：

```bash
nginx -t
systemctl status nginx --no-pager
tail -n 80 /var/log/nginx/error.log
tail -n 80 /var/log/nginx/access.log
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

本机 API：

```bash
curl http://127.0.0.1:4000/api/health
```

Nginx 反代 API：

```bash
curl http://127.0.0.1/api/health
curl https://example.me/api/health
```

## 12. Notes for Mainland China ECS

如果 ECS 地域在中国大陆，并且网站要通过域名正式对外提供服务，通常需要 ICP 备案。

如果 ECS 在香港、新加坡、日本等非大陆地域，一般不需要 ICP 备案，但国内访问速度和稳定性取决于线路。
