import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

interface UseUrlStateOptions {
  serialize?: (value: any) => string;
  deserialize?: (value: string) => any;
  replace?: boolean;
}

function useUrlState<T>(
  key: string,
  initialValue: T,
  options: UseUrlStateOptions = {}
): [T, (value: T) => void] {
  const router = useRouter();
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    replace = false
  } = options;

  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    
    try {
      const urlValue = router.query[key];
      if (typeof urlValue === 'string') {
        return deserialize(decodeURIComponent(urlValue));
      }
    } catch (error) {
      console.warn(`Failed to parse URL state for key "${key}":`, error);
    }
    
    return initialValue;
  });

  const updateState = useCallback((newValue: T) => {
    setState(newValue);
    
    const serialized = serialize(newValue);
    const encoded = encodeURIComponent(serialized);
    
    const newQuery = {
      ...router.query,
      [key]: encoded
    };

    // Remove the key if the value is the same as initial value
    if (JSON.stringify(newValue) === JSON.stringify(initialValue)) {
      delete newQuery[key];
    }

    const method = replace ? 'replace' : 'push';
    router[method]({
      pathname: router.pathname,
      query: newQuery
    }, undefined, { shallow: true });
  }, [router, key, serialize, initialValue, replace]);

  // Update state when URL changes
  useEffect(() => {
    if (router.isReady) {
      try {
        const urlValue = router.query[key];
        if (typeof urlValue === 'string') {
          const parsed = deserialize(decodeURIComponent(urlValue));
          setState(parsed);
        } else if (urlValue === undefined) {
          setState(initialValue);
        }
      } catch (error) {
        console.warn(`Failed to parse URL state for key "${key}":`, error);
        setState(initialValue);
      }
    }
  }, [router.isReady, router.query, key, deserialize, initialValue]);

  return [state, updateState];
}

export default useUrlState;