import React from "react";
import { ORDER_RETURNS } from "@/lib/storefront/order-shipping";

type Props = {};

function ShipReturns({}: Props) {
  return (
    <div>
      Shipping & Returns. {ORDER_RETURNS.short} Learn more on our Shipping &amp;
      Returns page.
    </div>
  );
}

export default ShipReturns;
