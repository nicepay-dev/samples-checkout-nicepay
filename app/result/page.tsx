import { Status, GatewayStatusResponse } from "@/lib/types";
import Link from "next/link";
import type { PayMethodCode } from "@/lib/types";
import { getTransactionStatus } from "@/lib/gateway";
import { readParam, parseAmount, normalizeAmount, buildNicepayTimestamp, buildMerchantToken, resolveStatus, statusUI } from "@/lib/utils";
import { getNicepayConfig } from "@/config/config";


export default async function ResultPage({
  searchParams,
}: Readonly<{
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const params = (await searchParams) ?? {};
  const reference = readParam(params.referenceNo);
  const tXid = readParam(params.tXid);
  const paymentStatus = readParam(params.status);
  const paymentMethod = readParam(params.payMethod) as PayMethodCode;
  const resultCd = readParam(params.resultCd);
  const resultMsg = readParam(params.resultMsg);
  const amountRaw = readParam(params.amt);
  const amount = parseAmount(amountRaw);
  const normalizedAmount = normalizeAmount(amountRaw);
  const currency = readParam(params.currency) ?? "IDR";

  let status: Status = resolveStatus(paymentMethod, paymentStatus);
  let message = resultMsg ?? "No gateway message was returned.";
  let verifiedTxId = tXid ?? "N/A";
  let verifiedReference = reference ?? tXid ?? "N/A";
  let verifiedAmount = amount;

  if (resultCd && resultCd !== "0000" && resultCd !== "1000") {
    status = "failed";
    message = `Payment failed with code ${resultCd}: ${resultMsg}`;
  } else if (tXid && reference && normalizedAmount) {
    try {
      const { iMid, merchantKey } = getNicepayConfig();
      const timeStamp = buildNicepayTimestamp();
      const merchantToken = buildMerchantToken(
        timeStamp,
        iMid,
        reference,
        normalizedAmount,
        merchantKey,
      );

      const inquiry = await getTransactionStatus({
        timeStamp,
        tXid,
        iMid,
        referenceNo: reference,
        amt: normalizedAmount,
        merchantToken,
      });

      const txMatches = !inquiry.tXid || inquiry.tXid === tXid;
      const refMatches = !inquiry.referenceNo || inquiry.referenceNo === reference;

      if (!txMatches || !refMatches) {
        console.warn("[payment-result] Transaction verification mismatch");
        status = "failed";
        message = "Transaction verification mismatch. Please contact support.";
      } else {
        status = resolveStatus(inquiry.payMethod,inquiry.status);
        console.info("[payment-result] NICEPAY transaction verified", { status });
        message = inquiry.resultMsg ?? "Transaction state verified with NICEPAY.";
        verifiedTxId = inquiry.tXid ?? tXid;
        verifiedReference = inquiry.referenceNo ?? reference;
        verifiedAmount = parseAmount(inquiry.amt) || amount;
      }
    } catch (error) {
      console.error("[payment-result] NICEPAY inquiry failed");
      status = "pending";
      message = error instanceof Error ? error.message : "Unable to verify payment status right now.";
    }
  } else {
    status = "pending";
    message = "We could not verify this transaction yet. Please refresh or contact support.";
  }

  const verified: GatewayStatusResponse = {
    reference: verifiedReference,
    status,
    amount: verifiedAmount,
    currency,
    message,
    tXid: verifiedTxId,
  };

  const ui = statusUI(verified.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-14">
      <section className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--background-elevated)] p-6 shadow-[var(--shadow-soft)]">
        <p className="text-sm font-semibold tracking-[0.2em] text-[var(--muted)]">PAYMENT RESULT</p>
        <h1 className={`mt-2 text-3xl font-bold ${ui.tone}`}>{ui.title}</h1>
        <p className="mt-2 text-[var(--muted)]">{ui.detail}</p>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-[#f7f9fc] p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-[var(--muted)]">Reference</p>
            <p className="text-lg font-semibold text-[var(--foreground)]">{verified.reference}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)]">Transaction ID</p>
            <p className="text-lg font-semibold text-[var(--foreground)]">{verified.tXid ?? "—"}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)]">Amount</p>
            <p className="text-lg font-semibold text-[var(--foreground)]">
              {verified.amount > 0
                ? new Intl.NumberFormat("id-ID", { style: "currency", currency: verified.currency || "IDR" }).format(verified.amount)
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-sm text-[var(--muted)]">Status</p>
            <p className="text-lg font-semibold text-[var(--foreground)]">{verified.status}</p>
          </div>
        </div>
      </section>

      <Link href="/" className="text-sm font-semibold text-[var(--brand)]">
        Back to catalog
      </Link>
    </main>
  );
}
