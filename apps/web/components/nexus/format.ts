// Pure display helpers — no Date, no locale, safe in server render.

/** "2027-12-31T…" → "12/2027". Pure string work: no Date, no locale. */
export function formatExpiry(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[1]}` : "—";
}

/** "cr_8f3a2b7c…91c2" → "cr_8f3a…91c2". */
export function truncateId(id: string, head = 7, tail = 4): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}
