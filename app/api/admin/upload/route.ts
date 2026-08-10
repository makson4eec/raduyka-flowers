import { randomUUID } from "node:crypto";
import { getAuthorizedAdmin, unauthorizedResponse } from "../../../../lib/admin-auth";
import { getSupabaseServiceRoleClient } from "../../../../lib/firebase/supabase-admin";
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

const MAX_IMAGE_BYTES = 5 * 1_024 * 1_024;
const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 64 * 1_024;
const PRODUCT_IMAGES_BUCKET = "product-images";

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
      return noStoreJson(
        { error: "Фотография должна быть меньше 5 МБ." },
        { status: 400 },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const image = validateUploadedImage(bytes, file.type);
    if (!image) {
      return noStoreJson(
        {
          error:
            "Не удалось безопасно обработать файл. Экспортируйте изображение без EXIF/GPS в JPG, PNG или WebP и попробуйте снова.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseServiceRoleClient();
    if (!supabase) {
      return noStoreJson(
        { error: "Хранилище фотографий пока не настроено." },
        { status: 503 },
      );
    }

    const fileName = `${Date.now()}-${randomUUID()}.${image.extension}`;
    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(fileName, bytes, {
        cacheControl: "31536000",
        contentType: image.mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(fileName);

    return noStoreJson({ url: data.publicUrl }, { status: 201 });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
