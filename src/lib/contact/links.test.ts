import {
  contactActionHref,
  shopMailtoHref,
  whatsAppHrefFromPhone,
} from "@/lib/contact/links";

describe("contact links", () => {
  it("builds WhatsApp href with country code from tel link", () => {
    expect(whatsAppHrefFromPhone("tel:+918012715132")).toBe(
      "https://wa.me/918012715132",
    );
  });

  it("adds India country code when tel link is 10 digits only", () => {
    expect(whatsAppHrefFromPhone("tel:+8012715132")).toBe(
      "https://wa.me/918012715132",
    );
    expect(whatsAppHrefFromPhone("tel:8012715132")).toBe(
      "https://wa.me/918012715132",
    );
  });

  it("returns call or WhatsApp href by mode", () => {
    const contact = {
      name: "J. Moulee",
      phone: "+91 80127 15132",
      phoneHref: "tel:+918012715132",
    };

    expect(contactActionHref(contact, "call")).toBe("tel:+918012715132");
    expect(contactActionHref(contact, "whatsapp")).toBe(
      "https://wa.me/918012715132",
    );
  });

  it("fixes WhatsApp when stored contact has local 10-digit number", () => {
    const contact = {
      name: "THRY",
      phone: "8870669160",
      phoneHref: "tel:+8870669160",
    };

    expect(contactActionHref(contact, "whatsapp")).toBe(
      "https://wa.me/918870669160",
    );
    expect(contactActionHref(contact, "call")).toBe("tel:+918870669160");
  });

  it("builds mailto only for a usable shop email", () => {
    expect(shopMailtoHref("thrycoproduct@gmail.com")).toBe(
      "mailto:thrycoproduct@gmail.com",
    );
    expect(shopMailtoHref("")).toBeNull();
    expect(shopMailtoHref("not-an-email")).toBeNull();
  });
});
