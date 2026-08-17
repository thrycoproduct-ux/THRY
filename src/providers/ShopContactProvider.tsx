"use client";

import { siteConfig } from "@/config/site";
import {
  buildPhoneHref,
  hideShopPhoneOnStorefront,
} from "@/lib/admin/shop-contact";
import type { ResolvedShopContact } from "@/lib/admin/shop-contact";
import { createContext, useContext, type ReactNode } from "react";

const defaultContact: ResolvedShopContact = hideShopPhoneOnStorefront({
  addressLines: siteConfig.addressLines,
  address: siteConfig.address,
  gstin: siteConfig.gstin,
  email: siteConfig.email,
  contacts: siteConfig.contacts.map((contact) => ({
    ...contact,
    phoneHref: buildPhoneHref(contact.phone || contact.phoneHref),
  })),
  phone: siteConfig.phone,
  phoneHref: siteConfig.phoneHref || buildPhoneHref(siteConfig.phone),
});

const ShopContactContext = createContext<ResolvedShopContact>(defaultContact);

export function ShopContactProvider({
  contact,
  children,
}: {
  contact: ResolvedShopContact;
  children: ReactNode;
}) {
  return (
    <ShopContactContext.Provider value={contact}>
      {children}
    </ShopContactContext.Provider>
  );
}

export function useStorefrontContact() {
  return useContext(ShopContactContext);
}
