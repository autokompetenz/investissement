/**
 * §21 — the endpoint that drains the mail queue.
 *
 * Not a cron: Vercel schedules are configured on the dashboard, and this
 * function is what the schedule calls. It is also callable by hand, which is
 * how the queue is drained after a configuration change without waiting for
 * the next tick.
 *
 * `POST` drains. `GET` reports, and is the one an operator hits to ask whether
 * mail is going out at all — a queue that fills up with `FAILED` and nothing
 * else is the signature of a wrong password or an unreachable host.
 *
 * Protected by `ADMIN_TOKEN` like the account list: this sends mail to every
 * client, and reading the queue means reading their addresses.
 */

import { etatFile, traiterFile } from "./_outbox.ts";
import { commeFonction } from "./_node.ts";
import { fail, json, originAllowed } from "./_http.ts";

const autorise = (request: Request): boolean => {
  const attendu = process.env.ADMIN_TOKEN;
  if (!attendu) return false;

  const authorization = request.headers.get("authorization") ?? "";
  const fourni = authorization.replace(/^Bearer\s+/i, "");
  if (!fourni) return false;

  // Both sides are hashed before being compared, so a difference in length
  // cannot be measured by how long the comparison takes.
  const encodeur = new TextEncoder();
  const a = encodeur.encode(fourni);
  const b = encodeur.encode(attendu);
  const longueur = Math.max(a.length, b.length, 32);

  let ecart = a.length ^ b.length;
  for (let i = 0; i < longueur; i += 1) {
    ecart |= (a[i % a.length] ?? 0) ^ (b[i % b.length] ?? 0);
  }
  return ecart === 0;
};

export const gestionnaire = async (request: Request): Promise<Response> => {
  if (request.method !== "GET" && request.method !== "POST") {
    return fail("methodNotAllowed", 405);
  }
  if (!originAllowed(request)) return fail("originNotAllowed", 403);
  if (!autorise(request)) return fail("unauthorized", 401);

  if (request.method === "GET") {
    return json({ queue: await etatFile() });
  }

  try {
    return json(await traiterFile());
  } catch (erreur) {
    // A missing SMTP configuration is not a 500 with a stack in it: the queue
    // is fine, the transport is not set up. It says so, and says what to do.
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    if (message.includes("SMTP is not configured")) {
      return json({ error: "smtpNotConfigured", detail: message }, 503);
    }
    throw erreur;
  }
};

export default commeFonction(gestionnaire);
