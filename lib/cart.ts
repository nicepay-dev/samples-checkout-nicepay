import "server-only";

import { createHmac } from "node:crypto";
import { PRODUCTS } from "./data/products";
import { Cart, CartLine } from "./types";
import { getCartSigningSecret } from "@/config/config";

export const CART_COOKIE_NAME = "nicepay_shop_cart";

export function getProductById(productId: string) {
  return PRODUCTS.find((product) => product.id === productId);
}

function cartFallback(): Cart {
  return { items: [] };
}

function sign(value: string) {
  return createHmac("sha256", getCartSigningSecret()).update(value).digest("base64url");
}

function toBase64Url(input: string) {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function buildSignedCartCookie(cart: Cart) {
  const normalized: Cart = {
    items: cart.items
      .filter((item) => getProductById(item.productId))
      .map((item) => ({
        productId: item.productId,
        quantity: Math.max(1, Math.floor(item.quantity)),
      })),
  };

  // Deliberate demo simplification: we keep cart state in a signed cookie so readers can understand
  // the complete flow without adding a database or client-side state management.
  const payload = toBase64Url(JSON.stringify(normalized));
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function readCartFromCookie(cookieValue?: string): Cart {
  if (!cookieValue) {
    return cartFallback();
  }

  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature || sign(payload) !== signature) {
    return cartFallback();
  }

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as Cart;
    if (!parsed || !Array.isArray(parsed.items)) {
      return cartFallback();
    }

    return {
      items: parsed.items
        .filter(
          (item) =>
            typeof item?.productId === "string" &&
            Number.isFinite(item?.quantity) &&
            getProductById(item.productId),
        )
        .map((item) => ({
          productId: item.productId,
          quantity: Math.max(1, Math.floor(item.quantity)),
        })),
    };
  } catch {
    return cartFallback();
  }
}

export function getCartLines(cart: Cart): CartLine[] {
  return cart.items
    .map((item) => {
      const product = getProductById(item.productId);
      if (!product) {
        return null;
      }

      return {
        product,
        quantity: item.quantity,
        lineTotal: product.price * item.quantity,
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
}

export function formatIdr(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}