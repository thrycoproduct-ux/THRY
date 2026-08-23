/**
 * Recover unpaid Razorpay orders that are already paid/captured on Razorpay.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/recover-unpaid-razorpay-orders.ts
 *   npx tsx --env-file=.env.local scripts/recover-unpaid-razorpay-orders.ts --order=p2va6llqmkm2mnqdnnhhgj0b
 */
import { recoverUnpaidRazorpayOrders } from "../src/lib/payments/recover-unpaid-razorpay-orders";

async function main() {
  const orderArgs = process.argv
    .filter((arg) => arg.startsWith("--order="))
    .map((arg) => arg.slice("--order=".length).trim())
    .filter(Boolean);

  const result = await recoverUnpaidRazorpayOrders({
    lookbackDays: 21,
    limit: 50,
    orderIds: orderArgs.length > 0 ? orderArgs : undefined,
  });

  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
