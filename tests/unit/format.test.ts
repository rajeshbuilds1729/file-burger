import { describe, expect, it } from "vitest";
import { fileBaseName, fileExtension, formatBytes, formatDuration, formatSpeed } from "@/lib/format";

describe("formatBytes", () => {
  it("formats bytes in human units", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(12.4 * 1024 * 1024)).toBe("12.4 MB");
    expect(formatBytes(840 * 1024 * 1024)).toBe("840.0 MB");
    expect(formatBytes(8)).toBe("8 B");
  });

  it("handles invalid input", () => {
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("formats mm:ss and hh:mm:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(9)).toBe("00:09");
    expect(formatDuration(65)).toBe("01:05");
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("handles invalid input", () => {
    expect(formatDuration(-3)).toBe("—");
    expect(formatDuration(Infinity)).toBe("—");
  });
});

describe("formatSpeed", () => {
  it("formats bytes/second", () => {
    expect(formatSpeed(18.4 * 1024 * 1024)).toBe("18.4 MB/s");
    expect(formatSpeed(0)).toBe("—");
    expect(formatSpeed(-1)).toBe("—");
  });
});

describe("fileExtension / fileBaseName", () => {
  it("extracts extensions", () => {
    expect(fileExtension("photo.jpg")).toBe("jpg");
    expect(fileExtension("ARCHIVE.TAR.GZ")).toBe("gz");
    expect(fileExtension("noextension")).toBe("");
    expect(fileExtension(".dotfile")).toBe("");
    expect(fileExtension("weird.")).toBe("");
  });

  it("extracts base names", () => {
    expect(fileBaseName("photo.jpg")).toBe("photo");
    expect(fileBaseName("noextension")).toBe("noextension");
    expect(fileBaseName(".dotfile")).toBe(".dotfile");
  });
});
