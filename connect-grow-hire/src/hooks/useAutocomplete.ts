import { useState, useEffect } from 'react';
import useDebounce from './use-debounce';

const BACKEND_URL = 'http://localhost:5001';

export const useAutocomplete = (dataType: string, query: string, enabled = true) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debouncedQuery = useDebounce(query, 300); // 300ms delay

  useEffect(() => {
    if (!enabled || !debouncedQuery || debouncedQuery.length < 2) {
      setSuggestions([]);
      setError(null);
      return;
    }

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(
          `${BACKEND_URL}/api/autocomplete/${dataType}?query=${encodeURIComponent(debouncedQuery)}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.error) {
          throw new Error(data.error);
        }
        
        setSuggestions(data.suggestions || []);
      } catch (error) {
        console.error('Autocomplete error:', error);
        setError(error instanceof Error ? error.message : 'Unknown error');
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSuggestions();
  }, [dataType, debouncedQuery, enabled]);

  return { suggestions, isLoading, error };
};