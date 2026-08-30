import { z } from "zod";
import {
  blockedSignupEmailMessage,
  isBlockedSignupEmail,
} from "@/lib/auth/email-policy";

const emailField = z
  .string()
  .email({ message: "Please enter a valid email address" })
  .refine((value) => !isBlockedSignupEmail(value), {
    message: blockedSignupEmailMessage,
  });

/**
 * Soft create/reset rule (India D2C / Supabase-friendly):
 * min 6 chars, no forced upper/special — complexity kills signup conversion.
 */
export const passwordCreateSchema = z
  .string()
  .min(6, { message: "Password must be at least 6 characters" })
  .max(100, { message: "Password is too long" });

/** Sign-in: do not re-apply create complexity (blocks existing users). */
export const passwordSignInSchema = z
  .string()
  .min(1, { message: "Enter your password" })
  .max(100);

export const authSchema = z.object({
  email: emailField,
  password: passwordSignInSchema,
});

export const signupSchema = z.object({
  email: emailField,
  name: z
    .string()
    .trim()
    .min(1, { message: "Enter your name" })
    .max(80, { message: "Name is too long" }),
  password: passwordCreateSchema,
});

export const forgotPasswordEmailSchema = z.object({
  email: emailField,
});

export const resetPasswordSchema = z
  .object({
    password: passwordCreateSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
