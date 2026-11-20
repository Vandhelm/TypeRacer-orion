import { describe, expect, test } from "bun:test";
import { realtimeConfig } from "./main";

const SECRET = "realtime-secret-realtime-secret-12";

describe("TECH-06 — real-time server configuration", () => {
  test("defaults: port 3001, the local site as the only allowed origin", () => {
    expect(realtimeConfig({ REALTIME_SECRET: SECRET })).toEqual({ port: 3001, hostname: "::", secret: SECRET, allowedOrigins: ["http://localhost:3000"] });
  });

  test("REALTIME_PORT wins over PORT (Next.js uses PORT in dev), origins come from a comma list", () => {
    const config = realtimeConfig({ REALTIME_SECRET: SECRET, PORT: "8080", REALTIME_PORT: "4000", REALTIME_ALLOWED_ORIGINS: "https://vandhelm.com, https://www.vandhelm.com" });
    expect(config.port).toBe(4000);
    expect(realtimeConfig({ REALTIME_SECRET: SECRET, PORT: "8080" }).port).toBe(8080);
    expect(config.allowedOrigins).toEqual(["https://vandhelm.com", "https://www.vandhelm.com"]);
  });

  test("refuses to start without a secret or with a bad port", () => {
    expect(() => realtimeConfig({})).toThrow();
    expect(() => realtimeConfig({ REALTIME_SECRET: SECRET, REALTIME_PORT: "abc" })).toThrow();
    expect(() => realtimeConfig({ REALTIME_SECRET: SECRET, PORT: "70000" })).toThrow();
  });

  test("`bun run realtime` starts a server that answers its health check", async () => {
    const proc = Bun.spawn(["bun", "run", "realtime"], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, REALTIME_SECRET: SECRET, REALTIME_PORT: "0" },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const reader = proc.stdout.getReader();
      let out = "";
      while (!/:(\d+)/.test(out)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`server exited: ${await new Response(proc.stderr).text()}`);
        out += new TextDecoder().decode(value);
      }
      const port = out.match(/:(\d+)/)![1];
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
    } finally {
      proc.kill();
    }
  });

  test("an unreachable database does not stop the server: it keeps answering without room follow-up", async () => {
    const proc = Bun.spawn(["bun", "run", "realtime"], {
      cwd: `${import.meta.dir}/../..`,
      env: { ...process.env, REALTIME_SECRET: SECRET, REALTIME_PORT: "0", DATABASE_URL: "postgres://nobody:nothing@127.0.0.1:1/none" },
      stdout: "pipe",
      stderr: "pipe",
    });
    try {
      const reader = proc.stdout.getReader();
      let out = "";
      while (!/:(\d+)/.test(out)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`server exited: ${await new Response(proc.stderr).text()}`);
        out += new TextDecoder().decode(value);
      }
      const port = out.match(/:(\d+)/)![1];
      // Laisse le temps à la connexion d'écoute d'échouer.
      await Bun.sleep(1500);
      expect(proc.exitCode).toBeNull();
      const res = await fetch(`http://localhost:${port}/health`);
      expect(res.status).toBe(200);
    } finally {
      proc.kill();
    }
  });
});
