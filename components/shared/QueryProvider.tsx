'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 60 seconds fresh data
            gcTime: 10 * 60 * 1000, // 10 minutes cache retention for instant tab restoration
            refetchOnWindowFocus: false, // Prevent background refetch bursts
            refetchOnReconnect: true, // Refresh when network recovers
            retry: 1, // Single retry on transient network errors
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
