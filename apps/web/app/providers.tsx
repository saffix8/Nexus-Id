// apps/web/app/providers.tsx
'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#13161E',
            color: '#EEF0F6',
            border: '1px solid #252C3D',
            borderRadius: '8px',
            fontSize: '14px',
          },
          success: { duration: 3000, iconTheme: { primary: '#22C55E', secondary: '#13161E' } },
          error: { duration: 5000, iconTheme: { primary: '#EF4444', secondary: '#13161E' } },
        }}
      />
    </QueryClientProvider>
  );
}