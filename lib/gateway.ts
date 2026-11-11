import "server-only";
import { randomUUID } from "node:crypto";
import { buildCheckoutPayload } from "./payload";
import { NicepayRegistrationResponse, NicepayCheckoutResult, NicepayTransactionStatusPayload, NicepayTransactionStatusResponse } from "./types";
import { getCartLines } from "./cart";
import { getNicepayConfig } from "@/config/config";

function getGatewayUrls() {
  const { baseUrl } = getNicepayConfig();
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return {
    registrationUrl: `${normalizedBaseUrl}/redirect/v2/registration`,
    getStatusUrl: `${normalizedBaseUrl}/direct/v2/inquiry`,
  };
}

async function postToNicepay(operation: "registration" | "inquiry", url: string, payload: object) {
  const body = JSON.stringify(payload);
  const request = { requestId: randomUUID(), operation, method: "POST", path: new URL(url).pathname };
  const startedAt = performance.now();
  console.info("[nicepay] Sending request", request);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body,
    });
  } catch (error) {
    console.error("[nicepay] Request failed before receiving a response", {
      ...request,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }

  console.info("[nicepay] Received response", {
    ...request,
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
  });
  return response;
}

function normalizeRedirectUrl(response: NicepayRegistrationResponse) {
  const paymentUrl = response.paymentURL;
  const tXid = response.tXid;

  if (paymentUrl && tXid) {
    return `${paymentUrl}?tXid=${encodeURIComponent(tXid)}`;
  }

  return response.redirectUrl ?? response.url ?? null;
}

function parseRegistrationResponse(responseText: string) {
  try {
    return responseText ? (JSON.parse(responseText) as NicepayRegistrationResponse) : {};
  } catch {
    return { raw: responseText };
  }
}

export async function registerNicepayTransaction(lines: ReturnType<typeof getCartLines>): Promise<NicepayCheckoutResult> {
  const registrationPayload = await buildCheckoutPayload(lines);
  const { registrationUrl } = getGatewayUrls();

  const response = await postToNicepay("registration", registrationUrl, registrationPayload);

  const responseText = await response.text();
  const registrationResponse = parseRegistrationResponse(responseText);

  if (!response.ok) {
    console.error("[nicepay] Registration HTTP error", { status: response.status });
    throw new Error(
      typeof registrationResponse === "object" && registrationResponse && "resultMsg" in registrationResponse
        ? String(registrationResponse.resultMsg ?? "NICEPAY registration failed")
        : "NICEPAY registration failed",
    );
  }

  if ("raw" in registrationResponse) {
    console.error("[nicepay] Registration response was invalid JSON");
    throw new Error("Invalid JSON response from NICEPAY");
  }

  if (registrationResponse.resultCd !== "0000") {
    console.warn("[nicepay] Registration rejected");
    throw new Error(registrationResponse.resultMsg ?? "NICEPAY registration failed");
  }

  const redirectUrl = normalizeRedirectUrl(registrationResponse);
  if (!redirectUrl) {
    console.error("[nicepay] Registration response missing payment URL");
    throw new Error("NICEPAY response missing payment URL");
  }

  return {
    redirectUrl,
    referenceNo: registrationPayload.referenceNo,
    response: registrationResponse,
  };
}

function parseStatusResponse(responseText: string) {
  try {
    return responseText ? (JSON.parse(responseText) as NicepayTransactionStatusResponse) : {};
  } catch {
    return { raw: responseText };
  }
}

export async function getTransactionStatus(
  payload: NicepayTransactionStatusPayload,
): Promise<NicepayTransactionStatusResponse> {
  const { getStatusUrl } = getGatewayUrls();
  const response = await postToNicepay("inquiry", getStatusUrl, payload);

  const responseText = await response.text();
  const statusResponse = parseStatusResponse(responseText) as NicepayTransactionStatusResponse;

  if (!response.ok) {
    console.error("[nicepay] Inquiry HTTP error", { status: response.status });
    throw new Error(
      typeof statusResponse === "object" && statusResponse && "resultCd" in statusResponse && "resultMsg" in statusResponse
        ? String(statusResponse.resultMsg ?? "NICEPAY inquiry failed")
        : "NICEPAY inquiry failed",
    );
  }

  if ("raw" in statusResponse) {
    console.error("[nicepay] Inquiry response was invalid JSON");
    throw new Error("Invalid JSON response from NICEPAY");
  }

  return statusResponse;
}
