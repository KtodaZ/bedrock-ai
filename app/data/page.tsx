import type { Metadata } from "next";
import DataExplorer from "../DataExplorer";
import DataPageShell from "../DataPageShell";
export const metadata: Metadata = {
  title: "Bedrock Data | Attendance Explorer",
  description:
    "Search and filter F3 Bedrock attendance, PAX stats, Qsource, Kotter lists, and AO coverage.",
};
export default function DataPage() {
  return (
    <DataPageShell>
      <DataExplorer />
    </DataPageShell>
  );
}
