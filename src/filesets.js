'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/** Liste récursivement tous les fichiers d'un dossier, avec leur chemin relatif. */
function listFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  (function walk(current, rel) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const abs = path.join(current, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, relPath);
      else out.push({ absPath: abs, relPath });
    }
  })(dir, '');
  return out;
}

function hashFile(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

/**
 * Résout, niveau de spécificité par niveau de spécificité, quel fichier
 * "gagne" pour chaque chemin de destination relatif. Un niveau plus
 * spécifique écrase toujours un niveau moins spécifique. À l'intérieur d'un
 * même niveau, deux règles qui fournissent un contenu différent pour la
 * même destination sont un conflit, sauf `priority` explicite.
 *
 * groups: sortie de resolver.groupBySpecificity
 * subfolder: 'assets' ou 'templates'
 * Retourne une Map<relPath, { absPath, source }>
 */
function resolveFileset(groups, subfolder) {
  const resolved = new Map(); // relPath -> { absPath, source, specificity }

  for (const group of groups) {
    // Toutes les entrées de fichiers apportées par les règles de ce niveau.
    const levelEntries = []; // { relPath, absPath, source, priority }
    for (const rule of group.rules) {
      const dir = path.join(rule.resolvedPath, subfolder);
      for (const file of listFilesRecursive(dir)) {
        levelEntries.push({
          relPath: file.relPath,
          absPath: file.absPath,
          source: rule.path,
          priority: rule.priority ?? 0,
        });
      }
    }

    // Détection de conflit entre règles du même niveau, sur la même destination.
    const byDest = new Map();
    for (const entry of levelEntries) {
      if (!byDest.has(entry.relPath)) byDest.set(entry.relPath, []);
      byDest.get(entry.relPath).push(entry);
    }

    for (const [relPath, entries] of byDest) {
      if (entries.length === 1) {
        resolved.set(relPath, entries[0]);
        continue;
      }
      // Plusieurs règles du même niveau fournissent ce fichier : vérifier le contenu.
      const hashes = entries.map((e) => hashFile(e.absPath));
      const allIdentical = hashes.every((h) => h === hashes[0]);
      if (allIdentical) {
        resolved.set(relPath, entries[0]);
        continue;
      }
      const maxPriority = Math.max(...entries.map((e) => e.priority));
      const winners = entries.filter((e) => e.priority === maxPriority);
      if (winners.length > 1) {
        throw new Error(
          `Conflit sur le fichier "${subfolder}/${relPath}" entre les règles ` +
            `${winners.map((w) => `"${w.source}"`).join(' et ')} : même spécificité, ` +
            `contenus différents, aucune "priority" pour départager.`
        );
      }
      resolved.set(relPath, winners[0]);
    }
  }

  return resolved;
}

module.exports = { listFilesRecursive, resolveFileset };
