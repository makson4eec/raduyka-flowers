import { readdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const imagesDirectory = path.join(process.cwd(), "public", "images");
const files = (await readdir(imagesDirectory))
  .filter((file) => file.toLowerCase().endsWith(".png"));

await Promise.all(files.map(async (file) => {
  const source = path.join(imagesDirectory, file);
  const destination = path.join(imagesDirectory, file.replace(/\.png$/i, ".webp"));

  await sharp(source)
    .webp({ quality: 84, smartSubsample: true, effort: 6 })
    .toFile(destination);
}));

console.log(`Optimized ${files.length} images to WebP.`);
