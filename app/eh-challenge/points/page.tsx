import type { Metadata } from "next";
import Link from "next/link";
import PointsGuide from "../../PointsGuide";

export const metadata: Metadata = {
  title: "How EH points grow · Bedrock",
  description: "A visual guide to Bedrock EH Challenge workout milestones and referral points.",
};

export default function PointsPage() {
  return <main className="max-w-2xl mx-auto px-4 py-5 sm:py-8">
    <Link href="/eh-challenge" className="inline-flex min-h-11 items-center text-sm text-violet-300 hover:text-violet-200 mb-4 underline underline-offset-4 rounded focus-visible:outline-2 focus-visible:outline-violet-400">← Back to leaderboard</Link>
    <PointsGuide />
  </main>;
}
