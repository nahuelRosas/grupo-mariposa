#!/bin/bash
set -e

cd /home/rosasnahuel/mariposa

# Remove existing .git if any to start fresh
rm -rf .git

# Init git
git init
git branch -M main

# Disable GPG signing just for this local repo so the script can run non-interactively
git config commit.gpgsign false

# 1. init
git add .gitignore Makefile docker-compose* init.sql.template scripts/
git commit -m "init: initial project setup and docker configuration"

# 2. catalog bootstrap
git add catalog-service/package.json catalog-service/package-lock.json catalog-service/tsconfig*.json catalog-service/nest-cli.json catalog-service/.eslintrc.js catalog-service/.prettier* catalog-service/Dockerfile catalog-service/docker-entrypoint.sh catalog-service/.env.example catalog-service/tsconfig.build.json catalog-service/tsconfig.seed.json
git commit -m "feat(catalog): bootstrap NestJS catalog service"

# 3. catalog Prisma & tests
git add catalog-service/prisma catalog-service/test catalog-service/src/main.ts catalog-service/src/app.module.ts catalog-service/src/infrastructure.module.ts catalog-service/src/shared
git commit -m "feat(catalog): add Prisma schema and shared infrastructure"

# 4. catalog logic
git add catalog-service/src/domain catalog-service/src/application catalog-service/src/infrastructure
git commit -m "feat(catalog): implement domains, use-cases and controllers"

# 5. loan bootstrap
git add loan-service/go.mod loan-service/go.sum loan-service/Makefile loan-service/Dockerfile loan-service/.env.example loan-service/cmd
git commit -m "feat(loan): bootstrap Go loan service"

# 6. loan domain & app
git add loan-service/internal/domain loan-service/internal/application loan-service/internal/config
git commit -m "feat(loan): implement loan domain and application logic"

# 7. loan infrastructure
git add loan-service/internal/infrastructure loan-service/migrations loan-service/docs
git commit -m "feat(loan): implement PostgreSQL persistence and HTTP/gRPC handlers"

# 8. proto
git add proto
git commit -m "feat: integrate protocol buffers for gRPC communication"

# 9. CI and docs
git add .github README.md
git commit -m "feat: add CI/CD workflow and documentation"

# Add anything left over
git add .
git commit -m "chore: final project adjustments" || true

# Create GitHub repository
echo "Creating GitHub repository nahuelRosas/mariposa..."
gh repo create nahuelRosas/mariposa --public --source=. --remote=origin --push

echo "Successfully created and pushed repository!"
