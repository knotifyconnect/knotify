# knotify Auth Flow

## Provider

Supabase Auth.

## Signup Flow

User signs up with email/password
-> Supabase creates auth user
-> Supabase sends verification email
-> User confirms email
-> User logs in
-> Frontend receives Supabase session
-> Frontend calls backend with auth token

## Required Supabase Settings

Authentication -> Sign In / Providers -> Email:
Allow new users: ON
Confirm Email: ON

Authentication -> URL Configuration:
Site URL: Vercel frontend URL

Redirect URLs:
- Vercel frontend URL/**
- http://localhost:5173/**

## Token Rule

Frontend must send the Supabase access token to backend API requests.

If token is missing, backend returns:
{"error":"Unauthorized"}

## Testing Auth

Use a fresh email alias for each signup test.

Example:
name+knotify001@gmail.com
name+knotify002@gmail.com

Do not reuse old test accounts when testing email verification.
