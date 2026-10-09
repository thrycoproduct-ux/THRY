import { releaseStockReservation } from "../src/lib/orders/stock-reservation";

const orderId = process.argv[2] ?? "mgvxaraiztv7rh5icfgp56bx";

async function main() {
  const result = await releaseStockReservation(orderId, "reservation_expired", {
    allowOrphanFallback: true,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exitCode = 1;
});
