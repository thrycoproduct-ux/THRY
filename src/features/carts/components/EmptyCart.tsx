import { HardNavigationLink } from "@/components/navigation/HardNavigationLink";
import { buttonVariants } from "@/components/ui/button";
import { Icons } from "@/components/layouts/icons";
import { cn } from "@/lib/utils";

function EmptyCart() {
  return (
    <section className="craft-kraft craft-torn-top flex min-h-[320px] w-full flex-col items-center justify-center gap-5 rounded-2xl px-6 py-12 text-center">
      <p className="text-base font-medium text-foreground">
        Your cart is empty
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Browse the shop and add products — then come back here to checkout.
      </p>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <HardNavigationLink
          href="/shop"
          className={cn(buttonVariants({ size: "lg" }), "font-semibold")}
        >
          <Icons.cart className="mr-3 h-5 w-5" aria-hidden />
          Continue shopping
        </HardNavigationLink>
        <HardNavigationLink
          href="/collections"
          className={cn(
            buttonVariants({ size: "lg", variant: "outline" }),
            "font-semibold",
          )}
        >
          Browse collections
        </HardNavigationLink>
      </div>
    </section>
  );
}

export default EmptyCart;
