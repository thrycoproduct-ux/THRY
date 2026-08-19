import { StorefrontImage } from "@/components/media/StorefrontImage";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { viewTransitionStyle } from "@/lib/view-transitions";

type CollectionCardSurfaceProps = {
  label: string;
  imageSrc: string;
  imageAlt: string;
  className?: string;
  /** Taller cards on mobile grid; wider on desktop */
  aspectClass?: string;
  sizes?: string;
  priority?: boolean;
  viewTransitionName?: string;
};

/**
 * Shared category card — photo with label overlay (all breakpoints).
 */
export function CollectionCardSurface({
  label,
  imageSrc,
  imageAlt,
  className,
  aspectClass = "aspect-[4/5] sm:aspect-[5/4] lg:aspect-[16/10]",
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 280px",
  priority = false,
  viewTransitionName,
}: CollectionCardSurfaceProps) {
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-[1.1rem] bg-muted sm:rounded-none",
        aspectClass,
        className,
      )}
    >
      <StorefrontImage
        src={imageSrc}
        alt={imageAlt}
        fill
        priority={priority}
        fetchPriority={priority ? "high" : "auto"}
        decoding={priority ? "sync" : "async"}
        loading={priority ? undefined : "lazy"}
        sizes={sizes}
        className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.05]"
        style={
          viewTransitionName
            ? viewTransitionStyle(viewTransitionName)
            : undefined
        }
      />

      <div
        className="absolute inset-0 bg-gradient-to-t from-brand-purple/95 via-brand-teal/40 to-transparent"
        aria-hidden
      />

      <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
        <div className="inline-flex max-w-full flex-col gap-1 rounded-xl border border-white/25 bg-white/15 px-2.5 py-2 sm:px-3">
          <p className="font-[family-name:var(--font-hero-serif)] text-sm font-semibold leading-snug text-white drop-shadow-md sm:text-base lg:text-lg">
            {label}
          </p>
          <p className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-yellow sm:text-[11px]">
            View collection
            <ArrowUpRight className="h-3 w-3 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </p>
        </div>
      </div>
    </div>
  );
}
