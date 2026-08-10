#!/usr/bin/env node
/**
 * Generate the signing secrets a local stack needs, into the gitignored `.env`.
 *
 * The repository used to ship a working secret in docker-compose.yml, so every
 * checkout signed its tokens with a string published on the internet, and a
 * deployment that forgot to override it inherited the same key (FPA-002).
 * Nothing usable is committed any more; each machine generates its own.
 *
 * Existing values are kept, so running this repeatedly will not invalidate the
 * sessions of a stack that is already up.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

const MANAGED_KEYS = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];

const generate = () => crypto.randomBytes(48).toString("base64");

const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const lines = existing.length > 0 ? existing.split("\n") : [];

const valueOf = (key) => {
  const line = lines.find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).trim() : "";
};

const created = [];
const kept = [];

for (const key of MANAGED_KEYS) {
  const current = valueOf(key);
  if (current.length > 0) {
    kept.push(key);
    continue;
  }
  const index = lines.findIndex((entry) => entry.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${generate()}`;
  else lines.push(`${key}=${generate()}`);
  created.push(key);
}

if (created.length > 0) {
  const content = lines.join("\n").replace(/\n{3,}$/, "\n");
  fs.writeFileSync(envPath, content.endsWith("\n") ? content : `${content}\n`, {
    mode: 0o600,
  });
}

// The values themselves are never printed: this output ends up in terminals,
// CI logs and screen shares.
if (created.length > 0) console.log(`Generated ${created.join(", ")} in .env`);
if (kept.length > 0) console.log(`Kept existing ${kept.join(", ")}`);
