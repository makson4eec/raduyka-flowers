import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import {
  assertMediaType,
  assertRequestSize,
  assertSameOriginMutation,
  consumeRequestRateLimit,
  noStoreJson,
  rateLimitHeaders,
  securityErrorResponse,
} from "../../../../lib/http-security";
import { validateUploadedImage } from "../../../../lib/image-upload";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1_024 * 1_024;
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 64 * 1_024;

export async function POST(request: Request) {
  if (!(await getAuthorizedAdmin())) return unauthorizedResponse();
  try {
    assertSameOriginMutation(request);
    assertMediaType(request, ["multipart/form-data"]);
    assertRequestSize(request, MAX_MULTIPART_BYTES);

    const rateLimit = consumeRequestRateLimit(
      request,
      "admin-image-upload",
      20,
      60 * 60_000,
    );
    if (!rateLimit.allowed) {
      return noStoreJson(
        { error: "Слишком много загрузок. Попробуйте позже." },
        { status: 429, headers: rateLimitHeaders(rateLimit) },
      );
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return noStoreJson({ error: "Выберите фотографию." }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
      return noStoreJson({ error: "Фотография должна быть меньше 8 МБ." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const image = validateUploadedImage(bytes, file.type);
    if (!image) {
      return noStoreJson(
        { error: "Не удалось безопасно обработать файл. Экспортируйте изображение без EXIF/GPS в JPG, PNG или WebP и попробуйте снова." },
        { status: 400 },
      );
    }

    const fileName = `${Date.now()}-${randomUUID()}.${image.extension}`;
    const uploads = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploads, { recursive: true });
    await writeFile(path.join(uploads, fileName), bytes, {
      flag: "wx",
      mode: 0o644,
    });
    return noStoreJson({ url: `/uploads/${fileName}` }, { status: 201 });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
