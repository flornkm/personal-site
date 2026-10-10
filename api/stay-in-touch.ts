import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";

import { db } from "./utils/_firebase.js";

const emailsRef = db.ref("emails");

// Loose on purpose: the confirmation is the inbox, not this regex.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

type Body = { email?: unknown; source?: unknown; website?: unknown };

// Collects emails from the "Stay in touch" form under each post. Writes go through the Admin
// SDK; the database itself denies all client reads and writes, so the list never leaves here.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.json({ error: "Method not allowed" });
    return;
  }

  const body = (typeof req.body === "object" && req.body ? req.body : {}) as Body;

  // Honeypot: a field hidden from people that form-filling bots happily complete. Answer as if
  // it worked so they have no reason to retry.
  if (typeof body.website === "string" && body.website.length > 0) {
    if (isNativeFormPost(req)) {
      redirectBack(res, null);
      return;
    }
    res.statusCode = 200;
    res.json({ ok: true });
    return;
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    res.statusCode = 400;
    res.json({ error: "Invalid email" });
    return;
  }

  const source = typeof body.source === "string" ? body.source.slice(0, 120) : null;

  // RTDB keys cannot contain "." so the address is hashed into the key, which also makes a
  // second sign-up with the same address a no-op instead of a duplicate.
  const key = createHash("sha256").update(email).digest("hex");

  try {
    await emailsRef.child(key).transaction((current) => {
      if (current) return;
      return { email, source, createdAt: new Date().toISOString() };
    });
    if (isNativeFormPost(req)) {
      redirectBack(res, source);
      return;
    }
    res.statusCode = 200;
    res.json({ ok: true });
  } catch (error) {
    console.error("Error saving stay-in-touch email.", error);
    res.statusCode = 500;
    res.json({ error: "Failed to save" });
  }
}

// A form submitted before the page hydrated arrives urlencoded rather than as the JSON fetch.
function isNativeFormPost(req: VercelRequest) {
  return (req.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded");
}

// Only ever back to a post slug, never to an arbitrary URL from the body.
function redirectBack(res: VercelResponse, source: string | null) {
  const slug = source && /^[a-z0-9-]+$/.test(source) ? source : null;
  res.statusCode = 303;
  res.setHeader("Location", slug ? `/writing/${slug}` : "/writing");
  res.end();
}
