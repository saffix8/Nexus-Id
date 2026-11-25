// Pure display helpers.

/** "2027-12-31T…" → "12/2027". */
export function formatExpiry(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})/.exec(iso) : null;
  return m ? `${m[2]}/${m[1]}` : '—';
}

/** "cr_8f3a2b7c…91c2" → "cr_8f3a…91c2". */
export function truncateId(id: string, head = 7, tail = 4): string {
  return id.length <= head + tail + 1 ? id : `${id.slice(0, head)}…${id.slice(-tail)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "25 Nov 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "14:05" in local time. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Local-day group header: "Today", "Yesterday" or "25 Nov 2026". */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return formatDate(iso);
}

/** Local-day key for grouping. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** 102 → "1:42". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "shop-a.demo" from a URL; falls back to the input. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^[a-z]+:\/\/([^/:?#]+)/i.exec(url);
  return m ? m[1] : url;
}
