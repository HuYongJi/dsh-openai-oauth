import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { runInNewContext } from 'node:vm';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));

test('DSH bundle declares one portable Host entry without changing user configuration', async () => {
  const patch = manifest.dsh?.bundle?.patch;
  assert.equal(patch, './cordis.bundle.json');
  assert.equal(isAbsolute(patch), false);
  assert.ok(!patch.split('/').includes('..'));
  const entries = JSON.parse(await readFile(new URL(patch, root), 'utf8'));
  assert.deepEqual(entries, [{ insert: [{ id: 'openai-oauth-ui', name: manifest.name }] }]);
  // No model selection, credentials, Fast preference or verify-on-load config is added.
  assert.equal(manifest.name, 'dsh-openai-oauth');
});

test('bundle retains the existing Host and web-client entry points', async () => {
  assert.equal(manifest.main, 'lib/index.js');
  assert.equal(manifest.exports['.'], './lib/index.js');
  assert.equal(manifest.exports['./client'], './lib/client.js');
  assert.equal(manifest.exports['./package.json'], './package.json');
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'));
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings-models'));
  for (const file of ['lib/index.js', 'lib/client.js', 'lib/fast.js', 'lib/verify.js', 'scripts/setup.mjs']) {
    assert.equal((await stat(new URL(file, root))).isFile(), true, file);
  }
  const host = await import('../lib/index.js');
  assert.equal(host.name, 'openai-oauth-ui');
  assert.equal(typeof host.apply, 'function');
  let registered;
  runInNewContext(await readFile(new URL(manifest.exports['./client'], root), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { registered = value; } } },
  });
  assert.equal(registered.id, manifest.name);
  assert.equal(typeof registered.factory, 'function');
});

test('installation package uses a source-and-runtime allowlist without lifecycle installers', () => {
  assert.deepEqual(manifest.files, [
    'lib/*.js', 'src/*.js', 'scripts/*.mjs', 'test/*.test.mjs', 'cordis.bundle.json',
    'README.md', 'README.zh-CN.md', 'PUBLISHING.md', 'SECURITY.md', 'NOTICE.md', 'LICENSE',
  ]);
  assert.deepEqual(manifest.dependencies ?? {}, {});
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepack', 'postpack']) {
    assert.equal(Object.hasOwn(manifest.scripts, hook), false, hook);
  }
  assert.equal(manifest.private, true); // Git/path/tarball installs do not require npm publication.
});
