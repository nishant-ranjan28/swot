import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

export function useStockData(endpoint, options = {}) {
  const { enabled = true, refetchOnMount = true } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!endpoint || !enabled) return;
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(endpoint);
      setData(response.data);
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Failed to fetch data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled]);

  useEffect(() => {
    if (refetchOnMount) { fetchData(); }
  }, [fetchData, refetchOnMount]);

  return { data, loading, error, refetch: fetchData };
}
