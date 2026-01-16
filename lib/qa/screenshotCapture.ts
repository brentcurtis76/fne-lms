/**
 * Screenshot Capture Utility
 *
 * Uses html2canvas to capture the current viewport and uploads
 * the screenshot to Supabase storage for QA debugging.
 */

import html2canvas from 'html2canvas';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const QA_SCREENSHOTS_BUCKET = 'qa-screenshots';

interface CaptureOptions {
  /** Whether to capture full page or just viewport */
  fullPage?: boolean;
  /** Quality of the image (0-1 for JPEG) */
  quality?: number;
  /** Custom filename prefix */
  filenamePrefix?: string;
  /** Whether to include a timestamp in the filename */
  includeTimestamp?: boolean;
}

interface CaptureResult {
  success: boolean;
  url: string | null;
  error?: string;
}

/**
 * Captures a screenshot of the current page and uploads to Supabase storage.
 *
 * @param options - Configuration options for the capture
 * @returns Promise with the public URL of the uploaded screenshot
 */
export async function captureScreenshot(
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const {
    fullPage = false,
    quality = 0.8,
    filenamePrefix = 'qa-screenshot',
    includeTimestamp = true,
  } = options;

  try {
    // Get the element to capture
    const targetElement = fullPage
      ? document.documentElement
      : document.body;

    // Configure html2canvas options
    const canvas = await html2canvas(targetElement, {
      // For viewport capture, limit to window size
      windowWidth: fullPage ? undefined : window.innerWidth,
      windowHeight: fullPage ? undefined : window.innerHeight,
      // Scroll to top for full page
      scrollX: fullPage ? 0 : window.scrollX,
      scrollY: fullPage ? 0 : window.scrollY,
      // Quality settings
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      // Ignore certain elements that may cause issues
      ignoreElements: (element) => {
        // Ignore hidden elements, iframes, and certain known problematic elements
        return (
          element.classList?.contains('qa-ignore-capture') ||
          element.tagName === 'IFRAME'
        );
      },
      logging: false,
    });

    // Convert canvas to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png', quality);
    });

    if (!blob) {
      return {
        success: false,
        url: null,
        error: 'Failed to convert canvas to blob',
      };
    }

    // Generate filename
    const timestamp = includeTimestamp
      ? `-${new Date().toISOString().replace(/[:.]/g, '-')}`
      : '';
    const filename = `${filenamePrefix}${timestamp}.png`;

    // Upload to Supabase storage
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { error: uploadError } = await supabase.storage
      .from(QA_SCREENSHOTS_BUCKET)
      .upload(filename, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return {
        success: false,
        url: null,
        error: `Upload failed: ${uploadError.message}`,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(QA_SCREENSHOTS_BUCKET)
      .getPublicUrl(filename);

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during capture';
    console.error('Screenshot capture error:', errorMessage);
    return {
      success: false,
      url: null,
      error: errorMessage,
    };
  }
}

/**
 * Captures a screenshot and returns it as a data URL without uploading.
 * Useful for previewing before uploading.
 *
 * @param options - Configuration options for the capture
 * @returns Promise with the data URL of the screenshot
 */
export async function captureScreenshotAsDataUrl(
  options: Omit<CaptureOptions, 'filenamePrefix' | 'includeTimestamp'> = {}
): Promise<{ success: boolean; dataUrl: string | null; error?: string }> {
  const { fullPage = false, quality = 0.8 } = options;

  try {
    const targetElement = fullPage
      ? document.documentElement
      : document.body;

    const canvas = await html2canvas(targetElement, {
      windowWidth: fullPage ? undefined : window.innerWidth,
      windowHeight: fullPage ? undefined : window.innerHeight,
      scrollX: fullPage ? 0 : window.scrollX,
      scrollY: fullPage ? 0 : window.scrollY,
      scale: window.devicePixelRatio || 1,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      ignoreElements: (element) => {
        return (
          element.classList?.contains('qa-ignore-capture') ||
          element.tagName === 'IFRAME'
        );
      },
      logging: false,
    });

    const dataUrl = canvas.toDataURL('image/png', quality);

    return {
      success: true,
      dataUrl,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during capture';
    console.error('Screenshot capture error:', errorMessage);
    return {
      success: false,
      dataUrl: null,
      error: errorMessage,
    };
  }
}

/**
 * Uploads a base64 data URL to Supabase storage.
 *
 * @param dataUrl - The base64 data URL of the image
 * @param filenamePrefix - Optional prefix for the filename
 * @returns Promise with the public URL of the uploaded screenshot
 */
export async function uploadScreenshotFromDataUrl(
  dataUrl: string,
  filenamePrefix: string = 'qa-screenshot'
): Promise<CaptureResult> {
  try {
    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${filenamePrefix}-${timestamp}.png`;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { error: uploadError } = await supabase.storage
      .from(QA_SCREENSHOTS_BUCKET)
      .upload(filename, blob, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      return {
        success: false,
        url: null,
        error: `Upload failed: ${uploadError.message}`,
      };
    }

    const { data: urlData } = supabase.storage
      .from(QA_SCREENSHOTS_BUCKET)
      .getPublicUrl(filename);

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error during upload';
    console.error('Screenshot upload error:', errorMessage);
    return {
      success: false,
      url: null,
      error: errorMessage,
    };
  }
}

export default captureScreenshot;
