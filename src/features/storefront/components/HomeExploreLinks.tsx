import Link from "next/link";
import { SEO_PRIMARY_NAV } from "@/lib/seo/constants";

export function HomeExploreLinks() {
  return (
    <section
      className="craft-kraft craft-torn-top rounded-2xl px-4 py-8 md:px-6 md:py-10"
      aria-labelledby="explore-thry-heading"
    >
      <h2
        id="explore-thry-heading"
        className="font-[family-name:var(--font-hero-serif)] text-xl font-semibold text-foreground md:text-2xl"
      >
        Explore THRY
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
        Shop creative 3D printed products — art &amp; craft tools, customised
        gifts, statues, planters and more.
      </p>
      <nav
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Primary store sections"
      >
        {SEO_PRIMARY_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-brand-rose/20 bg-card/90 p-4 transition hover:border-brand-gold/50 hover:bg-card"
          >
            <h3 className="text-sm font-semibold text-brand-rose md:text-base">
              {item.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground md:text-sm">
              {item.description}
            </p>
          </Link>
        ))}
      </nav>
    </section>
  );
}
