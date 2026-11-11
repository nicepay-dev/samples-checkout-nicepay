"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { registerNicepayTransaction } from "@/lib/gateway";
import { getProductById, readCartFromCookie, CART_COOKIE_NAME, buildSignedCartCookie, getCartLines } from "@/lib/cart";

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

export type CheckoutActionState = {
  error: string | null;
};

export async function updateCartQuantityAction(formData: FormData) {
  const productIdValue = formData.get("productId");
  const productId = typeof productIdValue === "string" ? productIdValue : "";
  const deltaValue = formData.get("delta");
  const delta = typeof deltaValue === "string" ? Number(deltaValue) : 0;

  if (!getProductById(productId) || !Number.isFinite(delta)) {
    console.warn("[cart] Quantity update rejected", { reason: "invalid_input" });
    redirect("/cart");
  }

  const cookieStore = await cookies();
  const existingCart = readCartFromCookie(cookieStore.get(CART_COOKIE_NAME)?.value);
  const nextItems = [...existingCart.items];
  const existing = nextItems.find((item) => item.productId === productId);

  if (existing) {
    existing.quantity += delta;
    if (existing.quantity <= 0) {
      const filteredItems = nextItems.filter((item) => item.productId !== productId);
      cookieStore.set(CART_COOKIE_NAME, buildSignedCartCookie({ items: filteredItems }), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ONE_WEEK_SECONDS,
      });

      console.info("[cart] Product removed", { productId });
      redirect("/cart");
    }
  } else if (delta > 0) {
    nextItems.push({ productId, quantity: delta });
  }

  cookieStore.set(CART_COOKIE_NAME, buildSignedCartCookie({ items: nextItems }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
  });

  console.info("[cart] Quantity update completed", { productId });
  redirect("/cart");
}

export async function checkoutAction(state: CheckoutActionState): Promise<CheckoutActionState> {
  const previousError = state.error;

  const cookieStore = await cookies();
  const cart = readCartFromCookie(cookieStore.get(CART_COOKIE_NAME)?.value);
  const lines = getCartLines(cart);

  if (lines.length === 0) {
    console.info("[checkout] Checkout skipped", { reason: "empty_cart" });
    return { error: "Your cart is empty." };
  }

  let checkoutResult;
  try {
    checkoutResult = await registerNicepayTransaction(lines);
  } catch (error) {
    console.error("[checkout] NICEPAY registration failed");
    return { error: error instanceof Error ? error.message : previousError ?? "Checkout failed" };
  }

  cookieStore.delete(CART_COOKIE_NAME);
  revalidatePath("/cart", "page");

  console.info("[checkout] Redirecting to NICEPAY");
  redirect(checkoutResult.redirectUrl);
}
