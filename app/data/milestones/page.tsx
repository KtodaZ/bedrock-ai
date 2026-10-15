import type { Metadata } from "next";
import DataPageShell from "../../DataPageShell";
import Milestones from "../../Milestones";
export const metadata: Metadata = {
  title: "Milestones | Bedrock Data",
  description:
    "Who is approaching the next 100 posts? Explore attendance-based milestone forecasts and recently reached milestones.",
};
export default function MilestonesPage() {
  return (
    <DataPageShell>
      <Milestones />
    </DataPageShell>
  );
}
