import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, validAdminSession } from "@/lib/chatAdminAuth";
import ChatHistory from "./ChatHistory";

export const metadata: Metadata = { title: "Chat history · Bedrock", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Page() {
  return <ChatHistory signedIn={validAdminSession((await cookies()).get(ADMIN_COOKIE)?.value)} />;
}
