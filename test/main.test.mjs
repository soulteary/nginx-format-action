import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'bun:test';

const require = createRequire(import.meta.url);
const action = require('../src/main.js');
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(currentDirectory, '..');
const temporaryPrefix = 'nginx-format-action-';

function makeFakeFormatter(root) {
  const fake = path.join(root, 'nginx-formatter');
  fs.writeFileSync(
    fake,
    `#!/usr/bin/env bun
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const value = (name) => args[args.indexOf(name) + 1];
const input = value('--input');
const format = (file) => {
  const content = fs.readFileSync(file, 'utf8');
  const output = content
    .replace(/server\\s*\\{\\s*listen\\s+80;\\s*\\}\\s*/g, 'server {\\n  listen 80;\\n}\\n');
  fs.writeFileSync(file, output);
};
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    if ((entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith('.conf')) format(file);
  }
};
if (fs.statSync(input).isDirectory()) walk(input); else format(input);
`,
    { mode: 0o755 },
  );
  return fake;
}

function runAction(workspace, fakeFormatter, inputs = {}) {
  const output = path.join(workspace, 'github-output.txt');
  const summary = path.join(workspace, 'summary.md');
  const environment = {
    ...process.env,
    GITHUB_WORKSPACE: workspace,
    GITHUB_OUTPUT: output,
    GITHUB_STEP_SUMMARY: summary,
    NGINX_FORMATTER_BINARY: fakeFormatter,
    INPUT_PATH: inputs.path || '.',
    INPUT_MODE: inputs.mode || 'check',
    INPUT_INDENT: inputs.indent || '2',
    'INPUT_INDENT-CHAR': inputs.indentChar || 'space',
    INPUT_VERSION: inputs.version || 'v2.3.0',
    INPUT_ANNOTATIONS: inputs.annotations || 'false',
    INPUT_EXTENSIONS: inputs.extensions || '.conf',
  };
  const result = spawnSync(process.execPath, [path.join(repositoryRoot, 'dist/index.js')], {
    cwd: workspace,
    env: environment,
    encoding: 'utf8',
  });
  return {
    ...result,
    outputs: fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '',
    summary: fs.existsSync(summary) ? fs.readFileSync(summary, 'utf8') : '',
  };
}

test('normalizes and validates formatter versions', () => {
  assert.equal(action.normalizeVersion('2.3.0'), 'v2.3.0');
  assert.equal(action.normalizeVersion('v2.3.0-rc.1'), 'v2.3.0-rc.1');
  assert.throws(() => action.normalizeVersion('latest'), /semantic release version/);
});

test('parses booleans strictly', () => {
  assert.equal(action.parseBoolean('yes', 'value'), true);
  assert.equal(action.parseBoolean('OFF', 'value'), false);
  assert.throws(() => action.parseBoolean('sometimes', 'value'), /true or false/);
});

test('normalizes documented indentation aliases', () => {
  assert.equal(action.normalizeIndentChar('space'), 'space');
  assert.equal(action.normalizeIndentChar('tab'), 'tab');
  assert.equal(action.normalizeIndentChar('\\s'), 'space');
  assert.equal(action.normalizeIndentChar('\\t'), 'tab');
  assert.throws(() => action.normalizeIndentChar('four spaces'), /indent-char/);
});

test('finds a release checksum by exact asset name', () => {
  const digest = 'a'.repeat(64);
  assert.equal(action.checksumFor(`${digest}  archive.tar.gz\n`, 'archive.tar.gz'), digest);
  assert.throws(() => action.checksumFor(`${digest}  other.tar.gz\n`, 'archive.tar.gz'));
});

test('pins every default-version runner checksum', () => {
  for (const platform of ['darwin', 'linux']) {
    for (const architecture of ['amd64', 'arm64']) {
      assert.match(action.PINNED_CHECKSUMS[`v2.3.0/${platform}-${architecture}`], /^[a-f0-9]{64}$/);
    }
  }
});

test('rejects targets outside the workspace', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-workspace-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-outside-'));
  try {
    assert.throws(() => action.resolveWorkspaceTarget(workspace, '..'), /inside GITHUB_WORKSPACE/);
    fs.writeFileSync(path.join(outside, 'nginx.conf'), 'events {}\n');
    fs.symlinkSync(path.join(outside, 'nginx.conf'), path.join(workspace, 'linked.conf'));
    assert.throws(
      () => action.resolveWorkspaceTarget(workspace, 'linked.conf'),
      /resolves outside GITHUB_WORKSPACE/,
    );
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('check mode reports differences without changing the source', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-check-'));
  try {
    const fake = makeFakeFormatter(workspace);
    const config = path.join(workspace, 'nginx.conf');
    const original = 'server{listen 80;}\n';
    fs.writeFileSync(config, original);

    const result = runAction(workspace, fake, { path: 'nginx.conf', mode: 'check' });
    assert.equal(result.status, 1);
    assert.equal(fs.readFileSync(config, 'utf8'), original);
    assert.match(result.outputs, /changed<<[^\n]+\ntrue\n/);
    assert.match(result.outputs, /nginx\.conf/);
    assert.match(result.summary, /1 file\(s\) changed/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('write mode atomically updates content and preserves permissions', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-write-'));
  try {
    const fake = makeFakeFormatter(workspace);
    const config = path.join(workspace, 'nginx.conf');
    fs.writeFileSync(config, 'server{listen 80;}\n', { mode: 0o640 });

    const result = runAction(workspace, fake, { path: 'nginx.conf', mode: 'write' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.readFileSync(config, 'utf8'), 'server {\n  listen 80;\n}\n');
    assert.equal(fs.statSync(config).mode & 0o777, 0o640);
    assert.match(result.outputs, /changed<<[^\n]+\ntrue\n/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('normalizes the extensions input', () => {
  assert.deepEqual(action.DEFAULT_EXTENSIONS, ['.conf']);
  assert.deepEqual(action.normalizeExtensions('.conf'), ['.conf']);
  // A leading dot is optional, matching is case-insensitive, duplicates collapse.
  assert.deepEqual(action.normalizeExtensions('conf'), ['.conf']);
  assert.deepEqual(action.normalizeExtensions('conf, .nginx'), ['.conf', '.nginx']);
  assert.deepEqual(action.normalizeExtensions('.CONF, conf'), ['.conf']);
  for (const bad of ['', '   ', ',', '.', 'a/b', 'a\\b']) {
    assert.throws(() => action.normalizeExtensions(bad), undefined, `expected ${JSON.stringify(bad)} to be refused`);
  }
});

test('scanning covers only the configured extensions', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-ext-'));
  try {
    fs.mkdirSync(path.join(root, 'conf.d'));
    fs.writeFileSync(path.join(root, 'conf.d', 'site.conf'), 'a');
    fs.writeFileSync(path.join(root, 'upstream.nginx'), 'b');
    fs.writeFileSync(path.join(root, 'include'), 'c');
    fs.writeFileSync(path.join(root, 'notes.txt'), 'd');

    // The default is unchanged, which is exactly the gap: two nginx files here
    // are invisible to it, so a passing check says nothing about them.
    assert.deepEqual(action.listConfigFiles(root), [path.join('conf.d', 'site.conf')]);

    assert.deepEqual(action.listConfigFiles(root, ['.conf', '.nginx']), [
      path.join('conf.d', 'site.conf'),
      'upstream.nginx',
    ]);

    // Case-insensitive, and an extension may match a whole extension-less name.
    fs.writeFileSync(path.join(root, 'SITE.CONF'), 'e');
    assert.ok(action.listConfigFiles(root, ['.conf']).includes('SITE.CONF'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('directory mode honours a widened extensions input', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-widen-'));
  try {
    const fake = makeFakeFormatter(workspace);
    fs.writeFileSync(path.join(workspace, 'site.nginx'), 'server {\n  listen 80;\n}\n');

    // Default: the .nginx file is not scanned, so the check trivially passes.
    const ignored = runAction(workspace, fake, { path: '.', mode: 'check' });
    assert.equal(ignored.status, 0, ignored.stderr || ignored.stdout);
    assert.match(ignored.outputs, /changed<<[^\n]+\nfalse\n/);

    // Widened: the same file is now in scope and the check has an opinion.
    const scanned = runAction(workspace, fake, { path: '.', mode: 'check', extensions: 'conf,nginx' });
    assert.match(scanned.stdout, /matching: \.conf, \.nginx/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('directory mode only compares .conf files', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-directory-'));
  try {
    const fake = makeFakeFormatter(workspace);
    fs.mkdirSync(path.join(workspace, 'conf.d'));
    fs.writeFileSync(path.join(workspace, 'conf.d', 'site.conf'), 'server {\n  listen 80;\n}\n');
    fs.writeFileSync(path.join(workspace, 'notes.txt'), 'not nginx');

    const result = runAction(workspace, fake, { path: '.', mode: 'check' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.outputs, /changed<<[^\n]+\nfalse\n/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('directory preparation copies only regular .conf files', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-copy-'));
  try {
    const fake = makeFakeFormatter(workspace);
    const configs = path.join(workspace, 'configs');
    fs.mkdirSync(path.join(configs, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(configs, 'nested', 'site.conf'), 'server {\n  listen 80;\n}\n');
    fs.writeFileSync(path.join(configs, 'large-build-output.bin'), 'unrelated');

    const prepared = action.prepareFormattedCopy(configs, fake, 2, 'space');
    try {
      assert.equal(fs.existsSync(path.join(prepared.copied, 'nested', 'site.conf')), true);
      assert.equal(fs.existsSync(path.join(prepared.copied, 'large-build-output.bin')), false);
    } finally {
      fs.rmSync(prepared.tempRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('directory mode skips .conf symlinks and cannot modify their targets', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-symlink-'));
  try {
    const fake = makeFakeFormatter(workspace);
    const configs = path.join(workspace, 'configs');
    const target = path.join(workspace, 'linked-target.txt');
    fs.mkdirSync(configs);
    fs.writeFileSync(target, 'server{listen 80;}\n');
    fs.symlinkSync(target, path.join(configs, 'linked.conf'));

    const result = runAction(workspace, fake, { path: 'configs', mode: 'check' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.readFileSync(target, 'utf8'), 'server{listen 80;}\n');
    assert.match(result.outputs, /changed<<[^\n]+\nfalse\n/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('preparation removes its temporary directory when formatting fails', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-failure-'));
  try {
    const fake = path.join(workspace, 'failing-formatter');
    const configs = path.join(workspace, 'configs');
    fs.mkdirSync(configs);
    fs.writeFileSync(path.join(configs, 'bad.conf'), 'invalid');
    fs.writeFileSync(fake, '#!/bin/sh\nexit 2\n', { mode: 0o755 });
    const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(temporaryPrefix)));

    assert.throws(() => action.prepareFormattedCopy(configs, fake, 2, 'space'), /code 2/);

    const after = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(temporaryPrefix)));
    assert.deepEqual(after, before);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
