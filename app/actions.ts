"use server";

import { buildSignedCartCookie, CART_COOKIE_NAME, getProductById, readCartFromCookie } from "@/lib/cart";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

export async function addToCartAction(formData: FormData) {
  const productIdValue = formData.get("productId");
  const productId = typeof productIdValue === "string" ? productIdValue : "";
  const quantity = Number(formData.get("quantity") ?? 1);
  const safeQuantity = Number.isFinite(quantity)
    ? Math.max(1, Math.floor(quantity))
    : 1;

  const product = getProductById(productId);
  if (!product) {
    console.warn("[cart] Add to cart rejected", { reason: "unknown_product" });
    return { success: false as const };
  }

  let stage = "read_cookie";
  try {
    const cookieStore = await cookies();
    const existingCart = readCartFromCookie(cookieStore.get(CART_COOKIE_NAME)?.value);

    const nextItems = [...existingCart.items];
    const existing = nextItems.find((item) => item.productId === productId);
    if (existing) {
      existing.quantity += safeQuantity;
    } else {
      nextItems.push({ productId, quantity: safeQuantity });
    }

    stage = "sign_cookie";
    const signedCookie = buildSignedCartCookie({ items: nextItems });
    stage = "write_cookie";
    cookieStore.set(CART_COOKIE_NAME, signedCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_WEEK_SECONDS,
    });

    stage = "revalidate_pages";
    revalidatePath("/", "page");
    revalidatePath("/cart", "page");
  } catch (error) {
    console.error("[cart] Add to cart failed", { stage, productId: product.id });
    throw error;
  }

  console.info("[cart] Product added", { productId: product.id });

  return {
    success: true as const,
    productName: product.name,
  };
}
