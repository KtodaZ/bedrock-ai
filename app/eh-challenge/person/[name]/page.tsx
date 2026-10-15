import type { Metadata } from "next";
import PersonDetail from "../../../PersonDetail";
import type { Period } from "@/lib/ehChallenge";

type Props = { params: Promise<{ name: string }>; searchParams: Promise<{ period?: string }> };

function personName(raw: string): string {
  try { return decodeURIComponent(raw); } catch { return raw; }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  return { title: `${personName(name)} · EH Challenge · Bedrock` };
}

export default async function PersonPage({ params, searchParams }: Props) {
  const { name } = await params;
  const { period: selected } = await searchParams;
  const period: Period = selected === "month" || selected === "all" ? selected : "year";
  return <PersonDetail name={personName(name)} period={period} />;
}
