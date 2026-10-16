import Link from "next/link";
import styles from "./DataInsights.module.css";

export default function DataSectionNav({
  active,
}: {
  active: "attendance" | "trends" | "aos" | "milestones" | "community";
}) {
  return (
    <nav aria-label="Data pages" className={styles.dataNav}>
      {(
        [
          ["attendance", "/data", "Attendance"],
          ["trends", "/data/trends", "Trends"],
          ["aos", "/data/aos", "AOs"],
          ["milestones", "/data/milestones", "Milestones"],
          ["community", "/data/community", "Community"],
        ] as const
      ).map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          aria-current={active === key ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
