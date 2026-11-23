import { backendProxy } from "@/lib/backendProxy";

// Device pairing (SRS FR-003, FR-032): claim a code, list and revoke browsers.
const handler = backendProxy("pairing");

export const GET = handler;
export const POST = handler;
export const DELETE = handler;
