import type { Metadata } from "next";
import { Suspense } from "react";
import DataPageShell from "../../DataPageShell";
import AoPages from "../../AoPages";
import common from "../../DataExplorer.module.css";
export const metadata: Metadata = {
  title: "AOs | Bedrock Data",
  description:
    "See each Bedrock AO's recorded turnout, regulars, Qs, best-drawing Qs, and growth, and compare two AOs.",
};
export default function AosPage() {
  return (
    <DataPageShell>
      {/* The AO comes from the query string, which is only known in the browser. */}
      <Suspense
        fallback={
          <main className={common.shell}>
            <div className={common.content}>
              <div className={common.loading} role="status">
                Loading recorded attendance…
              </div>
            </div>
          </main>
        }
      >
        <AoPages />
      </Suspense>
    </DataPageShell>
  );
}
