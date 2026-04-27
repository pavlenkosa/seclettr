import { useEffect, useRef, useState } from "react";
import { sanitizeDisplayTextOrFallback } from "@/lib/display-text";
import { createRequestSequence } from "@/lib/request-sequence";
import {
  USER_SEARCH_MIN_QUERY_LENGTH,
  searchUsers,
  type UserSearchResult,
} from "@/lib/user-search";

interface UseUserSearchOptions {
  /** Error message to show when the search API call fails. */
  errorMessage: string;
}

export interface UseUserSearchResult {
  inputValue: string;
  results: UserSearchResult[];
  loading: boolean;
  error: string | null;
  handleSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useUserSearch({
  errorMessage,
}: UseUserSearchOptions): UseUserSearchResult {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequenceRef = useRef(createRequestSequence());
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    const requestSequence = requestSequenceRef.current;
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      requestSequence.invalidate();
    };
  }, []);

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < USER_SEARCH_MIN_QUERY_LENGTH) {
      return;
    }

    const requestToken = requestSequenceRef.current.begin();
    setLoading(true);

    (async () => {
      try {
        const users = await searchUsers(normalizedQuery);
        if (!requestSequenceRef.current.isCurrent(requestToken)) return;
        const mapped = users.map((user) => ({
          ...user,
          username: sanitizeDisplayTextOrFallback(user.username, user.userId),
        }));
        setResults(mapped);
      } catch {
        if (!requestSequenceRef.current.isCurrent(requestToken)) return;
        setResults([]);
        setError(errorMessage);
      } finally {
        if (requestSequenceRef.current.isCurrent(requestToken)) {
          setLoading(false);
        }
      }
    })();
  }, [query, errorMessage]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.currentTarget.value;
    setInputValue(value);
    setError(null);
    requestSequenceRef.current.invalidate();

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = globalThis.window.setTimeout(() => {
      setQuery(value);
      if (value.trim().length < USER_SEARCH_MIN_QUERY_LENGTH) {
        setResults([]);
        setLoading(false);
      }
    }, 250);
  };

  return { inputValue, results, loading, error, handleSearchChange };
}
