import {
  authSchema,
  passwordCreateSchema,
  signupSchema,
} from "./index";

describe("passwordCreateSchema", () => {
  it("accepts a short simple password", () => {
    expect(passwordCreateSchema.safeParse("thry12").success).toBe(true);
  });

  it("rejects under 6 characters", () => {
    const result = passwordCreateSchema.safeParse("abc");
    expect(result.success).toBe(false);
  });
});

describe("authSchema (sign-in)", () => {
  it("does not require uppercase or special characters", () => {
    expect(
      authSchema.safeParse({
        email: "buyer@gmail.com",
        password: "simple",
      }).success,
    ).toBe(true);
  });
});

describe("signupSchema", () => {
  it("accepts soft passwords for new accounts", () => {
    expect(
      signupSchema.safeParse({
        email: "buyer@gmail.com",
        name: "Sam",
        password: "hello1",
      }).success,
    ).toBe(true);
  });

  it("requires a name", () => {
    const result = signupSchema.safeParse({
      email: "buyer@gmail.com",
      name: "  ",
      password: "hello1",
    });
    expect(result.success).toBe(false);
  });
});
