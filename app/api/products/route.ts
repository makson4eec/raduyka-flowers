import { unstable_cache } from "next/cache";
import { listProducts } from "../../../lib/store";
import { securityErrorResponse } from "../../../lib/http-security";

const getCachedProducts = unstable_cache(
  () => listProducts(false),
  ["public-products"],
  { revalidate: 300, tags: ["products"] },
);

export async function GET() {
  try {
    return Response.json({ products: await getCachedProducts() });
  } catch (error) {
    return securityErrorResponse(error);
  }
}
