# TwoRiver Documentation

This directory contains current operating documentation and earlier planning artifacts.

## Current Docs

- [Deployment Guide](deployment/ubuntu.md): canonical Ubuntu, Aliyun ECS, GoDaddy DNS, Nginx, systemd, HTTPS, first-time setup, and update flow.
- [Project Test Checklist](checklist.md): manual QA checklist for public pages, admin workflows, API behavior, security, and performance.

## Historical Planning Artifacts

The `docs/superpowers/` files are design and implementation planning records from the initial build. They are useful context, but they may include older deployment paths or service names from the original plan.

For current deployment operations, prefer:

```bash
bash scripts/deploy-setup.sh
bash scripts/deploy-update.sh
```

and use [deployment/ubuntu.md](deployment/ubuntu.md) as the source of truth.
