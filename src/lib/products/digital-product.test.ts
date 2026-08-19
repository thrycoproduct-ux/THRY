import {
  assertDigitalUploadLimits,
  canDownloadPaidDigital,
  isValidDigitalObjectKey,
  physicalQuantityForShipping,
  resolveDigitalProductFields,
  sanitizeDownloadFileName,
} from "./digital-product";

describe("digital product files", () => {
  it("accepts zip uploads and rejects html", () => {
    expect(
      assertDigitalUploadLimits({ fileName: "app.zip", fileSize: 10 }).ext,
    ).toBe("zip");
    expect(() =>
      assertDigitalUploadLimits({ fileName: "page.html", fileSize: 10 }),
    ).toThrow(/software file/i);
  });

  it("only allows digital/files keys", () => {
    expect(isValidDigitalObjectKey("digital/files/abc_12.zip")).toBe(true);
    expect(isValidDigitalObjectKey("uploads/upload-abc.zip")).toBe(false);
    expect(isValidDigitalObjectKey("digital/files/../secret.zip")).toBe(false);
  });

  it("requires a file when digital is enabled", () => {
    expect(() => resolveDigitalProductFields({ isDigital: true })).toThrow(
      /upload the software file/i,
    );
    const saved = resolveDigitalProductFields({
      isDigital: true,
      digitalFileKey: "digital/files/abc123.zip",
      digitalFileName: "Setup Installer.ZIP",
      digitalFileSize: 2048,
      digitalContentType: "application/zip",
    });
    expect(saved.digitalFileName).toBe("setup-installer.zip");
  });

  it("clears file fields when digital is off", () => {
    const cleared = resolveDigitalProductFields({
      isDigital: false,
      digitalFileKey: "digital/files/abc123.zip",
    });
    expect(cleared.digitalFileKey).toBeNull();
  });

  it("counts only physical qty for shipping", () => {
    expect(
      physicalQuantityForShipping([
        { quantity: 2, isDigital: true },
        { quantity: 3, isDigital: false },
      ]),
    ).toBe(3);
  });

  it("unlocks download only after paid", () => {
    expect(
      canDownloadPaidDigital({
        paymentStatus: "unpaid",
        isDigital: true,
        fileKey: "digital/files/abc123.zip",
      }).ok,
    ).toBe(false);
    expect(
      canDownloadPaidDigital({
        paymentStatus: "paid",
        isDigital: true,
        fileKey: "digital/files/abc123.zip",
      }).ok,
    ).toBe(true);
  });

  it("sanitizes download names", () => {
    expect(sanitizeDownloadFileName("My App (v2).ZIP")).toBe("my-app-v2.zip");
  });
});
