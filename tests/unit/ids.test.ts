import { describe, expect, it } from "vitest";
import {
  formatTransferId,
  generateOwnerKey,
  generatePeerId,
  generateSalt,
  generateTransferId,
  isValidTransferId,
  normalizeTransferId,
  TRANSFER_ID_LENGTH,
} from "@/lib/ids";

describe("transfer ID generation", () => {
  it("generates IDs of the right length and alphabet", async () => {
    for (let i = 0; i < 50; i += 1) {
      const id = await generateTransferId();
      expect(id).toHaveLength(TRANSFER_ID_LENGTH);
      expect(isValidTransferId(id)).toBe(true);
    }
  });

  it("generates unique IDs", async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      ids.add(await generateTransferId());
    }
    expect(ids.size).toBe(200);
  });

  it("generates owner keys as 32-char hex", async () => {
    const key = await generateOwnerKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates salts as 32-char hex", async () => {
    const salt = await generateSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates peer IDs as 16-char hex", async () => {
    const peerId = await generatePeerId();
    expect(peerId).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("ID normalization", () => {
  it("uppercases and strips separators", () => {
    expect(normalizeTransferId("8k4x-2p9q-wm5t")).toBe("8K4X2P9QWM5T");
    expect(normalizeTransferId(" 8k4x_2p9q.wm5t ")).toBe("8K4X2P9QWM5T");
  });

  it("maps ambiguous characters (Crockford)", () => {
    expect(normalizeTransferId("IL O")).toBe("110");
    expect(normalizeTransferId("il-o")).toBe("110");
    expect(normalizeTransferId("U")).toBe("V");
  });

  it("rejects invalid IDs", () => {
    expect(isValidTransferId("SHORT")).toBe(false);
    expect(isValidTransferId("8K4X2P9QWM5!")).toBe(false);
    expect(isValidTransferId("")).toBe(false);
  });
});

describe("ID formatting", () => {
  it("formats in groups of four", () => {
    expect(formatTransferId("8K4X2P9QWM5T")).toBe("8K4X-2P9Q-WM5T");
    expect(formatTransferId("ABC")).toBe("ABC");
  });
});
