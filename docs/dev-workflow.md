# knotify Development Workflow

## Core Rule

Do not code directly on main.

main = stable deployed version
feature branch = one focused change
pull request = review before merge

## New Feature Workflow

Start from main:

git checkout main
git pull origin main
git checkout -b feature/name-of-change

Make changes.

Build before commit:

npm --workspace @nodenet/web run build
npm --workspace @nodenet/api run build

Commit:

git add .
git commit -m "Describe the change"

Push the actual branch name:

git push -u origin feature/name-of-change

Important: feature/name-of-change is only an example. Replace it with your real branch name.

Examples:
git push -u origin feature/improve-empty-knot
git push -u origin docs/project-docs

## Never Commit

apps/api/.env
apps/web/.env
Supabase service role key
API secrets
database passwords

## Local Commands

Run backend:
npm --workspace @nodenet/api run dev

Run frontend:
npm --workspace @nodenet/web run dev

Build backend:
npm --workspace @nodenet/api run build

Build frontend:
npm --workspace @nodenet/web run build
