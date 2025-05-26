# Storage Configuration for FNE LMS

## Environment Variables

To configure the storage bucket for file uploads, you need to set the following environment variable in your `.env.local` file:

```
NEXT_PUBLIC_STORAGE_BUCKET=resources
```

## Available Buckets

Common bucket names that might be available in your Supabase project:
- `resources` - For lesson files and downloadable content
- `thumbnails` - For course thumbnails
- `course-images` - For course banner images
- `public` - For general public files

## How It Works

1. The application reads the `NEXT_PUBLIC_STORAGE_BUCKET` environment variable
2. All file uploads (lesson resources, course thumbnails, etc.) use this bucket
3. If the bucket is not configured, you'll see an error message: "No storage bucket configured. Please set NEXT_PUBLIC_STORAGE_BUCKET in .env.local"

## Creating a Bucket in Supabase

If you need to create a new bucket:

1. Go to your Supabase project dashboard
2. Navigate to the Storage section
3. Click "Create new bucket"
4. Name it (e.g., "resources")
5. Set the appropriate permissions
6. Update your `.env.local` file with the bucket name

## Troubleshooting

If you encounter a "Bucket not found" error:
1. Check that the bucket name in your `.env.local` file matches exactly with a bucket in your Supabase project
2. Verify that the bucket has the correct permissions
3. Make sure your Supabase service role key has access to the bucket
