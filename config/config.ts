import "server-only";

/** Resolve absolute callback URLs for local, Vercel Preview, and Production deployments.
 * STORE_URL takes precedence so a stable custom domain can be configured explicitly.
 */
export function resolveStoreUrls() {
  const configuredBaseUrl =
    process.env.STORE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredBaseUrl);
  } catch {
    throw new Error("STORE_URL must be a valid absolute URL, e.g. https://your-store.vercel.app");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("STORE_URL must use http or https");
  }

  const normalizedBaseUrl = parsedUrl.origin;
  return {
    storeUrl: normalizedBaseUrl,
    callBackUrl: `${normalizedBaseUrl}/checkout-return`,
    dbProcessUrl: `${normalizedBaseUrl}/api/webhook`,
  };
}

export function getNicepayConfig() {
  const iMid = process.env.NICEPAY_IMID?.trim();
  const merchantKey = process.env.NICEPAY_MERCHANT_KEY?.trim();
  const baseUrl = process.env.NICEPAY_BASE_URL?.trim();
  if (!iMid) throw new Error("NICEPAY_IMID is not configured in the deployment environment");
  if (!merchantKey) throw new Error("NICEPAY_MERCHANT_KEY is not configured in the deployment environment");
  if (!baseUrl) throw new Error("NICEPAY_BASE_URL is not configured in the deployment environment");
  let parsedBaseUrl: URL;
  try { parsedBaseUrl = new URL(baseUrl); } catch { throw new Error("NICEPAY_BASE_URL must be a valid absolute URL"); }
  if (parsedBaseUrl.protocol !== "https:") throw new Error("NICEPAY_BASE_URL must use HTTPS");
  return { iMid, merchantKey, baseUrl: parsedBaseUrl.origin };
}

export function getCartSigningSecret() {
  const secret = process.env.CART_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("CART_SIGNING_SECRET must be configured with at least 32 characters");
  }
  return secret;
}
