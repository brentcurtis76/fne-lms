# ALTERNATIVE: Create Storage Policies via Supabase Dashboard

Since we can't create storage policies via SQL Editor due to permissions, we need to use the Supabase Dashboard interface instead.

## Step-by-Step Instructions

### 1. Go to Storage Policies in Dashboard
1. Visit: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj
2. Click **"Storage"** in the left sidebar
3. Click **"Policies"** tab (next to Buckets)
4. You should see a section for "Objects in storage.objects"

### 2. Create Policy 1: Upload Permission
1. Click **"New Policy"** button
2. Choose **"For full customization"** 
3. Fill in the form:
   - **Policy name**: `Users can upload feedback screenshots`
   - **Allowed operation**: `INSERT` ✓
   - **Target roles**: `authenticated`
   - **USING expression**: Leave empty
   - **WITH CHECK expression**: 
   ```sql
   bucket_id = 'feedback-screenshots' AND 
   (storage.foldername(name))[1] = 'feedback' AND 
   (storage.foldername(name))[2] = auth.uid()::text
   ```
4. Click **"Review"** then **"Save policy"**

### 3. Create Policy 2: View Permission  
1. Click **"New Policy"** button
2. Choose **"For full customization"**
3. Fill in the form:
   - **Policy name**: `Anyone can view feedback screenshots`
   - **Allowed operation**: `SELECT` ✓
   - **Target roles**: `public` (or leave default)
   - **USING expression**: 
   ```sql
   bucket_id = 'feedback-screenshots'
   ```
   - **WITH CHECK expression**: Leave empty
4. Click **"Review"** then **"Save policy"**

### 4. Create Policy 3: Update Permission
1. Click **"New Policy"** button  
2. Choose **"For full customization"**
3. Fill in the form:
   - **Policy name**: `Users can update own feedback screenshots`
   - **Allowed operation**: `UPDATE` ✓
   - **Target roles**: `authenticated`
   - **USING expression**: 
   ```sql
   bucket_id = 'feedback-screenshots' AND 
   (storage.foldername(name))[2] = auth.uid()::text
   ```
   - **WITH CHECK expression**: Leave empty
4. Click **"Review"** then **"Save policy"**

### 5. Create Policy 4: Delete Permission
1. Click **"New Policy"** button
2. Choose **"For full customization"**  
3. Fill in the form:
   - **Policy name**: `Users can delete own feedback screenshots`
   - **Allowed operation**: `DELETE` ✓
   - **Target roles**: `authenticated`
   - **USING expression**: 
   ```sql
   bucket_id = 'feedback-screenshots' AND 
   (storage.foldername(name))[2] = auth.uid()::text
   ```
   - **WITH CHECK expression**: Leave empty
4. Click **"Review"** then **"Save policy"**

## Verification
After creating all 4 policies, you should see them listed in the Storage > Policies section. The "Error al subir la imagen" should be resolved immediately.

## Alternative: Try the Supabase CLI (if installed)
If you have Supabase CLI installed, you could also run:
```bash
supabase storage-policy create --project-ref sxlogxqzmarhqsblxmtj
```

But the Dashboard method above is the most reliable approach.