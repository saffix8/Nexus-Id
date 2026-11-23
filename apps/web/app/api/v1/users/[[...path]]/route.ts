import { backendProxy } from "@/lib/backendProxy";

const handler = backendProxy("users");

export const GET = handler;
export const PUT = handler;
