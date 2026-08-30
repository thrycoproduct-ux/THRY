import {
  DIGITAL_UPLOAD_LIMIT_BYTES,
  DIGITAL_UPLOAD_LIMIT_MB,
  assertDigitalUploadLimits,
  canDownloadPaidDigital,
  formatDigitalUploadNetworkError,
  isValidDigitalObjectKey,
  physicalQuantityForShipping,
  resolveDigitalProductFields,
  sanitizeDownloadFileName,
} from "./digital-product";

describe("digital product files", () => {
  it("accepts zip uploads and rejects other formats", () => {
    expect(
      assertDigitalUploadLimits({ fileName: "app.zip", fileSize: 10 }).ext,
    ).toBe("zip");
    expect(() =>
      assertDigitalUploadLimits({ fileName: "page.html", fileSize: 10 }),
    ).toThrow(/zip/i);
    expect(() =>
      assertDigitalUploadLimits({ fileName: "pack.rar", fileSize: 10 }),
    ).toThrow(/zip/i);
    expect(() =>
      assertDigitalUploadLimits({ fileName: "setup.exe", fileSize: 10 }),
    ).toThrow(/zip/i);
    expect(() =>
      assertDigitalUploadLimits({ fileName: "guide.pdf", fileSize: 10 }),
    ).toThrow(/zip/i);
  });

  it(`allows up to ${DIGITAL_UPLOAD_LIMIT_MB} MB and rejects larger`, () => {
    expect(() =>
      assertDigitalUploadLimits({
        fileName: "model.zip",
        fileSize: DIGITAL_UPLOAD_LIMIT_BYTES,
      }),
    ).not.toThrow();
    expect(() =>
      assertDigitalUploadLimits({
        fileName: "model.zip",
        fileSize: DIGITAL_UPLOAD_LIMIT_BYTES + 1,
      }),
    ).toThrow(/500 MB/i);
  });

  it("maps Safari Load failed to a CORS-friendly message", () => {
    expect(
      formatDigitalUploadNetworkError(new Error("Load failed")),
    ).toMatch(/R2 CORS/i);
    expect(
      formatDigitalUploadNetworkError(new Error("Failed to fetch")),
    ).toMatch(/R2 CORS/i);
    expect(
      formatDigitalUploadNetworkError(new Error("Zip file must be 500 MB")),
    ).toBe("Zip file must be 500 MB");
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
