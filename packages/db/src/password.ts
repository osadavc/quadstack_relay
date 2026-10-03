import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/* scrypt password hashes: `scrypt$<salt>$<hash>`, both base64. */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(
    password,
    Buffer.from(salt, "base64"),
    expected.length,
  );
  return timingSafeEqual(expected, actual);
}
