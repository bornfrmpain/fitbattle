import crypto from "node:crypto";
export const newId = (prefix = "") => prefix + crypto.randomBytes(10).toString("base64url");
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function inviteCode(len = 6) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
