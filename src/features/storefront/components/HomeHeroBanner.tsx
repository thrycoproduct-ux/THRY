import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function HomeHeroBanner() {
  return (
    <section className="w-full min-w-0 overflow-hidden bg-background">
      <div className="container px-4 sm:px-6 pt-2 pb-1 md:pt-5 md:pb-3">
        <Link
          href="/shop"
          className="relative block w-full max-w-full overflow-hidden rounded-2xl shadow-md aspect-[2/1] sm:aspect-[5/2] md:aspect-[21/9] md:max-h-[480px]"
        >
          <Image
            src="/images/thry-hero-craft.svg"
            alt="THRY — creative 3D printed products"
            fill
            priority
            unoptimized
            sizes="(max-width: 768px) 100vw, 1200px"
            className="object-cover object-center"
          />
        </Link>
        <div className="mt-4 hidden justify-center md:flex">
          <Link
            href="/shop"
            className={cn(buttonVariants({ size: "lg" }), "rounded-full px-10")}
          >
            Shop now
          </Link>
        </div>
      </div>
    </section>
  );
}
