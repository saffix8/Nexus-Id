// Relative time for client-only rendering. Pass `now` from useNow(): while it is null (server render and
// first client render) this returns a placeholder, so markup never mismatches during hydration.

import { formatDistanceStrict } from "date-fns";

export function relativeTime(iso: string | null, now: number | null): string {
  if (!iso) return "—";
  if (now === null) return "…";
  const t = new Date(iso).getTime();
  return now - t < 10_000 ? "just now" : formatDistanceStrict(t, now, { addSuffix: true });
}
