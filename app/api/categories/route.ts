import { unstable_cache } from "next/cache";
import { listCategories } from "../../../lib/store";
import { securityErrorResponse } from "../../../lib/http-security";

const getCachedCategories = unstable_cache(
  () => listCategories(false),
  ["public-categories"],
  { revalidate: 300, tags: ["categories"] },
);

export async function GET() {
  try {
    return Response.json({ categories: await getCachedCategories() });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
