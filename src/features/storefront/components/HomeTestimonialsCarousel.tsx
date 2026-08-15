"use client";

import { BadgeCheck, Quote, Star } from "lucide-react";
import { DocumentType } from "@/gql";
import { TestimonialCardFragment } from "@/features/testimonials";
import { TestimonialVideoPlayer } from "@/features/testimonials/components/TestimonialVideoPlayer";
import {
  testimonialPanelAt,
  type TestimonialPanel,
} from "@/lib/brand/testimonial-panels";
import { cn, keytoUrl } from "@/lib/utils";
import { StorefrontImage } from "@/components/media/StorefrontImage";
import { HomeSectionHeader } from "./HomeSectionHeader";
import { HomeScrollSnapStrip, ScrollSnapItem } from "./HomeScrollSnapStrip";
import {
  MotionHoverLift,
  MotionRevealItem,
  MotionSection,
} from "./MotionSection";

type TestimonialNode = DocumentType<typeof TestimonialCardFragment>;

type Props = {
  testimonials: { node: TestimonialNode }[];
};

const scrollSnapTestimonialItemClass =
  "w-[88vw] max-w-[320px] shrink-0 grow-0 sm:w-auto sm:max-w-none sm:basis-[62%] md:basis-[46%] lg:basis-[34%] xl:basis-[30%]";

const scrollSnapTestimonialVideoItemClass =
  "w-[48vw] max-w-[160px] shrink-0 grow-0 sm:w-auto sm:max-w-none sm:basis-[38%] md:basis-[28%] lg:basis-[22%]";

function StarRating({
  rating,
  onPastel,
}: {
  rating: number;
  onPastel?: boolean;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating} out of 5 stars`}
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            "h-3.5 w-3.5 sm:h-4 sm:w-4",
            i < rating
              ? onPastel
                ? "fill-white text-white"
                : "fill-brand-orange text-brand-orange"
              : onPastel
                ? "fill-transparent text-white/40"
                : "fill-transparent text-brand-teal/25",
          )}
        />
      ))}
    </div>
  );
}

function CustomerAvatar({
  name,
  imageKey,
  imageAlt,
  onPastel,
}: {
  name: string;
  imageKey?: string | null;
  imageAlt?: string | null;
  onPastel?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (imageKey) {
    const imageSrc = keytoUrl(imageKey);
    return (
      <div
        className={cn(
          "relative h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-offset-2",
          onPastel
            ? "ring-white/50 ring-offset-transparent"
            : "ring-primary/15 ring-offset-background",
        )}
      >
        <StorefrontImage
          src={imageSrc}
          alt={imageAlt || name}
          fill
          sizes="44px"
          className="object-cover"
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ring-2 ring-offset-2",
        onPastel
          ? "bg-white/25 text-white ring-white/40 ring-offset-transparent"
          : "bg-gradient-to-br from-brand-rose to-brand-gold text-white ring-brand-gold/25 ring-offset-background",
      )}
    >
      {initials || "ST"}
    </div>
  );
}

function ModernTextTestimonialCard({
  node,
  panel,
}: {
  node: TestimonialNode;
  panel: TestimonialPanel;
}) {
  const imageKey = node.featuredImage?.key;

  return (
    <article
      className="flex w-full flex-col rounded-none px-5 py-7 text-white sm:min-h-[280px] sm:px-7 sm:py-9"
      style={{
        backgroundColor: panel.bg,
        boxShadow: `0 18px 40px -24px ${panel.shadow}`,
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-2 sm:mb-4 sm:gap-3">
        <StarRating rating={node.rating ?? 5} onPastel />
        <Quote
          className="h-6 w-6 shrink-0 text-white/35 sm:h-8 sm:w-8"
          aria-hidden
        />
      </div>

      {node.quote ? (
        <blockquote className="line-clamp-5 flex-1 font-[family-name:var(--font-hero-serif)] text-base leading-relaxed text-white sm:line-clamp-none sm:text-xl">
          “{node.quote}”
        </blockquote>
      ) : (
        <p className="flex-1 text-sm text-white/85">
          Thank you for shopping with THRY.
        </p>
      )}

      <footer className="mt-4 flex items-center gap-2.5 border-t border-white/25 pt-3 sm:mt-5 sm:gap-3 sm:pt-4">
        <CustomerAvatar
          name={node.customer_name}
          imageKey={imageKey}
          imageAlt={node.featuredImage?.alt}
          onPastel
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold tracking-wide text-white sm:text-base">
            {node.customer_name}
          </p>
          <p className="mt-0.5 flex items-start gap-1 text-[11px] leading-snug text-white/80 sm:text-xs">
            <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white" />
            <span className="line-clamp-2 uppercase tracking-[0.08em]">
              {node.location
                ? `Verified buyer · ${node.location}`
                : "Verified buyer"}
            </span>
          </p>
        </div>
      </footer>
    </article>
  );
}

function ModernVideoTestimonialCard({
  node,
  panel,
}: {
  node: TestimonialNode;
  panel: TestimonialPanel;
}) {
  const imageKey = node.featuredImage?.key;
  const posterUrl = imageKey ? keytoUrl(imageKey) : null;

  return (
    <article
      className="group flex w-full flex-col overflow-hidden"
      style={{
        boxShadow: `0 16px 40px -24px ${panel.shadow}`,
        outline: `4px solid ${panel.bg}`,
        outlineOffset: 0,
      }}
    >
      <div className="relative aspect-[9/13] w-full max-h-[min(62vh,360px)] bg-muted sm:aspect-[3/4] sm:max-h-none">
        <TestimonialVideoPlayer
          fill
          showTapHint
          videoUrl={node.video_url ?? ""}
          posterUrl={posterUrl}
          customerName={node.customer_name}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 p-3 pt-12 sm:p-4 sm:pt-16"
          style={{
            background: `linear-gradient(to top, ${panel.bg}f2 0%, ${panel.bg}99 45%, transparent 100%)`,
          }}
        >
          <StarRating rating={node.rating ?? 5} onPastel />
          {node.quote ? (
            <p className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-white sm:mt-2 sm:text-sm">
              “{node.quote}”
            </p>
          ) : null}
          <p className="mt-1.5 text-sm font-bold leading-tight text-white sm:mt-2 sm:text-base">
            {node.customer_name}
          </p>
          {node.location ? (
            <p className="mt-0.5 line-clamp-1 text-[10px] text-white/80 sm:text-xs">
              {node.location}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function HomeTestimonialsCarousel({ testimonials }: Props) {
  if (!testimonials.length) return null;

  return (
    <MotionSection className="w-full min-w-0 py-4 sm:py-8 md:py-10">
      <HomeSectionHeader
        title="Customer"
        titleAccent="Testimonials"
        showViewMore={false}
      />
      <HomeScrollSnapStrip ariaLabel="Customer testimonials from admin">
        {testimonials.map(({ node }, index) => {
          const isVideo =
            node.kind === "video" && Boolean(node.video_url?.trim());
          const panel = testimonialPanelAt(index);

          return (
            <ScrollSnapItem
              key={node.id}
              className={
                isVideo
                  ? scrollSnapTestimonialVideoItemClass
                  : scrollSnapTestimonialItemClass
              }
            >
              <MotionRevealItem index={index} instant className="w-full">
                <MotionHoverLift className="w-full">
                  {isVideo ? (
                    <ModernVideoTestimonialCard node={node} panel={panel} />
                  ) : (
                    <ModernTextTestimonialCard node={node} panel={panel} />
                  )}
                </MotionHoverLift>
              </MotionRevealItem>
            </ScrollSnapItem>
          );
        })}
      </HomeScrollSnapStrip>
    </MotionSection>
  );
}
