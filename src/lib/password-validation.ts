// Shared password validation schema for new account creation
import { z } from "zod";

/**
 * Password validation schema with security requirements.
 * 
 * IMPORTANT: This is ONLY enforced for NEW accounts.
 * Existing users with weaker passwords can still log in.
 */
export const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

/**
 * Human-readable password requirements to display in UI
 */
export const passwordRequirements = [
  "At least 8 characters long",
  "Contains uppercase letter (A-Z)",
  "Contains lowercase letter (a-z)",
  "Contains number (0-9)"
];

/**
 * Helper function to check password strength
 */
export function getPasswordStrength(password: string): 'weak' | 'medium' | 'strong' {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++; // Special characters
  
  if (score <= 3) return 'weak';
  if (score <= 5) return 'medium';
  return 'strong';
}
