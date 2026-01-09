import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Default bucket name to use if environment variable is not set
export const DEFAULT_BUCKET = 'resources';

/**
 * Get the configured storage bucket name or fallback to default
 */
export const getStorageBucket = () => {
  return process.env.NEXT_PUBLIC_STORAGE_BUCKET || DEFAULT_BUCKET;
};

/**
 * Check if a bucket exists and is accessible
 * @param {string} bucketName - The name of the bucket to check
 * @returns {Promise<boolean>} - True if the bucket exists and is accessible
 */
export const checkBucketExists = async (bucketName = getStorageBucket()) => {
  const supabase = createClientComponentClient();
  try {
    const { data, error } = await supabase.storage.from(bucketName).list();
    return !error;
  } catch (error) {
    console.error(`Error checking bucket ${bucketName}:`, error);
    return false;
  }
};

/**
 * Upload a file to Supabase storage
 * @param {File} file - The file to upload
 * @param {string} path - The path/filename to use in the bucket
 * @param {string} bucketName - The bucket name (defaults to configured bucket)
 * @returns {Promise<{url: string|null, error: Error|null}>} - The result of the upload
 */
export const uploadFile = async (file, path, bucketName = getStorageBucket()) => {
  const supabase = createClientComponentClient();
  
  try {
    // First check if the bucket exists
    const bucketExists = await checkBucketExists(bucketName);
    if (!bucketExists) {
      return { 
        url: null, 
        error: new Error(`Storage bucket '${bucketName}' not found or not accessible`) 
      };
    }
    
    // Upload the file
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Error uploading file:', uploadError);
      return { url: null, error: uploadError };
    }
    
    // Get the public URL
    const { data } = supabase.storage
      .from(bucketName)
      .getPublicUrl(path);
    
    return { url: data.publicUrl, error: null };
  } catch (error) {
    console.error('Error in file upload:', error);
    return { url: null, error };
  }
};
