#!/usr/bin/env node
/**
 * Convertit les chaînes au pluriel ICU vers le format natif d'i18next.
 *
 * L'application écrivait `{count, plural, one {# mois} other {# mois}}`. Cette
 * syntaxe est celle du plugin `i18next-icu`, qui n'est pas installé : sans lui,
 * i18next affiche la chaîne brute, clé comprise. Le défaut est donc visible en
 * production, à toute largeur — « 1 other {# retrait en attente} » à la place du
 * texte.
 *
 * i18next sait faire les pluriels nativement, sans dépendance : il suffit de
 * suffixer les clés par `_one` et `_other`. C'est la forme attendue depuis
 * i18next v21, et c'est ce que produit l'onglet Languages de la console de
 * traduction.
 *
 * Le script ne devine pas le singulier ni le pluriel : il les extrait de la
 * chaîne existante. Une chaîne ICU qu'il ne sait pas décomposer est laissée
 * telle quelle et signalée, jamais réécrite au hasard.
 *
 *   node scripts/fix-icu-plurals.mjs --check
 *   node scripts/fix-icu-plurals.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

/**
 * Extrait les deux formes d'une chaîne ICU.
 *
 * Le motif est volontairement strict : `one {…}` et `other {…}`, avec des
 * accolades imbriquées possibles à l'intérieur (`{count}`). Une chaîne qui ne
 * correspond pas exactement est renvoyée nulle, et le script la laisse telle
 * quelle.
 */
function parseIcu(value) {
  const m = value.match(
    /^\{count,\s*plural,\s*one\s*\{((?:[^{}]|\{[^}]*\})*)\}\s*other\s*\{((?:[^{}]|\{[^}]*\})*)\}\}$/
  );
  if (!m) return null;
  return { one: m[1].trim(), other: m[2].trim() };
}

let total = 0;
let converted = 0;
const leftovers = [];

for (const locale of ["en", "fr"]) {
  const path = join(root, "src", "locales", locale, "common.json");
  const raw = await readFile(path, "utf8");
  const json = JSON.parse(raw);

  const walk = (node, trail = []) => {
    for (const [key, value] of Object.entries(node)) {
      const where = [...trail, key];
      if (value && typeof value === "object") {
        walk(value, where);
      } else if (typeof value === "string" && value.includes("plural,")) {
        total++;
        const forms = parseIcu(value);
        if (!forms) {
          leftovers.push(`${locale} : ${where.join(".")} — forme ICU non reconnue, laissée telle quelle`);
          continue;
        }
        // ICU utilise `#` comme pseudo-variable ; i18next ne le fait pas. En
        // format natif, la valeur se place par l'interpolation ordinaire, et ce
        // projet l'écrit en accolades simples (`prefix: "{"`). Le `#` doit donc
        // devenir `{count}`, sinon la forme est bien choisie — la singulier
        // s'affiche bien — mais elle affiche un dièse littéral à la place du
        // nombre.
        const toNative = (form) => form.replace(/#/g, "{count}");

        delete node[key];
        node[`${key}_one`] = toNative(forms.one);
        node[`${key}_other`] = toNative(forms.other);
        converted++;
      }
    }
  };

  walk(json);

  if (!checkOnly) {
    // Deux espaces, comme dans le fichier d'origine.
    await writeFile(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  }
}

if (leftovers.length) {
  console.log("Chaînes non converties :");
  for (const l of leftovers) console.log("  - " + l);
}

console.log(
  checkOnly
    ? `\n${converted}/${total} chaînes se convertiraient (--check, rien d'écrit)`
    : `\n${converted}/${total} chaînes converties dans en/ et fr/`
);
