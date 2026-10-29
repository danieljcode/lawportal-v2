// The public code names no roleplay server (LP-163, LP-165). The banned words are kept as the
// first 16 hex digits of their SHA-256, so this test doesn't name them either; each word of
// every tracked text file is hashed and checked. To ban another word, add its hash:
//   node -e 'console.log(require("crypto").createHash("sha256").update("word").digest("hex").slice(0, 16))'
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BANNED = new Set([
  "1d56200070346d8d",
  "3e32dc9d21d74368",
  "9599e9e068c59cf2",
  "0abdaa89cafafafc",
  "a7eed5bc21321241",
  "c8009e9d949cb66c",
]);

const BINARY = /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|docx|zip)$/i;
const hash = (w: string) => createHash("sha256").update(w).digest("hex").slice(0, 16);

describe("the public code is server-neutral (LP-165)", () => {
  it("no tracked file contains a banned word", () => {
    const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
    const hits: string[] = [];
    for (const file of files) {
      if (BINARY.test(file)) continue;
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue; // deleted in the working tree
      }
      const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) || []);
      for (const w of words) if (BANNED.has(hash(w))) hits.push(file);
    }
    expect([...new Set(hits)]).toEqual([]);
  });
});
