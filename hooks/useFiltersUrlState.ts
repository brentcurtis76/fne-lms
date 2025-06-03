import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import useDebounce from './useDebounce';

type FilterValue = string | number | boolean | null | undefined;

interface UseFiltersUrlStateOptions {
  debounceMs?: number;
  replace?: boolean;
}

function useFiltersUrlState<T extends Record<string, FilterValue>>(
  initialFilters: T,
  options: UseFiltersUrlStateOptions = {}
): [T, (newFilters: Partial<T>) => void, () => void, boolean] {
  const router = useRouter();
  const { debounceMs = 500, replace = true } = options;
  const [filters, setFilters] = useState<T>(initialFilters);
  const [isInitialized, setIsInitialized] = useState(false);

  // Debounce the filters to avoid too many URL updates
  const debouncedFilters = useDebounce(filters, debounceMs);

  // Parse URL parameters into filters
  const parseUrlParams = useCallback((): T => {
    if (!router.isReady) return initialFilters;

    const parsed = { ...initialFilters };
    
    Object.keys(initialFilters).forEach((key) => {
      const value = router.query[key];
      if (value !== undefined && value !== null && value !== '') {
        const initialValue = initialFilters[key as keyof T];
        
        if (typeof initialValue === 'boolean') {
          parsed[key as keyof T] = (value === 'true') as T[keyof T];
        } else if (typeof initialValue === 'number') {
          const num = Number(value);
          if (!isNaN(num)) {
            parsed[key as keyof T] = num as T[keyof T];
          }
        } else {
          parsed[key as keyof T] = value as T[keyof T];
        }
      }
    });
    
    return parsed;
  }, [router.isReady, router.query, initialFilters]);

  // Initialize filters from URL on component mount
  useEffect(() => {
    if (router.isReady && !isInitialized) {
      const urlFilters = parseUrlParams();
      setFilters(urlFilters);
      setIsInitialized(true);
    }
  }, [router.isReady, parseUrlParams, isInitialized]);

  // Update URL when debounced filters change (but not on initial load)
  useEffect(() => {
    if (!isInitialized || !router.isReady) return;

    const query = { ...router.query };
    
    // Update only the filter keys
    Object.keys(debouncedFilters).forEach((key) => {
      const value = debouncedFilters[key as keyof T];
      const initialValue = initialFilters[key as keyof T];
      
      if (value === null || value === undefined || value === '' || value === initialValue) {
        // Remove parameter if it's null, undefined, empty, or equals initial value
        delete query[key];
      } else {
        // Convert value to string for URL
        query[key] = String(value);
      }
    });

    const url = {
      pathname: router.pathname,
      query
    };

    if (replace) {
      router.replace(url, undefined, { shallow: true });
    } else {
      router.push(url, undefined, { shallow: true });
    }
  }, [debouncedFilters, router, initialFilters, replace, isInitialized]);

  // Update filters function
  const updateFilters = useCallback((newPartialFilters: Partial<T>) => {
    setFilters(prev => ({ ...prev, ...newPartialFilters }));
  }, []);

  // Reset filters to initial state
  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
  }, [initialFilters]);

  return [filters, updateFilters, resetFilters, isInitialized];
}

export default useFiltersUrlState;