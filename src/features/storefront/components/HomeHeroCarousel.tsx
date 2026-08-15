"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { heroSlides, type HeroSlide } from "@/config/heroSlides";
import { useCarouselAutoAdvance } from "@/features/storefront/hooks/useCarouselAutoAdvance";
import { cn } from "@/lib/utils";
import { StorefrontImage } from "@/components/media/StorefrontImage";

const HERO_AUTOPLAY_MS = 5500;

const heroArrowClass =
  "absolute top-1/2 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-white/15 text-white shadow-lg backdrop-blur-md transition hover:bg-white/30 hover:scale-105 sm:h-12 sm:w-12";

type Props = {
  slides?: HeroSlide[];
};

export function HomeHeroCarousel({ slides }: Props) {
  const activeSlides = slides?.length ? slides : heroSlides;
  const [api, setApi] = useState<CarouselApi>();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  const canAutoplay = activeSlides.length > 1;

  const { isActive: autoplayActive, hoverHandlers } = useCarouselAutoAdvance(
    api,
    {
      delayMs: HERO_AUTOPLAY_MS,
      enabled: canAutoplay,
    },
  );

  const onSelect = useCallback(() => {
    if (!api) return;
    setActive(api.selectedScrollSnap());
    setProgress(0);
  }, [api]);

  useEffect(() => {
    if (!api) return;
    onSelect();
    api.on("select", onSelect);
    api.on("reInit", onSelect);
    return () => {
      api.off("select", onSelect);
      api.off("reInit", onSelect);
    };
  }, [api, onSelect]);

  useEffect(() => {
    if (!autoplayActive || !canAutoplay) return;
    const step = 100 / (HERO_AUTOPLAY_MS / 100);
    const interval = setInterval(() => {
      setProgress((p) => (p >= 100 ? 100 : p + step));
    }, 100);
    return () => clearInterval(interval);
  }, [active, autoplayActive, canAutoplay]);

  return (
    <section
      className="relative w-full min-w-0 overflow-hidden bg-neutral-900"
      aria-label="Homepage banner"
      {...hoverHandlers}
    >
      <Carousel
        setApi={setApi}
        opts={{ loop: canAutoplay, align: "center" }}
        className="w-full"
      >
        <CarouselContent className="ml-0">
          {activeSlides.map((slide, index) => {
            const isFirstSlide = index === 0;
            return (
              <CarouselItem key={slide.id} className="basis-full pl-0">
                <div className="relative aspect-[4/5] w-full sm:aspect-[16/10] md:aspect-[21/9] md:max-h-[min(72vh,520px)]">
                  <Link
                    href={slide.href}
                    className="absolute inset-0 z-[1]"
                    aria-label={`${slide.title} — ${slide.cta}`}
                  />
                  <StorefrontImage
                    src={slide.image}
                    alt={slide.imageAlt}
                    fill
                    priority={isFirstSlide}
                    loading={isFirstSlide ? undefined : "lazy"}
                    sizes="100vw"
                    className="object-cover object-[center_20%] sm:object-center"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15"
                    aria-hidden
                  />

                  <div className="pointer-events-none absolute inset-0 z-[2] flex flex-col items-center justify-center px-6 pb-14 pt-16 text-center sm:px-10 sm:pb-16">
                    <h2 className="font-[family-name:var(--font-hero-serif)] text-3xl font-medium tracking-wide text-white sm:text-4xl md:text-5xl">
                      {slide.title}
                    </h2>
                    <div
                      className="my-3 flex w-28 items-center gap-2 sm:my-4 sm:w-36"
                      aria-hidden
                    >
                      <span className="h-px flex-1 bg-brand-gold/90" />
                      <span className="text-brand-gold">◆</span>
                      <span className="h-px flex-1 bg-brand-gold/90" />
                    </div>
                    <p className="max-w-md text-sm leading-relaxed text-white/90 sm:max-w-xl sm:text-base md:text-lg">
                      {slide.subtitle}
                    </p>
                    <Link
                      href={slide.href}
                      className="pointer-events-auto relative z-[3] mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full bg-gradient-to-r from-brand-rose to-brand-gold px-8 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-[0_12px_30px_-8px_rgba(192,48,120,0.55)] transition-all duration-300 hover:-translate-y-0.5 hover:from-brand-gold hover:to-brand-rose hover:shadow-[0_16px_36px_-8px_rgba(201,162,39,0.55)] sm:mt-8 sm:px-10 sm:text-sm"
                    >
                      {slide.cta}
                    </Link>
                  </div>
                </div>
              </CarouselItem>
            );
          })}
        </CarouselContent>

        <button
          type="button"
          className={cn(heroArrowClass, "left-2 sm:left-4")}
          aria-label="Previous slide"
          onClick={() => api?.scrollPrev()}
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={2} />
        </button>
        <button
          type="button"
          className={cn(heroArrowClass, "right-2 sm:right-4")}
          aria-label="Next slide"
          onClick={() => api?.scrollNext()}
        >
          <ChevronRight className="h-6 w-6" strokeWidth={2} />
        </button>
      </Carousel>

      <div
        className="absolute bottom-0 left-0 right-0 z-20 flex h-1 gap-px"
        role="tablist"
        aria-label="Hero slides"
      >
        {activeSlides.map((slide, index) => (
          <div
            key={slide.id}
            className="h-full flex-1 bg-white/25"
            role="presentation"
          >
            <div
              className="h-full bg-white/95 transition-[width] duration-100 ease-linear"
              style={{
                width:
                  index < active
                    ? "100%"
                    : index === active
                      ? `${progress}%`
                      : "0%",
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
