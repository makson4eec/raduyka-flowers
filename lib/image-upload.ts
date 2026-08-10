import "server-only";

export type ValidatedImage = {
  extension: "jpg" | "png" | "webp";
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
};

const MAX_IMAGE_DIMENSION = 10_000;
const MAX_IMAGE_PIXELS = 40_000_000;

function validDimensions(width: number, height: number) {
  return (
    Number.isSafeInteger(width)
    && Number.isSafeInteger(height)
    && width > 0
    && height > 0
    && width <= MAX_IMAGE_DIMENSION
    && height <= MAX_IMAGE_DIMENSION
    && width * height <= MAX_IMAGE_PIXELS
  );
}

function jpegDimensions(bytes: Buffer) {
  if (
    bytes.length < 4
    || bytes[0] !== 0xff
    || bytes[1] !== 0xd8
    || bytes[2] !== 0xff
    || bytes[bytes.length - 2] !== 0xff
    || bytes[bytes.length - 1] !== 0xd9
  ) {
    return null;
  }

  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;

    // EXIF/IPTC/comments can contain GPS or arbitrary embedded payloads.
    // Ask the administrator to export a clean image instead of persisting
    // metadata that the storefront never uses.
    if (
      (marker >= 0xe1 && marker <= 0xed)
      || marker === 0xef
      || marker === 0xfe
    ) {
      return null;
    }

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function validPngContainer(bytes: Buffer) {
  let offset = 8;
  let sawHeader = false;
  let sawImageData = false;
  const metadataChunks = new Set(["eXIf", "iTXt", "tEXt", "zTXt", "tIME"]);
  const criticalChunks = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (!Number.isSafeInteger(end) || end > bytes.length) return false;

    const type = bytes.toString("ascii", offset + 4, offset + 8);
    if (!sawHeader && type !== "IHDR") return false;
    if (metadataChunks.has(type)) return false;
    if (/^[A-Z]/.test(type) && !criticalChunks.has(type)) return false;

    if (type === "IHDR") {
      if (sawHeader || length !== 13) return false;
      sawHeader = true;
    } else if (type === "IDAT") {
      sawImageData = true;
    } else if (type === "IEND") {
      return length === 0 && sawHeader && sawImageData && end === bytes.length;
    }

    offset = end;
  }

  return false;
}

function pngDimensions(bytes: Buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (
    bytes.length < 33
    || !bytes.subarray(0, signature.length).equals(signature)
    || bytes.readUInt32BE(8) !== 13
    || bytes.toString("ascii", 12, 16) !== "IHDR"
    || !validPngContainer(bytes)
  ) {
    return null;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function webpDimensions(bytes: Buffer) {
  if (
    bytes.length < 30
    || bytes.toString("ascii", 0, 4) !== "RIFF"
    || bytes.toString("ascii", 8, 12) !== "WEBP"
    || bytes.readUInt32LE(4) + 8 !== bytes.length
  ) {
    return null;
  }

  let chunkOffset = 12;
  let hasImagePayload = false;
  while (chunkOffset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", chunkOffset, chunkOffset + 4);
    const length = bytes.readUInt32LE(chunkOffset + 4);
    const paddedLength = length + (length % 2);
    const end = chunkOffset + 8 + paddedLength;
    if (!Number.isSafeInteger(end) || end > bytes.length) return null;
    if (["EXIF", "XMP ", "ICCP"].includes(type)) return null;
    if (["VP8 ", "VP8L", "ANMF"].includes(type)) hasImagePayload = true;
    chunkOffset = end;
  }
  if (chunkOffset !== bytes.length || !hasImagePayload) return null;

  const chunk = bytes.toString("ascii", 12, 16);
  if (chunk === "VP8X") {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }

  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    return {
      width: 1 + b0 + ((b1 & 0x3f) << 8),
      height: 1 + (b1 >> 6) + (b2 << 2) + ((b3 & 0x0f) << 10),
    };
  }

  if (
    chunk === "VP8 "
    && bytes[23] === 0x9d
    && bytes[24] === 0x01
    && bytes[25] === 0x2a
  ) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }

  return null;
}

export function validateUploadedImage(
  bytes: Buffer,
  declaredMimeType: string,
): ValidatedImage | null {
  const candidates = [
    {
      extension: "jpg" as const,
      mimeType: "image/jpeg" as const,
      dimensions: jpegDimensions(bytes),
    },
    {
      extension: "png" as const,
      mimeType: "image/png" as const,
      dimensions: pngDimensions(bytes),
    },
    {
      extension: "webp" as const,
      mimeType: "image/webp" as const,
      dimensions: webpDimensions(bytes),
    },
  ];

  const detected = candidates.find((candidate) => candidate.dimensions);
  if (
    !detected
    || detected.mimeType !== declaredMimeType.toLowerCase()
    || !validDimensions(
      detected.dimensions!.width,
      detected.dimensions!.height,
    )
  ) {
    return null;
  }

  return {
    extension: detected.extension,
    mimeType: detected.mimeType,
    width: detected.dimensions!.width,
    height: detected.dimensions!.height,
  };
}
