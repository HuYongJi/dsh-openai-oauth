import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BEGIN, END, patchText, setup } from '../scripts/setup.mjs';

async function fixture(t, original = '# desktop profile\r\n- id: agent-default-model\r\n  config: {}\r\n') {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-oauth-release-test-'));
  t.after(async () => { assert.ok(dir.startsWith(tmpdir())); await rm(dir, { recursive: true, force: true }); });
  const root = join(dir, 'Plugin with spaces #汉字');
  const patch = join(dir, 'cordis.patch.yml');
  await mkdir(join(root, 'lib'), { recursive: true });
  for (const name of ['index.js', 'client.js', 'fast.js']) await writeFile(join(root, 'lib', name), 'export {}\n');
  await writeFile(patch, original);
  return { dir, root, patch, original };
}

test('installation preserves profile, line endings and URL encodes portable path', async t => {
  const { patch, root, original, dir } = await fixture(t);
  const check = await setup('install', { patchPath: patch, pluginRoot: root, dryRun: true });
  assert.equal(check.changed, true);
  assert.equal(await readFile(patch, 'utf8'), original);
  assert.equal((await readdir(dir)).some(name => name.endsWith('.bak')), false);
  const result = await setup('install', { patchPath: patch, pluginRoot: root });
  assert.ok(result.backup);
  assert.equal(await readFile(result.backup, 'utf8'), original);
  const text = await readFile(patch, 'utf8');
  assert.ok(text.startsWith(original));
  assert.ok(text.includes(BEGIN + '\r\n'));
  assert.ok(text.includes('name: ' + JSON.stringify(pathToFileURL(join(root, 'lib', 'index.js')).href)));
  assert.ok(!text.replaceAll('\r\n', '').includes('\n'));
  const again = await setup('install', { patchPath: patch, pluginRoot: root });
  assert.equal(again.changed, false);
  assert.equal(again.backup, undefined);
  const removed = await setup('uninstall', { patchPath: patch, pluginRoot: root });
  assert.equal(removed.changed, true);
  assert.equal(await readFile(patch, 'utf8'), original);
  assert.equal((await setup('uninstall', { patchPath: patch, pluginRoot: root })).changed, false);
});

test('upgrade changes only the owned plugin entry and backs up existing profile', async t => {
  const { patch, root } = await fixture(t);
  await setup('install', { patchPath: patch, pluginRoot: root });
  const before = await readFile(patch, 'utf8');
  const next = join(root, 'new location');
  await mkdir(join(next, 'lib'), { recursive: true });
  for (const name of ['index.js', 'client.js', 'fast.js']) await writeFile(join(next, 'lib', name), 'export {}\n');
  const { backup } = await setup('install', { patchPath: patch, pluginRoot: next });
  assert.equal(await readFile(backup, 'utf8'), before);
  const updated = await readFile(patch, 'utf8');
  assert.equal(updated.split(BEGIN).length, 2);
  assert.ok(updated.includes(pathToFileURL(join(next, 'lib', 'index.js')).href));
  assert.ok(updated.includes('- id: agent-default-model'));
});

test('foreign or incomplete entries fail without writing backups', async t => {
  const { patch, root, dir } = await fixture(t);
  const bad = ['- insert:\n    - id: openai-oauth-ui\n      name: file:///old/index.js\n', BEGIN + '\n- insert:\n'];
  for (const text of bad) {
    await writeFile(patch, text);
    await assert.rejects(setup('install', { patchPath: patch, pluginRoot: root }), /unmarked|Incomplete/);
    assert.equal(await readFile(patch, 'utf8'), text);
  }
  assert.equal((await readdir(dir)).some(name => name.endsWith('.bak')), false);
  assert.throws(() => patchText(BEGIN + '\n' + END + '\n' + BEGIN + '\n' + END, 'uninstall'), /Ambiguous/);
});

test('build outputs are required and uninstall never removes unrelated data', async t => {
  const { root, patch, original } = await fixture(t);
  const emptyRoot = join(root, 'missing');
  await assert.rejects(setup('install', { patchPath: patch, pluginRoot: emptyRoot }), /ENOENT/);
  assert.equal((await setup('uninstall', { patchPath: patch, pluginRoot: emptyRoot })).changed, false);
  assert.equal(await readFile(patch, 'utf8'), original);
});
