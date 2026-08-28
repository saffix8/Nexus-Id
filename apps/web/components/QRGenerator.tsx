'use client';

import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react';
import { QRCodeCanvas } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SDJWTCredential } from '@nexusid/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QRGeneratorProps {
  credential: SDJWTCredential;
  isOpen: boolean;
  onClose: () => void;
}

interface QRPayload {
  v: 1;
  iss: string;
  sd_jwt: string;
  disclosures: string[];
  iat: number;
  exp: number;
}

type DurationMinutes = 5 | 15 | 30 | 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64urlEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function buildQRPayload(
  credential: SDJWTCredential,
  selectedDisclosures: string[],
  durationMinutes: DurationMinutes
): { encoded: string; exp: number } {
  const iat = Date.now();
  const exp = iat + durationMinutes * 60 * 1000;

  const payload: QRPayload = {
    v: 1,
    iss: credential.issuer,
    sd_jwt: credential.sd_jwt,
    disclosures: selectedDisclosures,
    iat,
    exp,
  };

  const encoded = base64urlEncode(JSON.stringify(payload));
  return { encoded, exp };
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function decodeDisclosure(disclosure: string): { field: string; value: unknown } | null {
  try {
    const json = atob(disclosure.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json) as [string, string, unknown];
    return { field: parsed[1], value: parsed[2] };
  } catch {
    return null;
  }
}

// Maps field name → human label. Falls back to the field name itself.
function fieldLabel(credential: SDJWTCredential, field: string): string {
  return credential.metadata?.field_labels?.[field] ?? field.replace(/_/g, ' ');
}

// Maps field name → its decoded value from disclosures.
function buildFieldValueMap(credential: SDJWTCredential): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const d of credential.disclosures) {
    const decoded = decodeDisclosure(d);
    if (decoded) map[decoded.field] = decoded.value;
  }
  return map;
}

// ─── Duration Selector ────────────────────────────────────────────────────────

const DURATIONS: { label: string; value: DurationMinutes }[] = [
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export function QRGenerator({ credential, isOpen, onClose }: QRGeneratorProps) {
  const selectableFields = credential.metadata?.selectively_disclosable_fields ?? [];
  const alwaysVisibleFields = credential.metadata?.always_visible_fields ?? [];

  // Which selectively-disclosable fields to include. Default: none selected.
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState<DurationMinutes>(15);
  const [qrData, setQrData] = useState<{ encoded: string; exp: number } | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  const fieldValues = useMemo(() => buildFieldValueMap(credential), [credential]);

  // Build the disclosures array from checked fields + always-visible disclosures.
  const selectedDisclosures = useMemo<string[]>(() => {
    return credential.disclosures.filter((d) => {
      const decoded = decodeDisclosure(d);
      if (!decoded) return false;
      return (
        alwaysVisibleFields.includes(decoded.field) ||
        checkedFields.has(decoded.field)
      );
    });
  }, [credential.disclosures, checkedFields, alwaysVisibleFields]);

  // Regenerate QR.
  const generate = useCallback(() => {
    const result = buildQRPayload(credential, selectedDisclosures, duration);
    setQrData(result);
    setNow(Date.now());
  }, [credential, selectedDisclosures, duration]);

  // Auto-generate when fields or duration change.
  useEffect(() => {
    if (isOpen) generate();
  }, [isOpen, selectedDisclosures, duration, generate]);

  // Countdown ticker.
  useEffect(() => {
    if (!isOpen || !qrData) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      // Auto-regenerate on expiry.
      if (current >= qrData.exp) generate();
    }, 1000);
    return () => clearInterval(id);
  }, [isOpen, qrData, generate]);

  // Reset state when modal closes.
  useEffect(() => {
    if (!isOpen) {
      setCheckedFields(new Set());
      setDuration(15);
      setQrData(null);
    }
  }, [isOpen]);

  const isExpired = qrData ? now >= qrData.exp : false;
  const remainingMs = qrData ? Math.max(0, qrData.exp - now) : 0;
  const countdown = formatCountdown(remainingMs);

  // Download QR as PNG.
  const qrCanvasRef = useRef<HTMLDivElement>(null);

  function handleDownload() {
    const canvas = qrCanvasRef.current?.querySelector('canvas');
    if (!canvas) return;

    // Add padding + label to a fresh canvas.
    const padding = 20;
    const labelHeight = 28;
    const out = document.createElement('canvas');
    out.width = canvas.width + padding * 2;
    out.height = canvas.height + padding * 2 + labelHeight;

    const ctx = out.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#0C0E13';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(canvas, padding, padding);

    ctx.fillStyle = '#8B92A8';
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'NexusID Offline Verification',
      out.width / 2,
      canvas.height + padding + labelHeight - 6
    );

    const link = document.createElement('a');
    link.download = `nexusid-qr-${credential.type}-${Date.now()}.png`;
    link.href = out.toDataURL('image/png');
    link.click();
  }

  function toggleField(field: string) {
    setCheckedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-50">
      {/* Backdrop */}
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-black/70 backdrop-blur-sm data-[closed]:opacity-0 transition-opacity duration-200"
      />

      {/* Panel */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          transition
          className="
            relative w-full max-w-xl max-h-[90vh] overflow-y-auto
            bg-[#13161E] border border-[#252C3D] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.6)]
            data-[closed]:opacity-0 data-[closed]:scale-95
            transition-all duration-200
          "
        >
          {/* ── Header ──────────────────────────────────────────── */}
          <div className="flex items-start justify-between p-6 pb-0">
            <div>
              <h2 className="text-lg font-semibold text-[#EEF0F6]" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                Offline Verification QR
              </h2>
              <p className="mt-1 text-sm text-[#8B92A8]">
                Show this QR code to verify your credential without internet
              </p>
            </div>
            <button
              onClick={onClose}
              className="
                ml-4 w-8 h-8 flex items-center justify-center rounded-md
                text-[#525A72] hover:text-[#EEF0F6] hover:bg-[#1A1E28]
                transition-colors duration-150 focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-[#3B6FE8]
              "
              aria-label="Close"
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* ── QR Section ──────────────────────────────────────── */}
          <div className="px-6 pt-5 pb-4 flex flex-col items-center gap-3">
            {/* QR Canvas */}
            <div
              ref={qrCanvasRef}
              className={`
                relative p-4 rounded-xl
                ${isExpired
                  ? 'bg-[#250F0F] border border-[#4A1515]'
                  : 'bg-white border border-[#1E2330]'
                }
              `}
            >
              {qrData && (
                <QRCodeCanvas
                  value={qrData.encoded}
                  size={252}
                  level="M"
                  bgColor={isExpired ? '#250F0F' : '#ffffff'}
                  fgColor={isExpired ? '#4A1515' : '#0C0E13'}
                  includeMargin={false}
                />
              )}

              {/* Expired overlay */}
              {isExpired && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-[#250F0F]/90">
                  <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-[#EF4444] mb-2">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M12 7v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <p className="text-sm font-medium text-[#EF4444]">QR Expired</p>
                  <p className="text-xs text-[#8B92A8] mt-0.5">Regenerating…</p>
                </div>
              )}
            </div>

            {/* Countdown */}
            <div className={`
              flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-mono
              ${remainingMs < 60_000 && !isExpired
                ? 'bg-[#261D07] border-[#4D3A0E] text-[#F59E0B]'
                : isExpired
                  ? 'bg-[#250F0F] border-[#4A1515] text-[#EF4444]'
                  : 'bg-[#0A0C10] border-[#1E2330] text-[#8B92A8]'
              }
            `}>
              <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 shrink-0">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.25" />
                <path d="M8 5v3.5l2 1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {isExpired ? 'Expired' : `Expires in ${countdown}`}
            </div>

            {/* Expired warning banner */}
            {isExpired && (
              <div className="w-full flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#250F0F] border border-[#4A1515]">
                <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-[#EF4444] shrink-0">
                  <path d="M8 2L14 13H2L8 2z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                  <path d="M8 6.5v3M8 11v.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
                </svg>
                <p className="text-xs text-[#EF4444]">
                  This QR code has expired. It will regenerate automatically with the same settings.
                </p>
              </div>
            )}
          </div>

          {/* ── Divider ─────────────────────────────────────────── */}
          <div className="mx-6 h-px bg-[#1E2330]" />

          {/* ── Field Selector ───────────────────────────────────── */}
          <div className="px-6 py-4 space-y-3">
            <div>
              <p className="text-xs font-mono text-[#525A72] tracking-wider uppercase mb-3">
                Fields to include
              </p>

              {/* Always-visible fields — greyed out, always checked */}
              {alwaysVisibleFields.length > 0 && (
                <div className="space-y-2 mb-3">
                  {alwaysVisibleFields.map((field) => (
                    <label
                      key={field}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-[#0A0C10] border border-[#1E2330] cursor-not-allowed opacity-60"
                    >
                      <span className="flex-shrink-0 w-4 h-4 rounded border border-[#3A4560] bg-[#3B6FE8]/20 flex items-center justify-center">
                        <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
                          <path d="M2 5l2.5 2.5L8 3" stroke="#3B6FE8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-[#8B92A8] capitalize">
                          {fieldLabel(credential, field)}
                        </span>
                        <span className="ml-2 text-xs text-[#525A72] font-mono">
                          {String(fieldValues[field] ?? '—')}
                        </span>
                      </span>
                      <span className="text-xs text-[#525A72] font-mono tracking-wide">always on</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Selectively disclosable fields */}
              {selectableFields.length > 0 ? (
                <div className="space-y-2">
                  {selectableFields.map((field) => {
                    const checked = checkedFields.has(field);
                    return (
                      <label
                        key={field}
                        className={`
                          flex items-center gap-3 py-2 px-3 rounded-lg border cursor-pointer
                          transition-all duration-150
                          ${checked
                            ? 'bg-[#3B6FE8]/5 border-[#3B6FE8]/30 hover:bg-[#3B6FE8]/8'
                            : 'bg-[#0A0C10] border-[#1E2330] hover:border-[#252C3D] hover:bg-[#13161E]'
                          }
                        `}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          onChange={() => toggleField(field)}
                        />
                        <span className={`
                          flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center
                          transition-all duration-150
                          ${checked
                            ? 'bg-[#3B6FE8] border-[#3B6FE8]'
                            : 'bg-transparent border-[#3A4560]'
                          }
                        `}>
                          {checked && (
                            <svg viewBox="0 0 10 10" fill="none" className="w-2.5 h-2.5">
                              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`text-sm capitalize transition-colors duration-150 ${checked ? 'text-[#EEF0F6]' : 'text-[#8B92A8]'}`}>
                            {fieldLabel(credential, field)}
                          </span>
                          <span className="ml-2 text-xs text-[#525A72] font-mono truncate">
                            {String(fieldValues[field] ?? '—')}
                          </span>
                        </span>
                        {!checked && (
                          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5 text-[#525A72] shrink-0">
                            <rect x="3" y="6" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
                            <path d="M5 6V4.5a3 3 0 016 0V6" stroke="currentColor" strokeWidth="1.25" />
                          </svg>
                        )}
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-[#525A72] py-2">
                  No selectively disclosable fields on this credential.
                </p>
              )}
            </div>
          </div>

          {/* ── Divider ─────────────────────────────────────────── */}
          <div className="mx-6 h-px bg-[#1E2330]" />

          {/* ── Duration Selector ────────────────────────────────── */}
          <div className="px-6 py-4">
            <p className="text-xs font-mono text-[#525A72] tracking-wider uppercase mb-3">
              Valid for
            </p>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`
                    flex-1 py-2 text-sm rounded-md border font-medium
                    transition-all duration-150 focus-visible:outline-none
                    focus-visible:ring-2 focus-visible:ring-[#3B6FE8]
                    ${duration === d.value
                      ? 'bg-[#3B6FE8]/10 border-[#3B6FE8]/40 text-[#3B6FE8]'
                      : 'bg-transparent border-[#252C3D] text-[#8B92A8] hover:border-[#3A4560] hover:text-[#EEF0F6]'
                    }
                  `}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Footer Actions ───────────────────────────────────── */}
          <div className="px-6 pb-6 pt-2 flex gap-3">
            <button
              onClick={generate}
              className="
                flex items-center justify-center gap-2 flex-1 h-10
                bg-transparent border border-[#252C3D] rounded-md
                text-sm font-medium text-[#EEF0F6]
                hover:bg-[#1A1E28] hover:border-[#3A4560]
                transition-all duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FE8]
              "
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                <path
                  d="M13.5 2.5A6 6 0 1 0 14 9"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
                <path d="M14 2.5v4h-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Regenerate
            </button>

            <button
              onClick={handleDownload}
              disabled={!qrData || isExpired}
              className="
                flex items-center justify-center gap-2 flex-1 h-10
                bg-[#3B6FE8] rounded-md
                text-sm font-medium text-white
                hover:bg-[#4A7EF7] active:bg-[#2D5FD9]
                disabled:opacity-40 disabled:pointer-events-none
                transition-all duration-150 shadow-sm
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B6FE8] focus-visible:ring-offset-2 focus-visible:ring-offset-[#13161E]
              "
            >
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4">
                <path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12h12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
              Download QR
            </button>
          </div>

          {/* ── Trust disclaimer ─────────────────────────────────── */}
          <div className="px-6 pb-5">
            <p className="text-xs text-[#525A72] text-center leading-relaxed">
              QR codes are for low-trust offline use only. No key binding signature is
              included — for high-assurance verification, use the mobile app approval flow.
            </p>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
