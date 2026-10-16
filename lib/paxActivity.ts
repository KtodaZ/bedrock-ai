/** Month-by-month posting for one PAX's recorded rows. */
import type { DataRow } from "./dataExplorer";

export interface MonthActivity {
  month: string;
  posts: number;
  qs: number;
}
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};
/** Every month from the first recorded post through asOf, including empty months. */
export function monthlyActivity(
  rows: DataRow[],
  asOf: string,
): MonthActivity[] {
  const posts = rows.filter((r) => r.post && r.date <= asOf);
  if (!posts.length) return [];
  const counts = new Map<string, MonthActivity>();
  const last = asOf.slice(0, 7);
  for (let m = posts[0].date.slice(0, 7); m <= last; m = nextMonth(m))
    counts.set(m, { month: m, posts: 0, qs: 0 });
  for (const r of posts) {
    const c = counts.get(r.date.slice(0, 7));
    if (!c) continue;
    c.posts++;
    if (r.q) c.qs++;
  }
  return [...counts.values()];
}
