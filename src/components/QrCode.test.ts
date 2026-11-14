import { expect, test } from "bun:test";
import { QUIET_ZONE, qrPath } from "./QrCode";

const URL = "https://orion.example/room?code=CRABE7";

test("the quiet zone stays light and the finder pattern starts right after it", () => {
  const { size, path } = qrPath(URL);
  // version 3 (29 modules) + 2 × 4 de marge
  expect(size).toBe(29 + 2 * QUIET_ZONE);
  const modules = new Set(path.match(/M\d+ \d+/g));
  for (const m of modules) {
    const [x, y] = m.slice(1).split(" ").map(Number) as [number, number];
    expect(Math.min(x, y)).toBeGreaterThanOrEqual(QUIET_ZONE);
    expect(Math.max(x, y)).toBeLessThan(size - QUIET_ZONE);
  }
  // coin haut gauche du motif de repérage
  expect(modules.has(`M${QUIET_ZONE} ${QUIET_ZONE}`)).toBe(true);
});

test("a different code gives a different QR code", () => {
  expect(qrPath(URL).path).not.toBe(qrPath(URL.replace("CRABE7", "NAGE42")).path);
});
