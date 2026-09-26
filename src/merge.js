'use strict';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Fusionne plusieurs configs appartenant au MÊME niveau de spécificité.
 * En cas de valeur différente sur la même clé, sans `priority` explicite
 * pour départager, une erreur est levée plutôt que de deviner.
 *
 * entries: [{ config: object, source: string, priority?: number }]
 */
function mergeSameLevel(entries) {
  const result = {};
  // Trace, pour chaque chemin de clé, qui a écrit la valeur en dernier et avec quelle priorité.
  const provenance = new Map();

  function mergeInto(target, srcObj, srcName, priority, pathParts) {
    for (const key of Object.keys(srcObj)) {
      const fullPath = [...pathParts, key];
      const pathStr = fullPath.join('.');
      const incoming = srcObj[key];

      if (isPlainObject(incoming) && isPlainObject(target[key])) {
        mergeInto(target[key], incoming, srcName, priority, fullPath);
        continue;
      }

      const prev = provenance.get(pathStr);
      if (prev) {
        const sameValue = JSON.stringify(prev.value) === JSON.stringify(incoming);
        if (!sameValue) {
          if (prev.priority === (priority ?? 0)) {
            throw new Error(
              `Conflit de configuration sur "${pathStr}" entre les règles ` +
                `"${prev.source}" et "${srcName}" : même spécificité, ` +
                `aucune "priority" pour départager (valeurs: ${JSON.stringify(
                  prev.value
                )} vs ${JSON.stringify(incoming)}).`
            );
          }
          if ((priority ?? 0) < prev.priority) {
            // La valeur déjà en place a une priorité plus haute : on ignore l'entrante.
            continue;
          }
        }
      }

      target[key] = incoming;
      provenance.set(pathStr, { value: incoming, source: srcName, priority: priority ?? 0 });
    }
  }

  // L'ordre entre entrées de même spécificité n'a pas d'importance tant qu'il n'y a
  // pas de conflit réel ; en cas de conflit réel, `priority` doit trancher explicitement.
  for (const entry of entries) {
    mergeInto(result, entry.config, entry.source, entry.priority ?? 0, []);
  }
  return result;
}

/**
 * Fusionne le résultat d'un niveau de spécificité (overlay) par-dessus
 * l'accumulateur des niveaux précédents (base). Ici pas de détection de
 * conflit : un niveau plus spécifique écrase toujours un niveau moins
 * spécifique, par définition.
 */
function deepMergeAcrossLevels(base, overlay) {
  if (!isPlainObject(base)) return overlay;
  if (!isPlainObject(overlay)) return overlay;
  const result = { ...base };
  for (const key of Object.keys(overlay)) {
    if (isPlainObject(overlay[key]) && isPlainObject(base[key])) {
      result[key] = deepMergeAcrossLevels(base[key], overlay[key]);
    } else {
      result[key] = overlay[key];
    }
  }
  return result;
}

module.exports = { mergeSameLevel, deepMergeAcrossLevels, isPlainObject };
