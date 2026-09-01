'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FORMATTER_REPOSITORY = 'soulteary/nginx-formatter';
const DEFAULT_VERSION = 'v2.2.0';
const PINNED_CHECKSUMS = Object.freeze({
  'v2.2.0/darwin-amd64': '85192e158f08711450bb8515b95a2cfe93de774f4676f6b13b73fd76a5fd61bd',
  'v2.2.0/darwin-arm64': 'a1b9693029659a004dd6f511ff4af7f89b87de568c708ed6c6436838f6452e54',
  'v2.2.0/linux-amd64': '39dd3daf71a1a3ac36091f05211583c41cdb23a563915ea7e2e4188505d697a0',
  'v2.2.0/linux-arm64': 'e154093f28eb45117e3e757f76de87a6ee0fdd5535d9ae43b8a2aab9c5bb703f',
});

function getInput(name, defaultValue = '') {
  const value = process.env[`INPUT_${name.toUpperCase().replace(/ /g, '_')}`];
  return value === undefined || value.trim() === '' ? defaultValue : value.trim();
}

function parseBoolean(value, name) {
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`${name} must be true or false`);
}

function normalizeVersion(value) {
  const normalized = value.startsWith('v') ? value : `v${value}`;
  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(normalized)) {
    throw new Error('version must be a semantic release version such as v2.2.0');
  }
  return normalized;
}

function resolvePlatform() {
  const platforms = { linux: 'linux', darwin: 'darwin' };
  const architectures = { x64: 'amd64', arm64: 'arm64' };
  const platform = platforms[process.platform];
  const architecture = architectures[process.arch];

  if (!platform || !architecture) {
    throw new Error(
      `Unsupported runner: ${process.platform}/${process.arch}. ` +
        'nginx-formatter publishes Linux and macOS binaries for x64 and arm64 runners.',
    );
  }
  return { platform, architecture };
}

function resolveWorkspaceTarget(workspace, inputPath) {
  const workspacePath = fs.realpathSync(path.resolve(workspace));
  const requested = path.resolve(workspacePath, inputPath);
  const lexicalRelative = path.relative(workspacePath, requested);

  if (
    lexicalRelative === '..' ||
    lexicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(lexicalRelative)
  ) {
    throw new Error(`path must stay inside GITHUB_WORKSPACE: ${inputPath}`);
  }
  if (!fs.existsSync(requested)) {
    throw new Error(`path does not exist: ${inputPath}`);
  }
  const target = fs.realpathSync(requested);
  const canonicalRelative = path.relative(workspacePath, target);
  if (
    canonicalRelative === '..' ||
    canonicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(canonicalRelative)
  ) {
    throw new Error(`path resolves outside GITHUB_WORKSPACE: ${inputPath}`);
  }
  return { target, relative: lexicalRelative || '.' };
}

function normalizeIndentChar(value) {
  const supported = new Map([
    ['space', 'space'],
    ['tab', 'tab'],
    ['\\s', 'space'],
    ['\\t', 'tab'],
  ]);
  const normalized = supported.get(value);
  if (!normalized) throw new Error('indent-char must be space, tab, \\s, or \\t');
  return normalized;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function download(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'nginx-format-action' },
  });
  if (!response.ok) {
    throw new Error(`download failed (${response.status}): ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function checksumFor(checksums, assetName) {
  for (const line of checksums.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (match && match[2] === assetName) return match[1].toLowerCase();
  }
  throw new Error(`checksum not found for ${assetName}`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.quiet ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.quiet ? `\n${result.stderr || result.stdout || ''}` : '';
    throw new Error(`${path.basename(command)} exited with code ${result.status}${detail}`);
  }
  return result;
}

function findFormatterBinary(root) {
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      if (entry.isFile() && entry.name === 'nginx-formatter') return candidate;
    }
  }
  throw new Error('nginx-formatter binary was not present in the release archive');
}

async function installFormatter(version) {
  if (process.env.NGINX_FORMATTER_BINARY) {
    const configured = path.resolve(process.env.NGINX_FORMATTER_BINARY);
    if (!fs.existsSync(configured)) throw new Error('NGINX_FORMATTER_BINARY does not exist');
    return configured;
  }

  const { platform, architecture } = resolvePlatform();
  const plainVersion = version.slice(1);
  const assetName = `nginx-formatter_${plainVersion}_${platform}_${architecture}.tar.gz`;
  const baseUrl = `https://github.com/${FORMATTER_REPOSITORY}/releases/download/${version}`;
  const toolRoot = process.env.RUNNER_TOOL_CACHE || path.join(os.tmpdir(), 'nginx-format-action-cache');
  const installDir = path.join(toolRoot, 'nginx-formatter', version, `${platform}-${architecture}`);
  const binary = path.join(installDir, 'nginx-formatter');
  const verified = path.join(installDir, '.verified');

  if (fs.existsSync(binary) && fs.existsSync(verified)) return binary;

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-formatter-install-'));
  try {
    const [archive, checksumData] = await Promise.all([
      download(`${baseUrl}/${assetName}`),
      download(`${baseUrl}/nginx-formatter_${plainVersion}_checksums.txt`),
    ]);
    const expected = checksumFor(checksumData.toString('utf8'), assetName);
    const actual = sha256(archive);
    if (actual !== expected) {
      throw new Error(`checksum mismatch for ${assetName}: expected ${expected}, got ${actual}`);
    }
    const pinned = PINNED_CHECKSUMS[`${version}/${platform}-${architecture}`];
    if (pinned && actual !== pinned) {
      throw new Error(`pinned checksum mismatch for ${assetName}: expected ${pinned}, got ${actual}`);
    }

    const archivePath = path.join(staging, assetName);
    const extractDir = path.join(staging, 'extract');
    fs.writeFileSync(archivePath, archive);
    fs.mkdirSync(extractDir);
    runCommand('tar', ['-xzf', archivePath, '-C', extractDir], { quiet: true });
    const extracted = findFormatterBinary(extractDir);

    fs.mkdirSync(installDir, { recursive: true });
    fs.copyFileSync(extracted, binary);
    fs.chmodSync(binary, 0o755);
    fs.writeFileSync(verified, `${actual}\n`, { mode: 0o600 });
    return binary;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function listConfigFiles(root) {
  const files = [];
  const pending = [''];
  while (pending.length > 0) {
    const relativeDir = pending.pop();
    const absoluteDir = path.join(root, relativeDir);
    const entries = fs
      .readdirSync(absoluteDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) pending.push(relative);
      if (entry.isFile() && entry.name.endsWith('.conf')) files.push(relative);
    }
  }
  return files.sort();
}

function prepareFormattedCopy(target, binary, indent, indentChar) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nginx-format-action-'));
  try {
    const stat = fs.statSync(target);
    const copied = path.join(tempRoot, stat.isDirectory() ? 'config' : path.basename(target));

    if (stat.isDirectory()) {
      fs.mkdirSync(copied);
      for (const relative of listConfigFiles(target)) {
        const source = path.join(target, relative);
        const destination = path.join(copied, relative);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.copyFileSync(source, destination);
      }
      runCommand(binary, [
        'format',
        '--input',
        copied,
        '--output',
        copied,
        '--indent',
        String(indent),
        '--char',
        indentChar,
      ]);
    } else if (stat.isFile()) {
      fs.copyFileSync(target, copied);
      runCommand(binary, [
        'format',
        '--input',
        copied,
        '--indent',
        String(indent),
        '--char',
        indentChar,
      ]);
    } else {
      throw new Error('path must refer to a regular file or directory');
    }
    return { tempRoot, copied, isDirectory: stat.isDirectory() };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function changedFiles(target, copied, isDirectory) {
  const candidates = isDirectory ? listConfigFiles(target) : [''];
  return candidates.filter((relative) => {
    const sourceFile = relative ? path.join(target, relative) : target;
    const formattedFile = relative ? path.join(copied, relative) : copied;
    return !fs.existsSync(formattedFile) || !fs.readFileSync(sourceFile).equals(fs.readFileSync(formattedFile));
  });
}

function atomicReplace(source, destination) {
  const stat = fs.statSync(destination);
  const temporary = path.join(
    path.dirname(destination),
    `.${path.basename(destination)}.nginx-format-${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
  );
  try {
    fs.copyFileSync(source, temporary);
    fs.chmodSync(temporary, stat.mode & 0o777);
    fs.renameSync(temporary, destination);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function applyChanges(target, copied, isDirectory, files) {
  for (const relative of files) {
    const destination = relative ? path.join(target, relative) : target;
    const source = relative ? path.join(copied, relative) : copied;
    atomicReplace(source, destination);
  }
}

function escapeWorkflow(value) {
  return String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function annotate(level, message, file) {
  const property = file ? ` file=${escapeWorkflow(file)}` : '';
  console.log(`::${level}${property}::${escapeWorkflow(message)}`);
}

function setOutput(name, value) {
  const stringValue = String(value);
  if (!process.env.GITHUB_OUTPUT) {
    console.log(`::set-output name=${name}::${escapeWorkflow(stringValue)}`);
    return;
  }
  const delimiter = `nginx_format_${crypto.randomBytes(8).toString('hex')}`;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${name}<<${delimiter}\n${stringValue}\n${delimiter}\n`,
    'utf8',
  );
}

function writeSummary(mode, version, files) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const status = files.length === 0 ? 'No formatting changes' : `${files.length} file(s) changed`;
  const rows = [
    '### Nginx Format',
    '',
    '| Mode | Formatter | Result |',
    '| --- | --- | --- |',
    `| ${mode} | ${version} | ${status} |`,
    '',
  ];
  if (files.length > 0) {
    rows.push('<details><summary>Changed files</summary>', '');
    for (const file of files) rows.push(`- \`${file.replace(/`/g, '\\`')}\``);
    rows.push('', '</details>', '');
  }
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${rows.join('\n')}\n`, 'utf8');
}

async function main() {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const inputPath = getInput('path', '.');
  const mode = getInput('mode', 'check').toLowerCase();
  const indentText = getInput('indent', '2');
  const indentChar = normalizeIndentChar(getInput('indent-char', 'space'));
  const version = normalizeVersion(getInput('version', DEFAULT_VERSION));
  const annotations = parseBoolean(getInput('annotations', 'true'), 'annotations');

  if (!['check', 'write'].includes(mode)) throw new Error('mode must be check or write');
  if (!/^\d+$/.test(indentText) || Number(indentText) < 1 || Number(indentText) > 16) {
    throw new Error('indent must be an integer between 1 and 16');
  }
  const { target, relative } = resolveWorkspaceTarget(workspace, inputPath);
  const binary = await installFormatter(version);
  const formatted = prepareFormattedCopy(target, binary, Number(indentText), indentChar);

  try {
    const differences = changedFiles(target, formatted.copied, formatted.isDirectory);
    const displayFiles = differences.map((file) => {
      if (!file) return relative;
      return relative === '.' ? file : path.join(relative, file);
    });

    setOutput('changed', differences.length > 0 ? 'true' : 'false');
    setOutput('changed-files', displayFiles.join('\n'));
    setOutput('formatter-version', version);
    writeSummary(mode, version, displayFiles);

    if (mode === 'write' && differences.length > 0) {
      applyChanges(target, formatted.copied, formatted.isDirectory, differences);
      if (annotations) {
        for (const file of displayFiles.slice(0, 20)) annotate('notice', 'Formatted Nginx configuration', file);
      }
      return;
    }

    if (mode === 'check' && differences.length > 0) {
      if (annotations) {
        for (const file of displayFiles.slice(0, 20)) annotate('error', 'Nginx configuration is not formatted', file);
      }
      throw new Error(`${differences.length} Nginx configuration file(s) require formatting`);
    }
  } finally {
    fs.rmSync(formatted.tempRoot, { recursive: true, force: true });
  }
}

async function run() {
  try {
    await main();
  } catch (error) {
    annotate('error', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  applyChanges,
  changedFiles,
  checksumFor,
  listConfigFiles,
  main,
  normalizeIndentChar,
  normalizeVersion,
  parseBoolean,
  PINNED_CHECKSUMS,
  prepareFormattedCopy,
  resolvePlatform,
  resolveWorkspaceTarget,
  run,
  sha256,
};
