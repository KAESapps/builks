#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const { discoverRules } = require("./discover");
const { selectApplicableRules, groupBySpecificity } = require("./resolver");
const { mergeSameLevel, deepMergeAcrossLevels } = require("./merge");
const { resolveFileset } = require("./filesets");

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const RESERVED_ARGS = new Set(["sourcesRoot", "out"]);

  for (const r of ["sourcesRoot", "out"]) {
    if (!args[r]) {
      console.error(`Argument manquant --${r}.`);
      console.error(
        "Usage: node src/generate.js --sourcesRoot=<path> --out=<path> " +
          "--client=<x> --project=<x> --platform=<x> --env=<x> ...",
      );
      process.exit(1);
    }
  }

  const sourcesRoot = path.resolve(args.sourcesRoot);
  const outDir = path.resolve(args.out);

  // 1. Découverte des règles par convention de nommage des dossiers.
  const { rules, dimensions } = discoverRules(sourcesRoot);

  // 2. La cible = toutes les paires --dim=valeur passées en CLI (hors args réservés).
  const target = {};
  for (const [key, value] of Object.entries(args)) {
    if (RESERVED_ARGS.has(key)) continue;
    target[key] = value;
  }

  for (const [key, value] of Object.entries(target)) {
    if (value.split("/").some((segment) => segment.length === 0)) {
      throw new Error(
        `Valeur invalide pour "--${key}" : un chemin hiérarchique doit contenir ` +
          `des segments non vides séparés par "/".`,
      );
    }
  }

  // Avertissements non bloquants : aide au diagnostic de typos, sans jamais échouer.
  for (const key of Object.keys(target)) {
    if (!dimensions.includes(key)) {
      console.warn(
        `Avertissement : "--${key}" ne correspond à aucun dossier "$${key}=..." découvert ` +
          `dans ${sourcesRoot} (vérifier une éventuelle faute de frappe).`,
      );
    }
  }

  console.log(
    `Dimensions découvertes dans l'arborescence : ${dimensions.join(", ") || "(aucune)"}`,
  );
  console.log(`Combinaison cible : ${JSON.stringify(target)}`);

  // 3. Sélection + groupement par spécificité.
  const applicable = selectApplicableRules(rules, target);

  if (applicable.length === 0) {
    throw new Error(
      "Aucune règle ne correspond à cette combinaison (même pas la racine ?).",
    );
  }

  const groups = groupBySpecificity(applicable);

  console.log("Ordre d'application (spécificité croissante) :");
  for (const group of groups) {
    console.log(
      `  [niveau ${group.specificity}] ${group.rules.map((r) => r.path).join(", ")}`,
    );
  }

  // 4. Résolution de la config, niveau par niveau.
  let config = {};
  for (const group of groups) {
    const entries = [];
    for (const rule of group.rules) {
      const configPath = path.join(rule.resolvedPath, "config.json");
      if (fs.existsSync(configPath)) {
        entries.push({
          config: JSON.parse(fs.readFileSync(configPath, "utf8")),
          source: rule.path,
          priority: rule.priority,
        });
      }
    }
    if (entries.length === 0) continue;
    const levelResult =
      entries.length === 1 ? entries[0].config : mergeSameLevel(entries);
    config = deepMergeAcrossLevels(config, levelResult);
  }

  // 5. Résolution des fichiers (assets copiés tels quels, templates rendus).
  const resolvedAssets = resolveFileset(groups, "assets");
  const resolvedTemplates = resolveFileset(groups, "templates");

  const outputOwners = new Map();
  function reserveOutputPath(relPath, source) {
    const outputPathKey = path.normalize(relPath).toLowerCase();
    const existingSource = outputOwners.get(outputPathKey);
    if (existingSource) {
      throw new Error(
        `Conflit de sortie sur "${relPath}" entre ${existingSource} et ${source}.`,
      );
    }
    outputOwners.set(outputPathKey, source);
  }

  reserveOutputPath("config.json", "la configuration");
  for (const [relPath, entry] of resolvedAssets) {
    reserveOutputPath(relPath, `l'asset de ${entry.source}`);
  }
  for (const [relPath, entry] of resolvedTemplates) {
    reserveOutputPath(
      relPath.replace(/\.ejs$/, ""),
      `le template de ${entry.source}`,
    );
  }

  // 6. Écriture du résultat.
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "config.json"),
    JSON.stringify(config, null, 2),
  );
  console.log(`Config écrite  -> config.json`);

  for (const [relPath, entry] of resolvedAssets) {
    const dest = path.join(outDir, relPath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(entry.absPath, dest);
    console.log(`Asset copié    -> ${relPath}  (source: ${entry.source})`);
  }

  const templateContext = { ...target, config };
  for (const [relPath, entry] of resolvedTemplates) {
    const destRel = relPath.replace(/\.ejs$/, "");
    const dest = path.join(outDir, destRel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const rendered = ejs.render(
      fs.readFileSync(entry.absPath, "utf8"),
      templateContext,
      {
        filename: entry.absPath,
      },
    );
    fs.writeFileSync(dest, rendered);
    console.log(`Template rendu -> ${destRel}  (source: ${entry.source})`);
  }

  console.log(`\nGénération terminée dans : ${outDir}`);
}

main();
