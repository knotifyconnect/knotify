# knotify Deployment Guide

## Deployment Flow

Local code
-> Git commit
-> GitHub push
-> Vercel deploys frontend
-> Render deploys backend

## Frontend Deployment

Platform: Vercel
App: apps/web

Settings:
Framework: Vite
Root Directory: apps/web
Install Command: npm install
Build Command: npm run build
Output Directory: dist

Environment variables:
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_API_URL=

## Backend Deployment

Platform: Render
App: apps/api

Settings:
Root Directory: empty
Build Command: npm install --include=dev && npm --workspace @nodenet/api run build
Start Command: npm --workspace @nodenet/api run start

Environment variables:
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
CV_ANALYSIS_PROVIDER=local
NPM_CONFIG_PRODUCTION=false

Do not manually set PORT on Render unless needed.

## Deployment Checks

Backend:
- /health should return {"ok":true}
- /health/db should return {"ok":true,"db":"supabase"}

Frontend:
- Signup works.
- Email verification works.
- Login works.
- Your Knot opens after login.
- No 401 errors on main pages.
