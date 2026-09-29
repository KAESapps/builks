# builks

Génère un dossier de build (config + assets + code) à partir de sources
organisées selon plusieurs dimensions orthogonales (client, projet,
plateforme, environnement, ...), avec un modèle de **résolution par
spécificité** inspiré de CSS/Bazel : plus une combinaison de dossiers
contraint de dimensions, plus elle est prioritaire, et elle peut cibler une
**intersection** de dimensions (ex : "projet-a" + "desktop") sans casser les
règles sur chaque dimension prise isolément.

**Aucun manifeste à écrire** : la structure des dossiers, nommés selon la
convention `$tag=value`, EST la déclaration des règles.

## Installation

```bash
npm install
```

## Utilisation

```bash
node src/generate.js \
  --sourcesRoot=example/sources \
  --out=dist/acme-projet-a-desktop-prod \
  --client=acme --project=projet-a --platform=desktop --env=prod
```

Ou, pour rejouer l'exemple fourni :

```bash
npm run demo
```

La sortie place `config.json`, les assets et les templates rendus à la
racine de `--out`. Les chemins relatifs internes à `assets/` et `templates/`
sont conservés; le suffixe `.ejs` des templates est retiré. Si plusieurs
sources produisent le même chemin final, la génération échoue au lieu d'écraser
un fichier.

```text
dist/acme-projet-a-desktop-prod/
  config.json
  logo.svg
  api-client.js
```

## Convention de nommage

```
sources/
  config.json                      # base (0 dimension), s'applique toujours
  assets/logo.svg
  templates/api-client.js.ejs

  $client=acme/                    # 1 dimension : client
    config.json
    assets/logo.svg

  $platform=desktop/               # 1 dimension : platform
    config.json

  $project=projet-a/               # 1 dimension : project
    config.json
    $platform=desktop/             # 2 dimensions (intersection) : LE cas complexe
      config.json
      templates/api-client.js.ejs  # template structurellement différent

  $project=programme-a/
    config.json                    # projet parent : commun à ses descendants
    $project=application-mobile/
      config.json                  # sous-projet : surcharge le parent
      $project=ios/
        config.json                # niveau encore plus spécifique

  $client=acme/                    # une autre dimension indépendante
    $platform=desktop/
      $env=prod/                   # 3 dimensions, réglage très ciblé
        config.json
```

Règles de la convention :

- Un dossier nommé `$tag=value` ajoute une contrainte à la combinaison
  accumulée depuis la racine (tout avant le premier `=` est le nom de la
  dimension, tout après est la valeur).
- Répéter un même tag le long d'une branche crée une hiérarchie pour cette
  dimension. Par exemple `$project=programme-a/$project=application-mobile`
  décrit un sous-projet. La cible CLI donne le chemin complet avec `/` :
  `--project=programme-a/application-mobile`. Les segments sont comparés
  séparément, et les règles d'un ancêtre s'appliquent à ses descendants.
- Dès qu'un dossier contient `config.json`, `assets/` ou `templates/`, il
  devient une règle. Sa **spécificité** = nombre total de segments de
  contraintes accumulés entre la racine et lui. Ainsi, un enfant est plus
  spécifique que son parent.
- **L'imbrication n'a pas besoin d'être uniforme** : `$project=projet-a/$platform=desktop`
  et `$client=acme/$project=projet-a/$platform=desktop/$env=prod` sont deux
  branches indépendantes de l'arbre ; seul l'ensemble des contraintes
  accumulées compte pour la résolution, pas l'ordre choisi pour les ranger
  sur le disque.
- `assets` et `templates` sont des noms réservés : jamais interprétés comme
  des segments de dimension.

## Algorithme de résolution

1. **Découverte** : parcours récursif de `sourcesRoot`, accumulation des
   contraintes `dim=valeur` le long de chaque branche (`src/discover.js`).
2. **Sélection** : on garde les règles dont toutes les contraintes
   accumulées correspondent à la combinaison demandée en CLI (les
   dimensions non contraintes par une règle sont des wildcards).
3. **Groupement par spécificité** croissante.
4. **Application dans cet ordre** : une règle plus spécifique écrase une
   règle moins spécifique. Une règle à 2 dimensions (ex :
   `$project=projet-a/$platform=desktop`) l'emporte donc sur les règles à
   1 dimension correspondantes (`$project=projet-a` seul, `$platform=desktop`
   seul).
5. **Conflits de même spécificité** : si deux règles au même niveau
   donnent des valeurs différentes pour la même clé de config ou le même
   fichier de sortie, la génération **échoue avec une erreur explicite**
   plutôt que de deviner — sauf si l'une des règles porte un `priority` plus
   élevé (voir ci-dessous).

Une hiérarchie et une dimension orthogonale peuvent produire la même
spécificité, par exemple une règle sur `programme-a/application-mobile`
(2 segments de projet) et une règle sur `programme-a` + `platform=ios`
(1 segment de projet + 1 de plateforme). Elles sont alors considérées comme
des règles de même niveau : un conflit sur une même clé ou destination doit
être résolu avec `priority` ou en réorganisant les règles.

## Départager un conflit : `meta.json`

Si deux dossiers de même spécificité doivent réellement se chevaucher (cas
rare, à éviter si possible en restructurant l'arborescence), on peut
déposer un `meta.json` optionnel dans l'un des deux dossiers :

```json
{ "priority": 1 }
```

La règle avec la priorité la plus haute gagne. Sans `meta.json`, la
priorité implicite est 0 pour toutes les règles.

## Avertissements de diagnostic

- Un `--xyz=...` passé en CLI qui ne correspond à aucun dossier `xyz=...`
  découvert dans l'arborescence déclenche un avertissement (protection
  contre les fautes de frappe), sans bloquer la génération.
- Les dossiers dont le nom ne suit pas la convention `dim=valeur` (et qui ne
  sont ni `assets` ni `templates`) sont simplement ignorés.

## Étendre le générateur

- **Fusion plus fine des configs** (ex: stratégie par clé pour les
  tableaux) : `src/merge.js`.
- **Génération structurelle de code** (au-delà des templates texte EJS) :
  remplacer/compléter les `.ejs` par une passe AST (Babel / ts-morph) si les
  surcharges deviennent trop complexes pour du texte.
- **Intégration Nx** : envelopper `src/generate.js` dans un generator Nx
  custom qui appelle ce script avec les bons paramètres selon le
  projet/la cible Nx.

## Structure de l'exemple fourni

```
example/sources/
  config.json, assets/, templates/          # base
  $client=acme/                             # 1 dimension
  $platform=desktop/                        # 1 dimension
  $project=projet-a/                        # 1 dimension
    $platform=desktop/                      # 2 dimensions : LE cas complexe
    $client=acme/$platform=desktop/$env=prod/ # 4 dimensions, ciblage précis
```

Essayez `--platform=mobile` au lieu de `--platform=desktop` sur la même
commande : la règle `$project=projet-a/$platform=desktop` ne s'applique plus,
et le générateur retombe proprement sur `$project=projet-a` seul et le
template de base (sans l'auto-updater Electron).
