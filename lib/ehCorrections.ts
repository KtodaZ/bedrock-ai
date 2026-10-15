import type { EhRosterPerson } from "./sheet";

export interface EhCorrectionInput {
  requestId: string;
  pax: string;
  ehBy: string;
  submittedBy: string;
  notes: string;
}

export interface EhCorrection extends EhCorrectionInput {
  previousEhBy: string | null;
  createdAt: string;
  notification: { status: "pending" | "sending" | "sent" | "failed"; updatedAt: string; messageId?: string };
}

export class CorrectionInputError extends Error {}
const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function validateCorrection(value: unknown, people: EhRosterPerson[]): EhCorrectionInput {
  if (!value || typeof value !== "object") throw new CorrectionInputError("Enter the F3 names for this correction.");
  const input = value as Record<string, unknown>;
  if (input.website) throw new CorrectionInputError("Couldn't submit this correction.");
  if (typeof input.requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw new CorrectionInputError("Refresh the page and try again.");
  const names = new Map(people.map((person) => [norm(person.name), person.name]));
  const resolve = (key: string, label: string) => {
    const raw = input[key];
    if (typeof raw !== "string" || raw.length > 100) throw new CorrectionInputError(`Choose ${label} from the Roster names.`);
    const match = names.get(norm(raw));
    if (!match) throw new CorrectionInputError(`Choose ${label} from the Roster names. Ask the sheet maintainer to add missing names first.`);
    return match;
  };
  const pax = resolve("pax", "the person");
  const ehBy = resolve("ehBy", "the EH’er");
  const submittedBy = resolve("submittedBy", "your F3 name");
  if (norm(pax) === norm(ehBy)) throw new CorrectionInputError("The EH’er must be someone other than the person invited.");
  if (input.notes !== undefined && (typeof input.notes !== "string" || input.notes.length > 400)) throw new CorrectionInputError("Keep the context to 400 characters or fewer.");
  return { requestId: input.requestId, pax, ehBy, submittedBy, notes: (typeof input.notes === "string" ? input.notes : "").trim() };
}

export function sameCorrection(a: EhCorrectionInput, b: EhCorrectionInput): boolean {
  return a.pax === b.pax && a.ehBy === b.ehBy && a.submittedBy === b.submittedBy && a.notes === b.notes;
}

export function correctionDiscordPayload(record: EhCorrection) {
  return {
    allowed_mentions: { parse: [] },
    embeds: [{
      title: "EH correction submitted",
      description: "For sheet maintainer review. Standings stay unchanged until the Roster is updated.",
      color: 10917914,
      fields: [
        { name: "Person", value: record.pax, inline: true },
        { name: "Proposed EH’er", value: record.ehBy, inline: true },
        { name: "Currently recorded", value: record.previousEhBy || "No EH’er recorded", inline: true },
        { name: "Submitted by (self-reported)", value: record.submittedBy },
        ...(record.notes ? [{ name: "Context", value: record.notes }] : []),
        { name: "Review", value: `[Open correction history](https://data.f3bedrock.com/eh-challenge/corrections#${record.requestId})` },
      ],
      timestamp: record.createdAt,
      footer: { text: `Submission ${record.requestId}` },
    }],
  };
}
