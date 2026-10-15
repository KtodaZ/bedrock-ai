import type { Metadata } from "next";
import EhCorrectionHistory from "../../EhCorrectionHistory";

export const metadata: Metadata = { title: "EH corrections · Bedrock", description: "Community EH attribution corrections for sheet maintainer review." };
export default function CorrectionsPage() { return <EhCorrectionHistory />; }
