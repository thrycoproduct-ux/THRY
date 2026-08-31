import { Shell } from "@/components/layouts/Shell";
import { BuyAgainCard, OrdersList } from "@/features/orders/components";
import { BuyAgainCardFragment } from "@/features/orders/components/BuyAgainCard";
import { gql } from "@/gql";
import { getSessionUser } from "@/lib/auth/admin";
import { getUserOrdersList } from "@/lib/orders/getUserOrdersList";
import { getClient } from "@/lib/urql";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

void BuyAgainCardFragment;

const BuyAgainProductsQuery = gql(/* GraphQL */ `
  query BuyAgainProductsQuery($first: Int!) {
    productsCollection(first: $first) {
      edges {
        ...BuyAgainCardFragment
      }
    }
  }
`);

async function OrderPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/sign-in");
  }

  const [orders, buyAgainResult] = await Promise.all([
    getUserOrdersList(user.id),
    getClient().query(BuyAgainProductsQuery, { first: 8 }),
  ]);

  const buyAgainProducts = buyAgainResult.data?.productsCollection?.edges ?? [];

  return (
    <Shell layout="narrow">
      <h1 className="border-b pb-8 text-3xl font-semibold">Orders</h1>

      <div className="grid grid-cols-12 gap-x-5">
        <section className="col-span-9">
          <OrdersList orders={orders} />
        </section>

        <section className="col-span-3">
          <BuyAgainCard products={buyAgainProducts} />
        </section>
      </div>
    </Shell>
  );
}

export default OrderPage;
