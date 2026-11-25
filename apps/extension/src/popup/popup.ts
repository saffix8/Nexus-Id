// NexusID popup — SCR-011 (FR-031–FR-034). DESIGN.md §6.3, 360 × 560.
//
// One state at a time:
//   loading → not paired (QRPanel) → paired idle → request pending
//   → VERIFIED / FAILED / DECLINED / EXPIRED → (Dismiss) → paired idle
//
// The popup holds no state of its own: it renders chrome.storage.local (written
// by the background worker) and re-renders on storage changes. While a QR or a
// request is pending it nudges the worker every 2 s so the view stays live.

import {
  CATEGORY_DISPLAY,
  PREDICATE_DISPLAY,
  isPredicateCode,
  predicateLabel,
} from "@nexusid/types";
import type { CredentialType } from "@nexusid/types";
import {
  FAST_POLL_MS,
  PAIRING_KEY,
  PORTAL_URL,
  QR_TTL_MS,
  REQUEST_KEY,
} from "../shared/config";
import * as I from "../shared/icons";
import type { IconNode } from "../shared/icons";
import type {
  PairingRecord,
  PopupMessage,
  RequestOutcome,
  RequestRecord,
  WorkerReply,
} from "../shared/state";

declare function qrcode(
  typeNumber: number,
  level: "L" | "M" | "Q" | "H",
): {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
};

// ─── State ────────────────────────────────────────────────────────────────

interface UiState {
  pairing: PairingRecord | null;
  request: RequestRecord | null;
  loaded: boolean;
  /** Message when the backend can't be reached or rejects us. */
  error: string | null;
  busy: boolean;
  confirmUnpair: boolean;
  /** Brief "Paired ✓" moment on the QR panel before switching views. */
  justPaired: boolean;
}

const ui: UiState = {
  pairing: null,
  request: null,
  loaded: false,
  error: null,
  busy: false,
  confirmUnpair: false,
  justPaired: false,
};

const $view = document.getElementById("view")!;
const $status = document.getElementById("status")!;
const $announce = document.getElementById("sr-announce")!;

let currentKey = "";
/** Per-view updater run by the 250 ms ticker (countdowns). */
let tick: (() => void) | null = null;

// ─── Worker messaging ─────────────────────────────────────────────────────

async function send<T>(msg: PopupMessage): Promise<T> {
  const r = (await chrome.runtime.sendMessage(msg)) as
    WorkerReply<T> | undefined;
  if (!r)
    throw new Error(
      "The NexusID background worker did not answer. Reload the extension.",
    );
  if (!r.success) throw new Error(r.error);
  return r.data;
}

// ─── DOM helpers ──────────────────────────────────────────────────────────

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = String(v);
    else if (k === "style") el.setAttribute("style", String(v));
    else if (k.startsWith("on") && typeof v === "function") {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

const SVG_NS = "http://www.w3.org/2000/svg";

function icon(node: IconNode, size = 16, extraClass = ""): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("class", `icon ${extraClass}`.trim());
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of node) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) child.setAttribute(k, v);
    svg.append(child);
  }
  return svg;
}

function dot(pulse = false): HTMLSpanElement {
  return h("span", {
    class: pulse ? "dot pulse" : "dot",
    "aria-hidden": "true",
  });
}

function fmtClock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function announce(text: string): void {
  $announce.textContent = "";
  // Re-set on the next frame so screen readers read repeated text.
  requestAnimationFrame(() => ($announce.textContent = text));
}

// ─── Signature components ─────────────────────────────────────────────────

const CATEGORY_ICON: Record<CredentialType, IconNode> = {
  identity: I.IdCard,
  education: I.GraduationCap,
  employment: I.BriefcaseBusiness,
  enrollment: I.School,
};

/** PredicateChip (§5.6): category-tinted pill + the code underneath in mono (§3.3). */
function predicateChip(code: string): HTMLElement {
  const known = isPredicateCode(code) ? PREDICATE_DISPLAY[code] : null;
  const color = known ? CATEGORY_DISPLAY[known.category].color : "#8B92A8";
  const chip = h(
    "span",
    {
      class: "chip",
      title: code,
      style: `color:${color};background:${color}1A;border-color:${color}40`,
    },
    icon(known ? CATEGORY_ICON[known.category] : I.ShieldCheck, 14),
    predicateLabel(code),
  );
  return h(
    "div",
    { class: "chip-wrap" },
    chip,
    h("span", { class: "chip-code" }, code),
  );
}

const OUTCOME_UI: Record<
  Exclude<RequestOutcome, "PENDING">,
  { tint: string; icon: IconNode; label: string }
> = {
  VERIFIED: { tint: "tint-success", icon: I.CircleCheck, label: "VERIFIED" },
  FAILED: { tint: "tint-danger", icon: I.CircleX, label: "FAILED" },
  DECLINED: { tint: "tint-muted", icon: I.Ban, label: "DECLINED" },
  EXPIRED: { tint: "tint-warning", icon: I.TimerOff, label: "EXPIRED" },
};

/** OutcomeBadge (§3.2): icon + label + colour, never colour alone. */
function outcomeBadge(
  outcome: Exclude<RequestOutcome, "PENDING">,
): HTMLElement {
  const o = OUTCOME_UI[outcome];
  return h("span", { class: `badge ${o.tint}` }, icon(o.icon, 12), o.label);
}

// ─── Header status ────────────────────────────────────────────────────────

function renderStatus(): void {
  $status.replaceChildren();
  const pending = ui.request?.outcome === "PENDING";
  const paired = ui.pairing?.status === "paired";
  if (!ui.loaded) return;
  if (pending) {
    $status.style.color = "var(--accent-text)";
    $status.append(dot(true), "Pending");
  } else if (paired) {
    $status.style.color = "var(--success)";
    $status.append(dot(), "Paired");
  } else {
    $status.style.color = "var(--text-muted)";
    $status.append(dot(), "Not paired");
  }
}

// ─── Views ────────────────────────────────────────────────────────────────

function viewKey(): string {
  if (!ui.loaded) return "loading";
  const r = ui.request;
  if (ui.pairing?.status === "paired" && !ui.justPaired) {
    if (r && r.outcome === "PENDING") return `pending:${r.localId}`;
    if (r) return `outcome:${r.localId}:${r.outcome}`;
    return `paired:${ui.pairing.deviceName ?? ""}:${ui.confirmUnpair}:${ui.busy}`;
  }
  if (ui.error) return `error:${ui.error}`;
  const p = ui.pairing;
  return `qr:${p?.status === "pending" ? p.challengeId : "none"}:${ui.busy}:${ui.justPaired}`;
}

function render(): void {
  renderStatus();
  const key = viewKey();
  if (key === currentKey) {
    tick?.();
    return;
  }
  currentKey = key;
  tick = null;

  const kind = key.split(":")[0];
  const node =
    kind === "loading"
      ? loadingView()
      : kind === "error"
        ? errorView(ui.error!)
        : kind === "qr"
          ? qrView()
          : kind === "paired"
            ? pairedView()
            : kind === "pending"
              ? pendingView(ui.request!)
              : outcomeView(ui.request!);
  $view.replaceChildren(...(Array.isArray(node) ? node : [node]));
  // The view builder may have set `tick`; TS narrowed it to null above.
  (tick as (() => void) | null)?.();
}

function loadingView(): Node[] {
  return [
    h("div", {
      class: "skeleton",
      style: "height:20px;width:60%;margin:0 auto 10px",
    }),
    h("div", {
      class: "skeleton",
      style: "height:14px;width:80%;margin:0 auto 20px",
    }),
    h("div", {
      class: "skeleton",
      style: "height:224px;width:224px;border-radius:50%;margin:0 auto",
    }),
  ];
}

function errorView(message: string): Node[] {
  return [
    h(
      "div",
      { class: "hero" },
      h("div", { class: "tile tint-danger" }, icon(I.TriangleAlert, 32)),
      h("div", { class: "title" }, "Can't reach NexusID"),
      h("p", { class: "subtitle" }, message),
    ),
    h("div", { class: "spacer" }),
    h(
      "button",
      {
        class: "btn primary block",
        type: "button",
        onclick: () => void newCode(),
      },
      icon(I.RefreshCw, 16),
      "Retry",
    ),
  ];
}

// QRPanel — §5.4 -------------------------------------------------------------

const RING_SIZE = 224;
const RING_R = 108;
const RING_C = 2 * Math.PI * RING_R;

function qrView(): Node[] {
  const p = ui.pairing?.status === "pending" ? ui.pairing : null;

  const head = h(
    "div",
    { class: "qr-head" },
    h("div", { class: "title" }, "Pair your phone"),
    h("p", { class: "subtitle" }, "Link this browser to your NexusID wallet."),
  );

  // Countdown ring
  const ring = document.createElementNS(SVG_NS, "svg");
  ring.setAttribute("class", "ring");
  ring.setAttribute("viewBox", `0 0 ${RING_SIZE} ${RING_SIZE}`);
  ring.setAttribute("aria-hidden", "true");
  const track = document.createElementNS(SVG_NS, "circle");
  const prog = document.createElementNS(SVG_NS, "circle");
  for (const c of [track, prog]) {
    c.setAttribute("cx", String(RING_SIZE / 2));
    c.setAttribute("cy", String(RING_SIZE / 2));
    c.setAttribute("r", String(RING_R));
    c.setAttribute("fill", "none");
    c.setAttribute("stroke-width", "4");
    c.setAttribute("stroke-linecap", "round");
  }
  track.setAttribute("class", "ring-track");
  prog.setAttribute("class", "ring-progress");
  prog.setAttribute("stroke-dasharray", String(RING_C));
  ring.append(track, prog);

  const square = h("div", { class: "qr-square" });
  const overlay = h("div", { class: "qr-overlay" });

  if (p && !ui.busy) {
    square.append(drawQr(p.qrPayload));
  } else {
    square.classList.add("loading");
    square.append(
      h("div", { class: "qr-skeleton", "aria-label": "Generating code" }),
    );
  }
  square.append(overlay);

  const statusText = h("span", {}, "Waiting for scan…");
  const statusDot = dot(true);
  const count = h("span", { class: "count" }, "");
  const sep = h("span", { class: "sep" }, "·");
  const status = h(
    "div",
    { class: "qr-status", style: "color:var(--accent-text)" },
    statusDot,
    statusText,
    sep,
    count,
  );

  const newCodeBtn = h(
    "button",
    { class: "btn sm", type: "button", onclick: () => void newCode() },
    icon(I.RefreshCw, 14),
    "New code",
  );

  const steps = h(
    "ol",
    { class: "steps" },
    h(
      "li",
      {},
      h("span", { class: "n" }, "1"),
      "Open ",
      h("strong", {}, "NexusID"),
      " on your phone",
    ),
    h(
      "li",
      {},
      h("span", { class: "n" }, "2"),
      "Tap ",
      h("strong", {}, "Scan"),
    ),
    h("li", {}, h("span", { class: "n" }, "3"), "Point it at this code"),
  );

  let announced30 = false;
  let announced10 = false;
  let lastState = "";

  tick = () => {
    if (ui.justPaired) {
      prog.setAttribute("stroke-dashoffset", "0");
      prog.setAttribute("class", "ring-progress");
      prog.style.stroke = "var(--success)";
      status.style.color = "var(--success)";
      statusDot.classList.remove("pulse");
      statusText.textContent = "Paired ✓";
      count.textContent = "";
      sep.style.display = "none";
      return;
    }
    if (!p || ui.busy) {
      prog.setAttribute("stroke-dashoffset", String(RING_C));
      statusText.textContent = "Generating code…";
      count.textContent = "";
      return;
    }
    const left = Date.parse(p.expiresAt) - Date.now();
    const frac = Math.max(0, Math.min(1, left / QR_TTL_MS));
    prog.setAttribute("stroke-dashoffset", String(RING_C * (1 - frac)));
    prog.setAttribute(
      "class",
      `ring-progress${left <= 10_000 ? " danger" : left <= 30_000 ? " warn" : ""}`,
    );
    count.textContent = fmtClock(left);

    if (!announced30 && left <= 30_000 && left > 10_000) {
      announced30 = true;
      announce("30 seconds left to scan");
    }
    if (!announced10 && left <= 10_000 && left > 0) {
      announced10 = true;
      announce("10 seconds left to scan");
    }

    const state = left <= 0 ? "expired" : "live";
    if (state === lastState) return;
    lastState = state;
    if (state === "expired") {
      square.classList.add("expired");
      overlay.replaceChildren(
        h("span", {}, "Code expired"),
        h(
          "button",
          {
            class: "btn primary sm",
            type: "button",
            onclick: () => void newCode(),
          },
          icon(I.RefreshCw, 14),
          "New code",
        ),
      );
      status.style.color = "var(--danger)";
      statusDot.classList.remove("pulse");
      statusText.textContent = "Code expired";
    } else {
      square.classList.remove("expired");
      overlay.replaceChildren();
      status.style.color = "var(--accent-text)";
      statusDot.classList.add("pulse");
      statusText.textContent = "Waiting for scan…";
    }
  };

  // No phone at hand: copy the pairing link and open it in the signed-in portal (web stand-in, FR-003).
  const copyLabel = h("span", {}, "Copy code");
  const copyIcon = h("span", { style: "display:inline-flex" }, icon(I.Copy, 14));
  const copyBtn = h(
    "button",
    {
      class: "btn sm",
      type: "button",
      disabled: !p || ui.busy ? "" : undefined,
      title: "Copy the pairing link to open in the NexusID portal",
      onclick: async () => {
        if (!p) return;
        try {
          await navigator.clipboard.writeText(p.qrPayload);
          copyIcon.replaceChildren(icon(I.Check, 14));
          copyLabel.textContent = "Copied";
          announce("Pairing link copied. Open it in the NexusID portal.");
          setTimeout(() => {
            copyIcon.replaceChildren(icon(I.Copy, 14));
            copyLabel.textContent = "Copy code";
          }, 2000);
        } catch {
          copyLabel.textContent = "Couldn't copy";
        }
      },
    },
    copyIcon,
    copyLabel,
  );

  return [
    head,
    h("div", { class: "qr-ring" }, ring, square),
    status,
    h(
      "div",
      { style: "display:flex;justify-content:center;gap:8px;margin-top:10px" },
      newCodeBtn,
      copyBtn,
    ),
    steps,
  ];
}

function drawQr(payload: string): HTMLCanvasElement {
  const qr = qrcode(0, "M");
  qr.addData(payload);
  qr.make();
  const n = qr.getModuleCount();
  const css = 168;
  const dpr = window.devicePixelRatio || 1;
  const canvas = h("canvas", { role: "img", "aria-label": "Pairing QR code" });
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, css, css);
  ctx.fillStyle = "#0c0e13";
  const cell = css / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        // Overdraw by a hair so adjacent modules don't show seams.
        ctx.fillRect(c * cell, r * cell, cell + 0.4, cell + 0.4);
      }
    }
  }
  return canvas;
}

// Paired idle ----------------------------------------------------------------

function pairedView(): Node[] {
  const p = ui.pairing as Extract<PairingRecord, { status: "paired" }>;
  const name = p.deviceName ?? "your phone";

  const deviceCard = ui.confirmUnpair
    ? h(
        "div",
        { class: "card confirm" },
        h("div", { style: "font-weight:600" }, "Unpair this browser?"),
        h(
          "p",
          { class: "subtitle", style: "margin-top:4px" },
          `Sites can't send requests to ${name} from this browser until you pair again.`,
        ),
        h(
          "div",
          { class: "actions" },
          h(
            "button",
            {
              class: "btn sm",
              type: "button",
              onclick: () => ((ui.confirmUnpair = false), render()),
            },
            "Cancel",
          ),
          h(
            "button",
            {
              class: "btn sm danger",
              type: "button",
              disabled: ui.busy || null,
              onclick: () => void doUnpair(),
            },
            icon(I.Unlink, 14),
            ui.busy ? "Unpairing…" : "Unpair",
          ),
        ),
      )
    : h(
        "div",
        { class: "card device-row" },
        h(
          "span",
          {
            class: "tile tint-success",
            style: "width:40px;height:40px;border-radius:10px",
          },
          icon(I.Smartphone, 20),
        ),
        h(
          "div",
          { class: "grow" },
          h(
            "div",
            { class: "eyebrow", style: "margin-bottom:4px" },
            "Paired with",
          ),
          h(
            "div",
            { class: "device-name", title: name },
            p.deviceName ?? "NexusID wallet",
          ),
        ),
        h(
          "button",
          {
            class: "btn sm",
            type: "button",
            "aria-label": "Unpair this browser",
            onclick: () => ((ui.confirmUnpair = true), render()),
          },
          "Unpair",
        ),
      );

  return [
    h(
      "div",
      { class: "hero", style: "padding-top:24px;padding-bottom:24px" },
      h("div", { class: "tile tint-success" }, icon(I.ShieldCheck, 32)),
      h("div", { class: "title" }, "Ready"),
      h(
        "p",
        { class: "subtitle", style: "max-width:270px" },
        "When a site asks you to verify, approve it on your phone.",
      ),
    ),
    deviceCard,
    h("div", { class: "spacer" }),
    h(
      "div",
      { class: "privacy" },
      icon(I.EyeOff, 14),
      "Only the answer is shared. Never your data.",
    ),
  ];
}

// Request pending -------------------------------------------------------------

function pendingView(r: RequestRecord): Node[] {
  const device = ui.pairing?.status === "paired" ? ui.pairing.deviceName : null;
  const count = h("span", { class: "count" }, "");

  tick = () => {
    const left = Date.parse(r.expiresAt) - Date.now();
    count.textContent = left > 0 ? fmtClock(left) : "0:00";
    count.className = `count${left <= 30_000 ? " warn" : ""}`;
  };

  return [
    h(
      "div",
      { class: "eyebrow", style: "margin-bottom:10px" },
      "Verification request",
    ),
    h(
      "div",
      { class: "card" },
      h(
        "div",
        { class: "platform" },
        h("span", { class: "logo" }, icon(I.Globe, 20)),
        h(
          "div",
          { style: "min-width:0" },
          h("div", { class: "name" }, r.verifierName),
          h("div", { class: "host", title: r.pageUrl }, hostOf(r.pageUrl)),
        ),
      ),
      h(
        "div",
        { class: "asks" },
        h("span", { class: "subtitle" }, "wants to confirm"),
        predicateChip(r.predicate),
      ),
    ),
    h(
      "div",
      { class: "waiting", style: "margin-top:12px" },
      dot(true),
      h("span", {}, "Waiting for your phone…"),
      count,
    ),
    h(
      "p",
      { class: "subtitle", style: "text-align:center;margin-top:12px" },
      `Open NexusID on ${device ?? "your phone"} to approve or decline.`,
    ),
    h("div", { class: "spacer" }),
    h(
      "div",
      { class: "privacy" },
      icon(I.EyeOff, 14),
      "Only the answer is shared. Never your data.",
    ),
  ];
}

// Outcome ---------------------------------------------------------------------

function drawnCheck(): SVGSVGElement {
  // CircleCheck with stroke-draw animation (§3.5).
  const svg = icon(I.CircleCheck, 36, "drawn-check");
  svg.querySelectorAll("circle, path").forEach((el, i) => {
    el.classList.add("draw");
    if (i > 0) el.classList.add("late");
  });
  return svg;
}

function outcomeView(r: RequestRecord): Node[] {
  const outcome = r.outcome as Exclude<RequestOutcome, "PENDING">;
  const o = OUTCOME_UI[outcome];
  const v = r.verifierName;

  const copy: Record<typeof outcome, { title: string; line: string }> = {
    VERIFIED: {
      title: `Verified for ${v}`,
      line: `${v} learned only that the condition is met.`,
    },
    FAILED: {
      title: "Verification failed",
      line: r.reason ?? "The proof could not be verified.",
    },
    DECLINED: {
      title: "Request declined",
      line: `You declined on your phone. ${v} learned nothing.`,
    },
    EXPIRED: {
      title: "Request expired",
      line: "No answer within 2 minutes. Reload the page to try again.",
    },
  };

  return [
    h(
      "div",
      { class: "hero", style: "padding-top:20px" },
      h(
        "div",
        { class: `tile ${o.tint}` },
        outcome === "VERIFIED" ? drawnCheck() : icon(o.icon, 32),
      ),
      outcomeBadge(outcome),
      h("div", { class: "title" }, copy[outcome].title),
      h(
        "p",
        { class: "subtitle", style: "max-width:290px" },
        copy[outcome].line,
      ),
    ),
    h(
      "div",
      {
        class: "card",
        style:
          "margin-top:16px;display:flex;flex-direction:column;align-items:center;gap:10px",
      },
      predicateChip(r.predicate),
      h(
        "span",
        { class: "meta" },
        `${hostOf(r.pageUrl)} · ${fmtTime(r.decidedAt)}`,
      ),
    ),
    h("div", { class: "spacer" }),
    h(
      "button",
      { class: "btn block", type: "button", onclick: () => void dismiss() },
      "Dismiss",
    ),
  ];
}

// ─── Actions ──────────────────────────────────────────────────────────────

async function newCode(): Promise<void> {
  if (ui.busy) return;
  ui.busy = true;
  ui.error = null;
  render();
  try {
    ui.pairing = await send<PairingRecord>({ type: "START_PAIRING" });
  } catch (err) {
    ui.error = err instanceof Error ? err.message : String(err);
  } finally {
    ui.busy = false;
    render();
  }
}

async function doUnpair(): Promise<void> {
  ui.busy = true;
  render();
  try {
    await send({ type: "UNPAIR" });
  } catch {
    // The worker forgets the token locally even if the server call fails.
  }
  ui.busy = false;
  ui.confirmUnpair = false;
  ui.pairing = null;
  ui.request = null;
  render();
  void newCode();
}

async function dismiss(): Promise<void> {
  await send({ type: "DISMISS_REQUEST" }).catch(() => {});
  ui.request = null;
  render();
}

// ─── Live updates ─────────────────────────────────────────────────────────

function applyPairing(next: PairingRecord | null): void {
  const wasPending = ui.pairing?.status === "pending";
  ui.pairing = next;
  if (wasPending && next?.status === "paired") {
    // Hold "Paired ✓" on the QR panel for a moment (§5.4 status line).
    ui.justPaired = true;
    announce(`Paired with ${next.deviceName ?? "your phone"}`);
    setTimeout(() => {
      ui.justPaired = false;
      render();
    }, 1200);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (PAIRING_KEY in changes)
    applyPairing((changes[PAIRING_KEY].newValue as PairingRecord) ?? null);
  if (REQUEST_KEY in changes) {
    const next = (changes[REQUEST_KEY].newValue as RequestRecord) ?? null;
    if (
      next &&
      next.outcome !== "PENDING" &&
      ui.request?.outcome === "PENDING"
    ) {
      announce(
        `${OUTCOME_UI[next.outcome as Exclude<RequestOutcome, "PENDING">].label}: ${next.verifierName}`,
      );
    }
    ui.request = next;
  }
  render();
});

/** Nudge the worker while something is pending, so updates land in ~2 s. */
function heartbeat(): void {
  if (
    ui.pairing?.status === "pending" &&
    Date.parse(ui.pairing.expiresAt) > Date.now()
  ) {
    send({ type: "CHECK_PAIRING" }).catch(() => {});
  }
  if (ui.request?.outcome === "PENDING") {
    send({ type: "POLL_NOW" }).catch(() => {});
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  document.getElementById("version")!.textContent =
    `v${chrome.runtime.getManifest().version}`;
  document.getElementById("portal-icon")!.append(icon(I.ExternalLink, 13));
  document.getElementById("open-portal")!.addEventListener("click", () => {
    void chrome.tabs.create({ url: PORTAL_URL });
  });

  render(); // skeleton

  const stored = await chrome.storage.local.get([PAIRING_KEY, REQUEST_KEY]);
  ui.request = (stored[REQUEST_KEY] as RequestRecord | undefined) ?? null;
  ui.loaded = true;

  // Let the worker refresh/migrate the pairing (picks up a redeem that
  // happened while the popup was closed, the device name, or a revoke).
  let pairing = (stored[PAIRING_KEY] as PairingRecord | undefined) ?? null;
  if (pairing) {
    try {
      pairing = await send<PairingRecord | null>({ type: "CHECK_PAIRING" });
    } catch {
      // Offline: render what we have.
    }
  }
  ui.pairing = pairing;

  const needsCode =
    !pairing ||
    (pairing.status === "pending" &&
      Date.parse(pairing.expiresAt) <= Date.now() + 5_000);
  render();
  if (needsCode) void newCode();

  setInterval(heartbeat, FAST_POLL_MS);
  setInterval(() => tick?.(), 250);
}

void boot();
