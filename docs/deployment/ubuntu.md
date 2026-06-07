# Ubuntu Deployment

This guide deploys the TwoRiver Blog frontend as static files through Nginx and runs the Fastify API as a systemd service.

## Build

```bash
pnpm install --frozen-lockfile
pnpm build
```

## Server Directories

```bash
sudo mkdir -p /var/www/tworiver-blog
sudo mkdir -p /var/lib/tworiver-blog
sudo mkdir -p /opt/tworiver-blog
```

Copy the repository to `/opt/tworiver-blog`, then copy the frontend build output:

```bash
sudo rsync -a apps/web/dist/ /var/www/tworiver-blog/
```

## Environment

Create `/etc/tworiver-blog.env`:

```bash
NODE_ENV=production
PORT=4000
DATABASE_PATH=/var/lib/tworiver-blog/blog.sqlite
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-before-running-seed
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

## Database

```bash
cd /opt/tworiver-blog
pnpm --filter @tworiver/api migrate
pnpm --filter @tworiver/api seed:admin
```

## systemd

Create `/etc/systemd/system/tworiver-blog-api.service`:

```ini
[Unit]
Description=TwoRiver Blog API
After=network.target

[Service]
WorkingDirectory=/opt/tworiver-blog
EnvironmentFile=/etc/tworiver-blog.env
ExecStart=/usr/bin/node apps/api/dist/main.js
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tworiver-blog-api
sudo systemctl status tworiver-blog-api
```

## Nginx

Create `/etc/nginx/sites-available/tworiver-blog`:

```nginx
server {
    listen 80;
    server_name example.com;

    root /var/www/tworiver-blog;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/tworiver-blog /etc/nginx/sites-enabled/tworiver-blog
sudo nginx -t
sudo systemctl reload nginx
```
