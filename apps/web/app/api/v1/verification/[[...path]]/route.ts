import { backendProxy } from "@/lib/backendProxy";

// Pending requests, approve (submit-proof), reject, and history (UC-004, MOD-6).
const handler = backendProxy("verification");

export const GET = handler;
export const POST = handler;
export const DELETE = handler; // API-039/040 history delete (FR-030)
