// Sync codes: JSA- plus 5 groups of 4 symbols (100 bits of entropy).
import { randomBytes } from "node:crypto";

/** 32 symbols without the look-alikes I, O, 0 and 1. 256 is divisible by 32, so `byte & 31` has no bias. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The accept rule (the client's sync.ts keeps the same pattern). */
export const CODE_RE = /^JSA(-[A-Z0-9]{4}){5}$/;

export function generateCode(): string {
  const bytes = randomBytes(20);
  const groups: string[] = [];
  for (let g = 0; g < 5; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += ALPHABET[bytes[g * 4 + i] & 31];
    groups.push(s);
  }
  return "JSA-" + groups.join("-");
}

/** The sync code from `Authorization: Bearer <code>`, upper-cased, or null when missing or malformed. */
export function parseBearer(req: Request): string | null {
  const m = /^Bearer (\S+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  const code = m[1].toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
