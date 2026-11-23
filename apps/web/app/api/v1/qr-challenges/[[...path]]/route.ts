import { backendProxy } from "@/lib/backendProxy";

// QR challenges (SRS API-025): the web stand-in for the phone redeems a
// scanned pairing code, signed with this browser's device key (FR-003).
const handler = backendProxy("qr-challenges");

export const POST = handler;
