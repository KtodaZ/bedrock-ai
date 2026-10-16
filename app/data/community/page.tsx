import type { Metadata } from "next";
import DataPageShell from "../../DataPageShell";
import Community from "../../Community";
export const metadata: Metadata = {
  title: "Community | Bedrock Data",
  description:
    "See how Bedrock FNGs follow through, browse the Roster EH family tree, and find PAX ready to lead a first Q.",
};
export default function CommunityPage() {
  return (
    <DataPageShell>
      <Community />
    </DataPageShell>
  );
}
