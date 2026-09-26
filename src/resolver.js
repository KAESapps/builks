'use strict';

/**
 * Sélectionne, parmi toutes les règles du manifeste, celles qui s'appliquent
 * à la combinaison cible (target), c'est-à-dire celles dont TOUTES les
 * dimensions déclarées dans `when` correspondent à la cible.
 * Les dimensions non déclarées dans `when` sont des wildcards implicites.
 */
function selectApplicableRules(rules, target) {
  return rules
    .filter((rule) => {
      const when = rule.when || {};
      return Object.entries(when).every(([dim, val]) => target[dim] === val);
    })
    .map((rule) => ({
      ...rule,
      specificity: Object.keys(rule.when || {}).length,
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
