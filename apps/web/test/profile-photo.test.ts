import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { profilePhoto } from "../src/lib/profile-photo";
describe("profile uploads", () => {
  it("re-encodes valid uploads into bounded square JPEGs", async () => {
    const bytes = await sharp({
      create: { width: 600, height: 300, channels: 3, background: "#3ecf8e" },
    })
      .png()
      .toBuffer();
    const data = await profilePhoto(
      new File([new Uint8Array(bytes)], "profile.png", { type: "image/png" }),
    );
    expect(data.startsWith("data:image/jpeg;base64,")).toBe(true);
    const metadata = await sharp(
      Buffer.from(data.split(",")[1]!, "base64"),
    ).metadata();
    expect(metadata).toMatchObject({ format: "jpeg", width: 256, height: 256 });
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects forged MIME types, active SVGs, corrupt images and excessive sizes", async () => {
    await expect(
      profilePhoto(
        new File(["<svg><script>alert(1)</script></svg>"], "x.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow("could not be read");
    await expect(
      profilePhoto(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" })),
    ).rejects.toThrow("Choose");
    await expect(
      profilePhoto(
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", {
          type: "image/png",
        }),
      ),
    ).rejects.toThrow("2 MB");
    await expect(profilePhoto("https://internal/image")).rejects.toThrow(
      "Choose",
    );
  });
});
