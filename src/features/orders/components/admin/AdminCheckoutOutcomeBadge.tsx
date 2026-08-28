import { Badge } from "@/components/ui/badge";
import type { CheckoutOutcome } from "@/lib/checkout/checkout-outcome";
import { cn } from "@/lib/utils";

function outcomeBadgeClass(kind: CheckoutOutcome["kind"]) {
  switch (kind) {
    case "payment_failed":
      return "border-rose-500 text-rose-700";
    case "payment_cancelled":
    case "abandoned":
      return "border-slate-400 text-slate-700";
    case "checkout_error":
      return "border-orange-500 text-orange-700";
    case "in_progress":
      return "border-sky-500 text-sky-700";
    default:
      return "border-amber-500 text-amber-700";
  }
}

type Props = {
  outcome: CheckoutOutcome;
  className?: string;
  showDetail?: boolean;
};

export function AdminCheckoutOutcomeBadge({
  outcome,
  className,
  showDetail = false,
}: Props) {
  return (
    <div className={cn("space-y-1", className)}>
      <Badge
        variant="outline"
        className={cn("font-normal", outcomeBadgeClass(outcome.kind))}
        title={outcome.detail ?? undefined}
      >
        {outcome.label}
      </Badge>
      {showDetail && outcome.detail ? (
        <p className="text-xs text-muted-foreground">{outcome.detail}</p>
      ) : null}
    </div>
  );
}
