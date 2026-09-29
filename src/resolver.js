'use strict';

function hierarchySegments(value, context) {
  const segments = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('/')
      : [];
  if (
    segments.length === 0 ||
    segments.some((segment) => typeof segment !== 'string' || segment.length === 0)
  ) {
    throw new Error(`Chemin hiérarchique invalide pour "${context}".`);
  }
  return segments;
}

/**
 * Sélectionne, parmi toutes les règles du manifeste, celles qui s'appliquent
 * à la combinaison cible (target), c'est-à-dire celles dont TOUTES les
 * dimensions déclarées dans `when` correspondent à la cible. Les contraintes
 * dont une dimension apparaît plusieurs fois forment un chemin hiérarchique
 * qui doit être un préfixe du chemin indiqué dans la cible.
 * Les dimensions non déclarées dans `when` sont des wildcards implicites.
 */
function selectApplicableRules(rules, target) {
  return rules
    .filter((rule) => {
      const when = rule.when || {};
      return Object.entries(when).every(([dim, value]) => {
        if (target[dim] === undefined) return false;
        const constraint = hierarchySegments(value, `règle ${rule.path}, dimension ${dim}`);
        const targetPath = hierarchySegments(target[dim], `cible, dimension ${dim}`);
        return (
          constraint.length <= targetPath.length &&
          constraint.every((segment, index) => targetPath[index] === segment)
        );
      });
    })
    .map((rule) => ({
      ...rule,
      specificity: Object.values(rule.when || {}).reduce(
        (total, value) => total + hierarchySegments(value, `règle ${rule.path}`).length,
        0,
      ),
    }));
}

/**
 * Regroupe les règles par spécificité croissante (0 = base, N = la plus
 * spécifique). Retourne un tableau de groupes, dans l'ordre d'application.
 */
function groupBySpecificity(rules) {
  const groups = new Map();
  for (const rule of rules) {
    if (!groups.has(rule.specificity)) groups.set(rule.specificity, []);
    groups.get(rule.specificity).push(rule);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([specificity, rules]) => ({ specificity, rules }));
}

module.exports = { selectApplicableRules, groupBySpecificity };
