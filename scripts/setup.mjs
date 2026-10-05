#!/usr/bin/env node
// Add/remove only this plugin's marked entry in an existing DSH desktop profile.
// Close Harness first: no text-file patcher can safely race its settings writer.
import { constants } from 'node:fs';
import { copyFile, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BEGIN = '# BEGIN DSH-OPENAI-OAUTH (managed by scripts/setup.mjs)';
export const END = '# END DSH-OPENAI-OAUTH';
export const DEFAULT_PATCH = join(homedir(), '.dsh', 'profiles', 'desktop', 'cordis.patch.yml');
const root = fileURLToPath(new URL('../', import.meta.url));

export function patchText(text, action, entryUrl) {
  if (action !== 'install' && action !== 'uninstall') throw new Error('Expected install or uninstall');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const start = text.indexOf(BEGIN);
  const finish = text.indexOf(END);
  if ((start < 0) !== (finish < 0)) throw new Error('Incomplete plugin markers; edit profile manually');
  if (start >= 0 && (text.indexOf(BEGIN, start + BEGIN.length) >= 0 || text.indexOf(END, finish + END.length) >= 0 || finish < start)) {
    throw new Error('Ambiguous plugin markers; refusing to edit');
  }
  const end = finish < 0 ? -1 : finish + END.length + (text.slice(finish + END.length).startsWith(eol) ? eol.length : 0);
  const existing = start < 0 ? '' : text.slice(start, end);
  if (existing && (!/^\s*- id:\s*openai-oauth-ui\s*$/m.test(existing) || !/\bname: ["']?file:\/\//.test(existing))) {
    throw new Error('Managed block was changed unexpectedly; refusing to replace it');
  }
  const remaining = start < 0 ? text : text.slice(0, start) + text.slice(end);
  if (/(?:^|\n)\s*- id:\s*openai-oauth-ui\s*(?:\r?\n|$)/.test(remaining)) {
    throw new Error('An unmarked openai-oauth-ui entry exists; remove or migrate it manually');
  }
  if (action === 'uninstall') return { text: remaining, changed: remaining !== text };
  if (!entryUrl || !entryUrl.startsWith('file:///')) throw new Error('Expected an absolute local plugin file URL');
  const block = [BEGIN, '- insert:', '    - id: openai-oauth-ui', '      name: ' + JSON.stringify(entryUrl), END, ''].join(eol);
  const output = start >= 0 ? text.slice(0, start) + block + text.slice(end) : text + (text.endsWith('\n') || !text.length ? '' : eol) + block;
  return { text: output, changed: output !== text };
}

export async function setup(action, { patchPath = DEFAULT_PATCH, pluginRoot = root, dryRun = false } = {}) {
  const patch = resolve(patchPath);
  const target = resolve(pluginRoot, 'lib', 'index.js');
  if (action === 'install') {
    for (const file of [target, resolve(pluginRoot, 'lib', 'client.js'), resolve(pluginRoot, 'lib', 'fast.js')]) {
      if (!(await lstat(file)).isFile()) throw new Error(`Build output is not a regular file: ${file}`);
    }
  }
  const stats = await lstat(patch);
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('The profile patch must be a regular file, not a link');
  const original = await readFile(patch, 'utf8');
  const updated = patchText(original, action, action === 'install' ? pathToFileURL(target).href : undefined);
  if (dryRun || !updated.changed) return { changed: updated.changed, patch, dryRun, backup: undefined };
  if (await readFile(patch, 'utf8') !== original) throw new Error('The profile changed during setup; retry with Harness closed');
  const backup = patch + '.before-openai-oauth-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8) + '.bak';
  await copyFile(patch, backup, constants.COPYFILE_EXCL);
  const temporary = join(dirname(patch), '.' + randomUUID() + '.openai-oauth.tmp');
  try {
    await writeFile(temporary, updated.text, { encoding: 'utf8', flag: 'wx', mode: stats.mode });
    if (await readFile(patch, 'utf8') !== original) throw new Error('The profile changed during setup; refusing to overwrite');
    await rename(temporary, patch);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
  return { changed: true, patch, dryRun: false, backup };
}

function optionsOf(argv) {
  const [action, ...rest] = argv;
  if (!['install', 'uninstall'].includes(action)) throw new Error('Usage: node scripts/setup.mjs install|uninstall [--patch PATH] [--dry-run]');
  let patchPath = DEFAULT_PATCH;
  let dryRun = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--dry-run') dryRun = true;
    else if (rest[i] === '--patch' && rest[i + 1]) patchPath = rest[++i];
    else throw new Error(`Unknown option: ${rest[i]}`);
  }
  return { action, patchPath, dryRun };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { action, ...options } = optionsOf(process.argv.slice(2));
    const result = await setup(action, options);
    console.log(`${action}: ${result.changed ? result.dryRun ? 'would change' : 'updated' : 'already up to date'} ${result.patch}`);
    if (result.backup) console.log(`Backup: ${result.backup}`);
    if (result.changed && !result.dryRun) console.log('Restart the existing Harness desktop app; do not start a second server.');
  } catch (error) {
    console.error('Setup failed: ' + error.message);
    process.exitCode = 1;
  }
}
