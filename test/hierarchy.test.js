'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { discoverRules } = require('../src/discover');
const { selectApplicableRules, groupBySpecificity } = require('../src/resolver');

test('repeated dimension folders form a hierarchical constraint path', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'builks-hierarchy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const child = path.join(
    root,
    '$project=programme-a',
    '$platform=ios',
    '$project=application-mobile',
  );
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(child, 'config.json'), '{}');

  const { rules } = discoverRules(root);
  assert.deepEqual(rules[0].when, {
    project: ['programme-a', 'application-mobile'],
    platform: 'ios',
  });
});

test('ancestor rules apply to descendant targets in increasing specificity', () => {
  const rules = [
    { path: 'parent', when: { project: 'programme-a' } },
    { path: 'child', when: { project: ['programme-a', 'application-mobile'] } },
    { path: 'sibling', when: { project: ['programme-a', 'application-web'] } },
    { path: 'platform', when: { platform: 'ios' } },
  ];

  const applicable = selectApplicableRules(rules, {
    project: 'programme-a/application-mobile/ios',
    platform: 'ios',
  });
  const groups = groupBySpecificity(applicable);

  assert.deepEqual(
    groups.map(({ specificity, rules: groupRules }) => ({
      specificity,
      paths: groupRules.map((rule) => rule.path),
    })),
    [
      { specificity: 1, paths: ['parent', 'platform'] },
      { specificity: 2, paths: ['child'] },
    ],
  );
});

test('hierarchical matching compares complete segments', () => {
  const rules = [
    { path: 'app', when: { project: 'app' } },
    { path: 'application', when: { project: 'application' } },
  ];

  assert.deepEqual(
    selectApplicableRules(rules, { project: 'application/ios' }).map((rule) => rule.path),
    ['application'],
  );
});

test('generator merges parent project config before child project config', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'builks-generate-hierarchy-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const sources = path.join(root, 'sources');
  const parent = path.join(sources, '$project=programme-a');
  const child = path.join(parent, '$project=application-mobile');
  const out = path.join(root, 'out');
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(path.join(parent, 'config.json'), '{"scope":"parent"}');
  fs.writeFileSync(path.join(child, 'config.json'), '{"scope":"child"}');

  const result = spawnSync(
    process.execPath,
    [
      path.resolve(__dirname, '../src/generate.js'),
      `--sourcesRoot=${sources}`,
      `--out=${out}`,
      '--project=programme-a/application-mobile',
    ],
    { encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, 'config.json'), 'utf8')), {
    scope: 'child',
  });
});
