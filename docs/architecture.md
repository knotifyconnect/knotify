# knotify Architecture

knotify is a professional networking and trusted-connection management platform.

## Current Stack

Frontend: React + Vite
Backend: Express + TypeScript
Database/Auth: Supabase
Frontend Hosting: Vercel
Backend Hosting: Render
Source Control: GitHub

## Repository Structure

apps/web - frontend app
apps/api - backend API
packages/shared - shared TypeScript types
supabase - database migrations
docs - project documentation

## Runtime Flow

User Browser
-> Vercel Frontend
-> Render Backend API
-> Supabase Auth/Postgres

## Security Rules

- Never commit .env files.
- Frontend uses Supabase anon key only.
- Backend uses Supabase service role key.
- Service role key must never appear in frontend code.
- Email confirmation should stay ON for public signup.

## Future Launch Setup

For real launch:
- Buy a proper domain.
- Use app.domain.com for frontend.
- Use api.domain.com for backend.
- Upgrade Supabase to Pro.
- Upgrade hosting plans.
- Add analytics, error tracking, monitoring, and backups.
