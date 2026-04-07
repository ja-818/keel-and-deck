import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for 2 seconds — prevents rapid re-fetches
      // when multiple components mount with the same query key
      staleTime: 2_000,
      // Keep unused data in cache for 5 minutes
      gcTime: 5 * 60_000,
      // Don't retry on error — our Tauri invoke wrapper already shows toasts
      retry: false,
      // Refetch when window regains focus (user alt-tabs back)
      refetchOnWindowFocus: true,
    },
  },
});
