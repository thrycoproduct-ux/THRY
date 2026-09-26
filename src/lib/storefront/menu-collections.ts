export type MenuCollection = {
  id: string;
  label: string;
  slug: string;
};

export function collectionMenuHref(slug: string) {
  return `/collections/${slug}`;
}
