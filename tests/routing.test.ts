/**
 * The deployment must serve the application on every route, not only on `/`.
 *
 * A single-page application routes in the browser. A deep link such as
 * `/client/deposits` never reaches the server on the first request — and on
 * every refresh it does, and gets whatever the static host answers. Without a
 * fallback, that answer is a 404 and the client sees a page that does not
 * exist, for a page that exists.
 *
 * This is not hypothetical: it was the state of the deployment. Vercel's Vite
 * preset had produced this routing table —
 *
 *     { "handle": "filesystem" }
 *     { "src": "^/api(/.*)?$", "status": 404 }
 *     { "handle": "error" }
 *     { "status": 404, "src": "^(?!/api).*$", "dest": "/404.html" }
 *
 * — with no rewrite at all. Every file was served, and everything else was a
 * 404. Only `/` worked, which is why it went unnoticed: nobody navigates to
 * `/`.
 *
 * The two properties tested here are the two ways this breaks again: the
 * fallback disappears, or it appears in a form that swallows `/api` and takes
 * the server functions with it.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const racine = join(import.meta.dirname, "..", "..");

interface VercelJson {
  framework?: string;
  rewrites?: { source: string; destination: string }[];
}

const lireConfig = (): VercelJson => {
  const chemin = join(racine, "vercel.json");
  assert.ok(
    existsSync(chemin),
    "vercel.json est absent : sans lui, Vercel ne sert index.html que sur `/` " +
      "et toute route profonde renvoie 404 au premier rafraîchissement",
  );
  return JSON.parse(readFileSync(chemin, "utf-8")) as VercelJson;
};

test("le repli vers index.html est déclaré", () => {
  const config = lireConfig();
  const reponses = config.rewrites ?? [];
  const repli = reponses.find((r) => r.destination === "/index.html");

  assert.ok(
    repli,
    `aucune réécriture vers /index.html dans ${JSON.stringify(config.rewrites)}`,
  );
});

test("le repli épargne /api, sinon les fonctions serveur meurent", () => {
  // C'est la faute inverse, et elle est plus grave : une réécriture
  // « tout sauf les fichiers » vers index.html renvoie la page HTML à la place
  // de /api/register, et la fonction n'est plus jamais appelée. Elle ne lève
  // pas d'erreur, elle n'est simplement plus là.
  const { rewrites = [] } = lireConfig();

  for (const regle of rewrites.filter((r) => r.destination === "/index.html")) {
    assert.match(
      regle.source,
      /\(\?!api\/\)/,
      `« ${regle.source} » ne distingue pas /api : les fonctions serveur seraient servies en HTML`,
    );
  }
});

test("le framework reste déclaré, pour que la détection ne bascule pas", () => {
  // Un `vercel.json` remplace la détection de framework. Sans `framework`, la
  // construction peut changer de forme du jour au lendemain — ce qui est
  // arrivé sur ce projet : la table de routage est passée de « fichier ou 404 »
  // à « fichier, repli, 404 ».
  assert.equal(lireConfig().framework, "vite", "le framework n'est pas déclaré");
});

test("la table de routage construite contient bien le repli", () => {
  /*
    Le fichier n'existe qu'après `vercel build`. Ce test ne l'exige pas : il
    vérifie ce qui a été construit s'il y a eu une construction, et se tait
    sinon. C'est la table réellement produite qui décide, pas l'intention
    déclarée dans `vercel.json`.
  */
  const chemin = join(racine, ".vercel", "output", "config.json");
  if (!existsSync(chemin)) return;

  const config = JSON.parse(readFileSync(chemin, "utf-8")) as {
    routes?: { src?: string; dest?: string; status?: number }[];
  };
  const routes = config.routes ?? [];

  // La destination porte le nom du fichier, la source porte l'exclusion : les
  // deux sont sur la même règle.
  const estRepli = (r: { src?: string; dest?: string }) =>
    r.dest === "/index.html" && (r.src ?? "").includes("(?!api/)");

  assert.ok(
    routes.some(estRepli),
    `la table construite n'a pas de repli vers index.html :\n${JSON.stringify(routes, null, 2)}`,
  );

  // Le repli doit venir AVANT le 404 des routes /api, sinon il n'est jamais
  // atteint pour une route qui n'est pas un fichier.
  const repli = routes.findIndex(estRepli);
  const quatreCentsQuatre = routes.findIndex((r) => r.status === 404);
  assert.ok(
    repli !== -1 && (quatreCentsQuatre === -1 || repli < quatreCentsQuatre),
    "le repli vient après le 404 : il ne sera jamais atteint",
  );
});
