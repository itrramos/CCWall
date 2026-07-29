import bcrypt from 'bcryptjs';
import type { SecuritySettings } from '../schemas.js';

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Returns a list of human-readable policy violations (empty = OK). */
export function checkPasswordPolicy(password: string, policy: SecuritySettings): string[] {
  const problems: string[] = [];
  if (password.length < policy.passwordMinLength) {
    problems.push(`Password must be at least ${policy.passwordMinLength} characters`);
  }
  if (policy.passwordRequireNumber && !/\d/.test(password)) {
    problems.push('Password must contain a number');
  }
  if (policy.passwordRequireMixedCase && !(/[a-z]/.test(password) && /[A-Z]/.test(password))) {
    problems.push('Password must contain both upper- and lower-case letters');
  }
  if (policy.passwordRequireSymbol && !/[^a-zA-Z0-9]/.test(password)) {
    problems.push('Password must contain a symbol');
  }
  return problems;
}
