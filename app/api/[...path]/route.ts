// Toutes les routes /api/* passent par le même code qu'avant (src/server/api.ts), sous Next.js.
import { handleApi } from "../../../src/server/api";

export const GET = handleApi;
export const POST = handleApi;
export const PUT = handleApi;
export const PATCH = handleApi;
export const DELETE = handleApi;
