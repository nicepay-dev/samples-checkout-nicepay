import { SELLERS } from "./data/sellers";
import { CUSTOMER } from "./data/customer";
import { NicepayRegistrationPayload } from "./types";
import { getNicepayConfig, resolveStoreUrls } from "@/config/config";
import { headers } from "next/headers";
import { getCartLines } from "./cart";
import type { CartLine } from "./types";
import { buildNicepayTimestamp, buildMerchantToken } from "./utils";


function buildCartData(lines: ReturnType<typeof getCartLines>, storeUrl: string) {
  return JSON.stringify({
    count: String(lines.length),
    item: lines.map((line) => ({
      img_url: line.product.imageSrc ? new URL(line.product.imageSrc, storeUrl).toString() : "",
      goods_name: line.product.name,
      goods_detail: line.product.name,
      goods_amt: String(line.product.price),
      goods_quantity: String(line.quantity),
    })),
  });
}

function buildCustomerAndDeliveryData() {
  return {
    billingNm: CUSTOMER.name,
    billingPhone: CUSTOMER.phone,
    billingEmail: CUSTOMER.email,
    billingAddr: CUSTOMER.billingAddress.address,
    billingCity: CUSTOMER.billingAddress.city,
    billingState: CUSTOMER.billingAddress.state,
    billingPostCd: CUSTOMER.billingAddress.postCode,
    billingCountry: CUSTOMER.billingAddress.country,
    deliveryNm: CUSTOMER.name,
    deliveryPhone: CUSTOMER.phone,
    deliveryAddr: CUSTOMER.deliveryAddress.address,
    deliveryCity: CUSTOMER.deliveryAddress.city,
    deliveryState: CUSTOMER.deliveryAddress.state,
    deliveryPostCd: CUSTOMER.deliveryAddress.postCode,
    deliveryCountry: CUSTOMER.deliveryAddress.country,
  };
}

export async function buildCheckoutPayload(
  lines: CartLine[],
): Promise<NicepayRegistrationPayload> {
  const { iMid, merchantKey } = getNicepayConfig();
  const timestamp = buildNicepayTimestamp();
  const amount = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const referenceNo = `NICEPAY-SHOP-${Date.now()}`;
  const { storeUrl, callBackUrl, dbProcessUrl } = resolveStoreUrls();
  const goodsName =
    lines.map((line) => line.product.name).join(", ") || "Cart items";
  const cartData = buildCartData(lines, storeUrl);
  const sellers = JSON.stringify(SELLERS);
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const userIP = forwardedFor?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "127.0.0.1";
  const merchantToken = buildMerchantToken(
    timestamp,
    iMid,
    referenceNo,
    amount,
    merchantKey,
  );

  return {
    timeStamp: timestamp,
    iMid,
    payMethod: "00",
    currency: "IDR",
    amt: String(amount),
    referenceNo: referenceNo,
    callBackUrl: callBackUrl,
    dbProcessUrl: dbProcessUrl,
    goodsNm: goodsName,
    ...buildCustomerAndDeliveryData(),
    description: `Order ${referenceNo}`,
    merchantToken: merchantToken,
    userIP,
    cartData: cartData,
    sellers: sellers,
    mitraCd: "",
    msId: "",
    msFee: "",
    msFeeType: "",
    escrowCl: "",
  };
}
