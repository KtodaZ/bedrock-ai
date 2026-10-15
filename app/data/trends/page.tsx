import type { Metadata } from "next";
import DataPageShell from "../../DataPageShell";
import AttendanceTrends from "../../AttendanceTrends";
export const metadata: Metadata = {
  title: "Attendance Trends | Bedrock Data",
  description:
    "See turnout over time, compare AO attendance, and explore a weekly attendance heatmap.",
};
export default function TrendsPage() {
  return (
    <DataPageShell>
      <AttendanceTrends />
    </DataPageShell>
  );
}
