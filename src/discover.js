"use strict";

const fs = require("fs");
const path = require("path");

// Noms de dossiers réservés au contenu d'une règle, jamais interprétés
// comme des segments de dimension.
const RESERVED_DIRS = new Set(["assets", "templates"]);

// Un dossier "$tag=value" : le tag devient le nom de la dimension, et tout
// ce qui suit le premier "=" (y compris d'éventuels "=") est la valeur.
const TAG_DIR_RE = /^\$([^=]+)=(.+)$/;

function hasRuleContent(dir) {
  return (
    fs.existsSync(path.join(dir, "config.json")) ||
    fs.existsSync(path.join(dir, "assets")) ||
    fs.existsSync(path.join(dir, "templates"))
  );
}

/**
 * Lit un éventuel meta.json (optionnel) déposé dans le dossier d'une règle,
 * pour porter des métadonnées comme `priority` (utile uniquement en cas de
 * conflit réel entre deux règles de même spécificité).
 */
function readMeta(dir) {
  const metaPath = path.join(dir, "meta.json");
  if (!fs.existsSync(metaPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (e) {
    throw new Error(`meta.json invalide dans "${dir}": ${e.message}`);
  }
}

/**
 * Parcourt récursivement `sourcesRoot`. Chaque sous-dossier dont le nom suit
 * la convention "$tag=value" ajoute une contrainte à la combinaison
 * accumulée depuis la racine. Dès qu'un dossier contient `config.json`,
 * `assets/` ou `templates/`, il devient une règle, avec pour spécificité le
 * nombre de contraintes accumulées jusqu'à lui.
 *
 * L'ordre d'imbrication n'a pas d'incidence sur la résolution : seule
 * l'ensemble des contraintes accumulées (le "when") compte, pas le chemin
 * choisi pour les organiser sur le disque.
 */
function discoverRules(sourcesRoot) {
  const rules = [];
  const dimensions = new Set();

  function walk(dir, when, relPath) {
    if (hasRuleContent(dir)) {
      const meta = readMeta(dir);
      rules.push({
        when: { ...when },
        path: relPath || ".",
        resolvedPath: dir,
        priority: meta.priority,
      });
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (RESERVED_DIRS.has(entry.name)) continue;
      const match = entry.name.match(TAG_DIR_RE);
      if (!match) continue; // dossier hors convention : ignoré silencieusement
      const [, tag, value] = match;
      dimensions.add(tag);
      const nextWhen = { ...when };
      if (Object.hasOwn(when, tag)) {
        const previous = Array.isArray(when[tag]) ? when[tag] : [when[tag]];
        nextWhen[tag] = [...previous, value];
      } else {
        nextWhen[tag] = value;
      }
      walk(
        path.join(dir, entry.name),
        nextWhen,
        relPath ? `${relPath}/${entry.name}` : entry.name,
      );
    }
  }

  walk(sourcesRoot, {}, "");
  return { rules, dimensions: [...dimensions] };
}

module.exports = { discoverRules };
