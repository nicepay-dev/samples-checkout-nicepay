import "server-only";

function failConfiguration(variable: string, reason: string, message: string): never {
  console.error("[config] Invalid environment configuration", { variable, reason });
  throw new Error(message);
}

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
    failConfiguration("STORE_URL", "invalid_url", "STORE_URL must be a valid absolute URL, e.g. https://your-store.vercel.app");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    failConfiguration("STORE_URL", "invalid_protocol", "STORE_URL must use http or https");
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
  if (!iMid) failConfiguration("NICEPAY_IMID", "missing", "NICEPAY_IMID is not configured in the deployment environment");
  if (!merchantKey) failConfiguration("NICEPAY_MERCHANT_KEY", "missing", "NICEPAY_MERCHANT_KEY is not configured in the deployment environment");
  if (!baseUrl) failConfiguration("NICEPAY_BASE_URL", "missing", "NICEPAY_BASE_URL is not configured in the deployment environment");
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    failConfiguration("NICEPAY_BASE_URL", "invalid_url", "NICEPAY_BASE_URL must be a valid absolute URL");
  }
  if (parsedBaseUrl.protocol !== "https:") {
    failConfiguration("NICEPAY_BASE_URL", "invalid_protocol", "NICEPAY_BASE_URL must use HTTPS");
  }
  return { iMid, merchantKey, baseUrl: parsedBaseUrl.origin };
}

export function getCartSigningSecret() {
  const secret = process.env.CART_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    failConfiguration(
      "CART_SIGNING_SECRET",
      secret ? "too_short" : "missing",
      "CART_SIGNING_SECRET must be configured with at least 32 characters",
    );
  }
  return secret;
}
