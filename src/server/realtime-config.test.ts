// COURSE-06 / TECH-06 : en production, le serveur temps réel est obligatoire (source de vérité de la course).
import { describe, expect, test } from "bun:test";
import { realtimeReadiness, realtimeWarning } from "./realtime-config";

const PROD = { NODE_ENV: "production" };
const FULL = { REALTIME_PUBLIC_URL: "wss://orion-realtime.fly.dev", REALTIME_SECRET: "s".repeat(32) };

describe("COURSE-06 — the realtime server is required in production, and its absence is visible", () => {
  test("production without REALTIME_PUBLIC_URL nor REALTIME_SECRET: not configured, both named, a warning", () => {
    expect(realtimeReadiness(PROD)).toEqual({ required: true, configured: false, missing: ["REALTIME_PUBLIC_URL", "REALTIME_SECRET"] });
    expect(realtimeWarning(PROD)).toContain("REALTIME_PUBLIC_URL");
  });

  test("production with one of them missing still warns", () => {
    expect(realtimeReadiness({ ...PROD, REALTIME_PUBLIC_URL: FULL.REALTIME_PUBLIC_URL }).missing).toEqual(["REALTIME_SECRET"]);
    expect(realtimeWarning({ ...PROD, REALTIME_SECRET: FULL.REALTIME_SECRET })).toContain("REALTIME_PUBLIC_URL");
  });

  test("production fully set: configured, no warning", () => {
    expect(realtimeReadiness({ ...PROD, ...FULL })).toEqual({ required: true, configured: true, missing: [] });
    expect(realtimeWarning({ ...PROD, ...FULL })).toBeNull();
  });

  test("a Vercel production deploy counts as production", () => {
    expect(realtimeReadiness({ VERCEL_ENV: "production" }).required).toBe(true);
  });

  test("local development is not blocked nor warned (the local server runs on ws://localhost:3001)", () => {
    expect(realtimeReadiness({ NODE_ENV: "development" })).toMatchObject({ required: false });
    expect(realtimeWarning({ NODE_ENV: "development" })).toBeNull();
    expect(realtimeWarning({})).toBeNull();
  });
});
