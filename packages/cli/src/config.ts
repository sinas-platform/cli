import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export interface SinasConfig {
  instance_url: string;
  admin_token: string;
  app?: {
    name?: string;
    namespace?: string;
  };
}

const PROJECT_DIR = '.sinas';
const PROJECT_FILE = 'config.json';

function projectPath(cwd = process.cwd()): string {
  return join(cwd, PROJECT_DIR, PROJECT_FILE);
}

function globalPath(): string {
  return join(homedir(), PROJECT_DIR, PROJECT_FILE);
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function loadConfig(cwd = process.cwd()): {
  config: SinasConfig | null;
  source: 'env' | 'project' | 'global' | null;
} {
  // CI: SINAS_URL + SINAS_API_KEY (or SINAS_TOKEN) take precedence over files.
  const envUrl = process.env.SINAS_URL;
  const envKey = process.env.SINAS_API_KEY || process.env.SINAS_TOKEN;
  if (envUrl && envKey) return { config: { instance_url: envUrl, admin_token: envKey }, source: 'env' };
  const projectCfg = readJson<SinasConfig>(projectPath(cwd));
  if (projectCfg) return { config: projectCfg, source: 'project' };
  const globalCfg = readJson<SinasConfig>(globalPath());
  if (globalCfg) return { config: globalCfg, source: 'global' };
  return { config: null, source: null };
}

export function requireConfig(cwd = process.cwd()): SinasConfig {
  const { config } = loadConfig(cwd);
  if (!config) {
    throw new Error(
      'No Sinas config found. Set SINAS_URL and SINAS_API_KEY (CI), run `sinas login` in this ' +
        'directory, or create ~/.sinas/config.json',
    );
  }
  if (!config.instance_url || !config.admin_token) {
    throw new Error('Config is missing instance_url or admin_token. Run `sinas login` to fix.');
  }
  return config;
}

export function saveProjectConfig(config: SinasConfig, cwd = process.cwd()): string {
  const dir = resolve(cwd, PROJECT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = projectPath(cwd);
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
  // Best-effort: tighten permissions so the token isn't world-readable.
  try {
    const mode = statSync(path).mode & 0o777;
    if (mode !== 0o600) chmodSync(path, 0o600);
  } catch {
    // ignore (e.g. Windows)
  }
  return path;
}

export function saveGlobalConfig(config: SinasConfig): string {
  const dir = join(homedir(), PROJECT_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const path = globalPath();
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
  try {
    chmodSync(path, 0o600);
  } catch {
    // ignore
  }
  return path;
}
