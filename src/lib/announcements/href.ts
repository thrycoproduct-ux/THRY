/** Same-origin paths stay relative; tel/mailto/http stay as-is. */
export function resolveAnnouncementHref(href: string | undefined): string {
  const trimmed = String(href ?? "").trim();
  return trimmed || "/shop";
}

export function isExternalAnnouncementHref(href: string): boolean {
  return (
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("tel:") ||
    href.startsWith("mailto:")
  );
}
