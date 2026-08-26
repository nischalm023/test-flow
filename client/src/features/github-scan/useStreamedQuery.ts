'use client';

import { useState } from 'react';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

export function useStreamedQuery<TData = string>(
  queryKey: unknown[],
  queryFn: (onChunk: (chunk: string) => void) => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, Error>, 'queryKey' | 'queryFn'>
) {
  const [streamText, setStreamText] = useState('');

  const query = useQuery<TData, Error>({
    queryKey,
    queryFn: async () => {
      setStreamText('');
      return queryFn((chunk) => setStreamText(chunk));
    },
    ...options,
  });

  // While fetching, we show the live stream chunks. Once done, we show the cached final data.
  const displayText = query.isFetching ? streamText : ((query.data as unknown as string) ?? streamText);

  return {
    ...query,
    streamText,
    displayText,
  };
}
