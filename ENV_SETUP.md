# Environment Setup Guide

## Required Environment Variables

To fix the "Login failed: Invalid API key" error and ensure proper functionality of the application, you need to set up your environment variables correctly.

Create a file named `.env.local` in the root directory of your project with the following variables:

```
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-from-supabase-dashboard

# Storage Configuration
NEXT_PUBLIC_STORAGE_BUCKET=resources
```

## How to Get Your Supabase Keys

1. Go to your [Supabase Dashboard](https://app.supabase.io/)
2. Select your project
3. Go to Project Settings > API
4. Under "Project API keys" you'll find:
   - URL: This is your `NEXT_PUBLIC_SUPABASE_URL`
   - anon/public: This is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## After Setting Environment Variables

After creating or updating your `.env.local` file, you need to:

1. Stop your development server (if it's running)
2. Start it again with `npm run dev`
3. Try logging in again

## Troubleshooting

If you're still experiencing issues:

1. Make sure there are no spaces around the equal signs in your `.env.local` file
2. Verify that your Supabase project is active
3. Check that your API keys are correct
4. Ensure your Supabase authentication is properly configured

## Testing Environment Variables

You can test if your environment variables are properly loaded by visiting:
`http://localhost:3000/api/check-env`

This endpoint will show you which environment variables are set without exposing the actual values.
