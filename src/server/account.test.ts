import { describe, expect, test } from "bun:test";
import { avatarType } from "./account";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("avatarType", () => {
  test("reconnaît JPEG, PNG et WebP à leurs premiers octets", () => {
    expect(avatarType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(avatarType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(avatarType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  test("refuse le reste, même annoncé comme une image", () => {
    expect(avatarType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(avatarType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(avatarType(bytes())).toBeNull();
  });
});
