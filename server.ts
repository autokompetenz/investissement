/**
 * The HTTP entry point, in the form Vercel documents for Node.
 *
 * `server.ts` at the project root is the entry point Vercel looks for when a
 * project runs a server rather than a set of functions. The file calls
 * `listen()` at module load; Vercel detects the call, routes to it through an
 * internal port, and the port is not public.
 *
 * The alternative — a file per route in `/api` — is documented as needing no
 * configuration either, and neither works here: the Vite preset claims the
 * build output and the functions never reach the deployment. Measured on this
 * project, `vercel build` produced `register.func` and `admin-accounts.func`
 * locally and nothing at all once deployed, across a dozen attempts that
 * included the preset, the `functions/` directory, the `.mts` extension and
 * three spellings of the runtime. A single entry point sidesteps the question:
 * there is nothing to detect, because the whole server is one file.
 *
 * The routes are assembled by hand — three of them, and a lookup is clearer
 * than a framework for that.
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

type Gestionnaire = (request: Request) => Promise<Response>;

const register = (await import("./api/register.ts")).default as Gestionnaire;
const adminAccounts = (await import("./api/admin-accounts.ts")).default as Gestionnaire;

/** How a Node request becomes a Web one, which is what the handlers take. */
const verserLaRequete = async (requete: IncomingMessage): Promise<Request> => {
  const url = new URL(requete.url ?? "/", `http://${requete.headers.host ?? "localhost"}`);

  const entetes = new Headers();
  for (const [nom, valeur] of Object.entries(requete.headers)) {
    if (typeof valeur === "string") entetes.set(nom, valeur);
    else if (Array.isArray(valeur)) for (const v of valeur) entetes.append(nom, v);
  }

  // The body is only read for a method that has one. `GET` has none, and asking
  // for it would leave the request stream unconsumed.
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
  });
};

/** How a Web response becomes a Node one. */
const verserLaReponse = (reponse: Response, sortie: ServerResponse): void => {
  sortie.statusCode = reponse.status;
  reponse.headers.forEach((valeur, nom) => sortie.setHeader(nom, valeur));
  void reponse.text().then((texte) => sortie.end(texte));
};

const ROUTES: Record<string, Gestionnaire> = {
  "/api/register": register,
  "/api/admin-accounts": adminAccounts,
};

const serveur = createServer((requete, sortie) => {
  void (async () => {
    try {
      const chemin = new URL(requete.url ?? "/", "http://localhost").pathname.replace(/\/$/, "");
      const gestionnaire = ROUTES[chemin] ?? ROUTES[`${chemin}/`];

      if (!gestionnaire) {
        sortie.statusCode = 404;
        sortie.setHeader("Content-Type", "application/json");
        sortie.end(JSON.stringify({ error: "notFound" }));
        return;
      }

      verserLaReponse(await gestionnaire(await verserLaRequete(requete)), sortie);
    } catch (erreur) {
      // A thrown error is a 500 with nothing of the internals in it: a Postgres
      // message can name a table, a column and a value.
      console.error("api:", erreur);
      sortie.statusCode = 500;
      sortie.setHeader("Content-Type", "application/json");
      sortie.end(JSON.stringify({ error: "internalError" }));
    }
  })();
});

serveur.listen(Number(process.env.PORT ?? 3000));
