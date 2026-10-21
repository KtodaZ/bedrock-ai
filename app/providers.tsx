"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import ChatSessionProvider from "./ChatSessionProvider";
import ScrollMemory from "./ScrollMemory";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 24 * 60 * 60 * 1000, // 24 hours
            retry: 3,
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}><ChatSessionProvider><ScrollMemory />{children}</ChatSessionProvider></QueryClientProvider>;
}
