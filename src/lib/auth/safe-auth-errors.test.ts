import {
  safeAuthErrorMessage,
  safeAuthRedirectError,
} from "./safe-auth-errors";

describe("safeAuthErrorMessage", () => {
  it("nudges create account on invalid credentials", () => {
    const message = safeAuthErrorMessage(
      { message: "Invalid login credentials", code: "invalid_credentials" },
      "fallback",
    );
    expect(message.toLowerCase()).toContain("create an account");
  });

  it("maps user_not_found to create account", () => {
    const message = safeAuthErrorMessage(
      { code: "user_not_found", message: "User not found" },
      "fallback",
    );
    expect(message.toLowerCase()).toContain("create an account");
  });
});

describe("safeAuthRedirectError", () => {
  it("allows create-account nudge through query strings", () => {
    const raw =
      "Email or password didn't match. New here? Create an account — or try Google.";
    expect(safeAuthRedirectError(raw, "fallback")).toBe(raw);
  });
});
