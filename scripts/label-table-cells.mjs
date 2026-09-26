#!/usr/bin/env node
/**
 * Pose `label={t("…")}` sur les cellules de données des tableaux, en suivant
 * l'ordre des colonnes d'en-tête.
 *
 * C'est mécanique, donc le faire à la main serait sept fois plus lent et
 * sept fois plus sujet à l'erreur : une cellule oubliée donne une ligne de
 * carte sans intitulé, ce qui est exactement le défaut que le patron corrige.
 *
 * Le script ne devine rien. Il lit les en-têtes du tableau, compte les
 * cellules de données, et refuse de continuer si les deux ne correspondent
 * pas — un tableau à ligne d'en-tête groupée (`colSpan`) ne correspond jamais,
 * et il vaut mieux un avertissement qu'un libellé posé sur la mauvaise cellule.
 *
 *   node scripts/label-table-cells.mjs            # vérifie et applique
 *   node scripts/label-table-cells.mjs --check    # vérifie sans écrire
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = join(root, "src", "components");
const checkOnly = process.argv.includes("--check");

/** Fichiers contenant au moins un vrai tableau. */
async function tableFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "ui") found.push(...(await tableFiles(path)));
    } else if (entry.name.endsWith(".tsx")) {
      const text = await readFile(path, "utf8");
      if (text.includes("<TableBody>")) found.push({ path, text });
    }
  }
  return found;
}

const problems = [];
const changed = [];

/** Translations used in the header row of a given table. */
function headerLabels(text) {
  const thead = text.slice(
    text.indexOf("<TableHeader"),
    text.indexOf("</TableHeader>")
  );
  return [...thead.matchAll(/\{t\(\s*"([^"]+)"\s*\)\}/g)].map((m) => m[1]);
}

/**
 * Adds `label={t("…")}` to the first `labels.length` <TableCell> of each
 * body row, if it doesn't already carry one.
 */
function labelBody(text, labels) {
  const bodyStart = text.indexOf("<TableBody>");
  const head = text.slice(0, bodyStart);
  let body = text.slice(bodyStart);

  // Split on the row boundary, so each row is processed independently: the
  // number of cells per row is what tells us the columns.
  const rows = body.split(/(?=<TableRow)/);

  const out = rows.map((row, index) => {
    if (index === 0 || !row.includes("<TableCell")) return row;

    // Cells only — <TableRow> itself may carry i18n for its own attributes.
    const cellMatches = [...row.matchAll(/<TableCell(\s|\/|>)/g)];
    if (cellMatches.length === 0) return row;

    if (cellMatches.length !== labels.length) {
      problems.push(
        `${row.length > 0 ? "" : ""}ligne ${index} : ${cellMatches.length} cellules pour ${labels.length} colonnes`
      );
      return row;
    }

    let cell = 0;
    return row.replace(
      /<TableCell(\s[^>]*?)?(\/?>)/g,
      (match, attrs = "", close) => {
        if (attrs.includes("label=")) return match;
        // Une cellule auto-fermante n'accepterait pas un attribut enfant.
        if (close === "/>") return match;
        const label = labels[cell++];
        // L'espace initial est dans `attrs` quand il y en a un, et doit être
        // reconstruit quand il n'y en a pas : sans lui, `<TableCell` et
        // `className` se soudent en un nom d'élément qui n'existe pas.
        // `attrs` commence déjà par une espace quand il n'est pas vide ; il en
        // faut une autre entre la dernière valeur et l'attribut suivant, sinon
        // `className="ps-5"label=…`. C'est valide, illisible, et fragile : le
        // jour où un validateur reformate, la ligne saute.
        const merged = attrs
          ? `${attrs} label={t("${label}")} `
          : ` label={t("${label}")}`;
        return `<TableCell${merged}${close}`;
      }
    );
  });

  return head + out.join("");
}

for (const { path, text } of await tableFiles(componentsDir)) {
  const labels = headerLabels(text);
  if (labels.length === 0) continue;

  const bodyStart = text.indexOf("<TableBody>");
  const firstRow = text
    .slice(bodyStart)
    .split(/(?=<TableRow)/)
    .slice(1)
    .find((r) => r.includes("<TableCell"));
  const cells = firstRow
    ? [...firstRow.matchAll(/<TableCell(\s|\/|>)/g)].length
    : 0;

  if (cells !== labels.length) {
    problems.push(
      `${path.replace(root + "/", "")} : ${labels.length} colonnes, ${cells} cellules par ligne`
    );
    continue;
  }

  const before = text;
  const after = labelBody(before, labels);
  if (after !== before) {
    changed.push(path.replace(root + "/", ""));
    if (!checkOnly) await writeFile(path, after, "utf8");
  }
}

if (problems.length) {
  console.log("Tableaux non traités — le nombre de cellules ne correspond pas :");
  for (const p of problems) console.log("  - " + p);
  console.log("\nCes tableaux gardent le défilement horizontal. C'est un repli, pas un défaut.");
}

console.log(
  checkOnly
    ? `\n${changed.length} tableau(x) ajouteraient un libellé (--check, rien d'écrit)`
    : `\n${changed.length} tableau(x) étiqueté(s) :\n${changed.map((c) => "  " + c).join("\n")}`
);
