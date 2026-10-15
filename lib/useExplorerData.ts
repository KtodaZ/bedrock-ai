"use client";
import { useQuery } from "@tanstack/react-query";
import type { ExplorerData } from "./dataExplorer";

/** One shared cache for attendance, trends, and milestone views. */
export function useExplorerData() {
  return useQuery<ExplorerData>({
    queryKey: ["attendance-explorer"],
    queryFn: async () => {
      const response = await fetch("/api/data");
      if (!response.ok) throw new Error("Attendance data could not be loaded.");
      return response.json();
    },
    staleTime: 5 * 60_000,
    retry: 1,
  });
}
