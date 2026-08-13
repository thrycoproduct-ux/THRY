import {
  buildTelHref,
  buildWhatsAppHref,
  toInternationalPhoneDigits,
} from "@/lib/contact/phone";

describe("toInternationalPhoneDigits", () => {
  it("adds India country code to 10-digit mobiles", () => {
    expect(toInternationalPhoneDigits("8870669160")).toBe("918870669160");
    expect(toInternationalPhoneDigits("88706 69160")).toBe("918870669160");
    expect(toInternationalPhoneDigits("+91 88706 69160")).toBe("918870669160");
  });

  it("strips trunk 0 and international 00 prefixes", () => {
    expect(toInternationalPhoneDigits("08870669160")).toBe("918870669160");
    expect(toInternationalPhoneDigits("00918870669160")).toBe("918870669160");
  });

  it("keeps already-international numbers", () => {
    expect(toInternationalPhoneDigits("918012715132")).toBe("918012715132");
    expect(toInternationalPhoneDigits("tel:+918012715132")).toBe(
      "918012715132",
    );
  });

  it("builds tel and WhatsApp hrefs", () => {
    expect(buildTelHref("8870669160")).toBe("tel:+918870669160");
    expect(buildWhatsAppHref("8870669160")).toBe("https://wa.me/918870669160");
    expect(buildWhatsAppHref("")).toBe("https://wa.me/");
  });
});
