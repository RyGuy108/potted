import sharp from "sharp";
/** Decode, bound and re-encode uploads; original bytes and metadata are never published. */
export async function profilePhoto(
  file: FormDataEntryValue | null,
): Promise<string> {
  if (
    !(file instanceof File) ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    !file.size ||
    file.size > 2 * 1024 * 1024
  )
    throw new Error("Choose a JPG, PNG or WebP image up to 2 MB.");
  try {
    const image = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 20_000_000,
      animated: false,
    });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? ""))
      throw new Error();
    const output = await image
      .rotate()
      .resize(256, 256, { fit: "cover" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${output.toString("base64")}`;
  } catch {
    throw new Error(
      "This image could not be read. Try another JPG, PNG or WebP.",
    );
  }
}
