import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "@/lib/sanitize";

describe("sanitizeFileName", () => {
  it("keeps legitimate filenames", () => {
    expect(sanitizeFileName("report.pdf")).toBe("report.pdf");
    expect(sanitizeFileName("my photos 2024.zip")).toBe("my photos 2024.zip");
    expect(sanitizeFileName("naïve-file.txt")).toBe("naïve-file.txt");
  });

  it("strips path separators (path traversal)", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeFileName("..\\windows\\system32")).toBe("_windows_system32");
    expect(sanitizeFileName("a/b/c.txt")).toBe("a_b_c.txt");
  });

  it("handles Windows drive prefixes", () => {
    expect(sanitizeFileName("C:/evil.exe")).toBe("C__evil.exe");
  });

  it("strips leading dots and control characters", () => {
    expect(sanitizeFileName(".hidden")).toBe("hidden");
    expect(sanitizeFileName("...hidden")).toBe("hidden");
    expect(sanitizeFileName("bad\u0000name.txt")).toBe("badname.txt");
    expect(sanitizeFileName("bad\u001fname.txt")).toBe("badname.txt");
  });

  it("bounds length and never returns empty", () => {
    expect(sanitizeFileName("")).toBe("file");
    // Separators become underscores, so "///" survives as underscores.
    expect(sanitizeFileName("///")).toBe("___");
    const long = "a".repeat(500) + ".txt";
    expect(sanitizeFileName(long)).toHaveLength(200);
  });
});
