/**
 * The bridge between the two shapes of a request.
 *
 * Vercel launches a function with `launcherType: Nodejs` and `handler:
 * api/register.js` — it calls the module with a Node `(request, response)`
 * pair. It does not start a server: a function that calls `listen()` and
 * returns exits immediately, which is why the 500 said nothing.
 *
 * The handlers themselves are written against the Web `Request` and
 * `Response`. That is not a preference — it is what makes them testable
 * without a socket, and what lets the same code serve a test, a local server
 * and the platform. This module is the only place that knows the other shape
 * exists, and it is a translation in both directions with no logic of its own:
 * a wrong status code or a dropped header would be a defect here, and nowhere
 * else.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** What a handler is: Web in, Web out. */
export type Gestionnaire = (request: Request) => Promise<Response>;

/** A Node request as a Web one. */
export const versLaRequete = async (requete: IncomingMessage): Promise<Request> => {
  const url = new URL(requete.url ?? "/", `http://${requete.headers.host ?? "localhost"}`);

  const entetes = new Headers();
  for (const [nom, valeur] of Object.entries(requete.headers)) {
    if (typeof valeur === "string") entetes.set(nom, valeur);
    else if (Array.isArray(valeur)) for (const v of valeur) entetes.append(nom, v);
  }

  // The body exists only for the methods that carry one. Asking for it on a
  // GET would leave the request stream unconsumed and the socket open.
  let corps: string | undefined;
  if (requete.method !== "GET" && requete.method !== "HEAD") {
    const morceaux: Buffer[] = [];
    for await (const morceau of requete) morceaux.push(morceau as Buffer);
    corps = Buffer.concat(morceaux).toString("utf-8");
  }

  return new Request(url, {
    method: requete.method,
    headers: entetes,
    body: corps,
    // Vercel populates `request.query`; the URL carries them too, and the URL is
    // what the handlers read, so nothing is lost by preferring it.
    duplex: "half",
  } as RequestInit);
};

/** A Web response as a Node one. */
export const versLaReponse = async (reponse: Response, sortie: ServerResponse): Promise<void> => {
  sortie.statusCode = reponse.status;
  reponse.headers.forEach((valeur, nom) => sortie.setHeader(nom, valeur));
  const texte = await reponse.text();
  sortie.end(texte);
};

/**
 * Wraps a Web handler as the `(request, response)` entry point the runtime
 * calls.
 *
 * The catch is here rather than in each handler: an error that escapes is a 500
 * with nothing of the internals in it, because a Postgres message can name a
 * table, a column and a value, and none of that belongs in a response.
 */
export const commeFonction = (gestionnaire: Gestionnaire) =>
  (requete: IncomingMessage, reponse: ServerResponse): void => {
    void (async () => {
      try {
        await versLaReponse(await gestionnaire(await versLaRequete(requete)), reponse);
      } catch (erreur) {
        console.error("api:", erreur);
        if (!reponse.headersSent) {
          reponse.statusCode = 500;
          reponse.setHeader("Content-Type", "application/json");
          reponse.end(JSON.stringify({ error: "internalError" }));
        } else {
          reponse.end();
        }
      }
    })();
  };
