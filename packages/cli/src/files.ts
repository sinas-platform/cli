import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml, parseAllDocuments } from 'yaml';

export const PACKAGE_FILE = 'sinas-package.yaml';
export const CONFIG_FILE = 'sinas-config.yaml';

export interface SinasYamlInfo {
  path: string;
  content: string;
  parsed: Record<string, unknown> | null;
  kind: 'SinasPackage' | 'SinasConfig' | 'unknown';
}

function readYamlMaybe(path: string): SinasYamlInfo | null {
  if (!existsSync(path)) return null;
  const content = readFileSync(path, 'utf8');
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseYaml(content) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const kindStr = (parsed?.kind as string | undefined) ?? '';
  const kind: SinasYamlInfo['kind'] =
    kindStr === 'SinasPackage' || kindStr === 'SinasConfig' ? kindStr : 'unknown';
  return { path, content, parsed, kind };
}

export function findPackageFile(cwd = process.cwd()): SinasYamlInfo | null {
  return readYamlMaybe(join(cwd, PACKAGE_FILE));
}

export function findConfigFile(cwd = process.cwd()): SinasYamlInfo | null {
  return readYamlMaybe(join(cwd, CONFIG_FILE));
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.sinas', 'dist']);

function yamlFilesIn(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...yamlFilesIn(path));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/**
 * The Sinas documents in the given files and folders (folders are searched
 * recursively for *.yaml / *.yml), in path order. A file may hold several
 * documents separated by `---`; each becomes its own entry. YAML that isn't
 * a SinasConfig or SinasPackage is skipped when found in a folder, and an
 * error when named directly.
 */
export function collectSinasFiles(paths: string[]): SinasYamlInfo[] {
  const out: SinasYamlInfo[] = [];
  const seen = new Set<string>();  // overlapping paths: each file once
  for (const given of paths) {
    if (!existsSync(given)) throw new Error(`No such file or folder: ${given}`);
    const isDir = statSync(given).isDirectory();
    const files = isDir ? yamlFilesIn(given).sort() : [given];
    for (const file of files) {
      const resolved = resolve(file);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      const docs = parseAllDocuments(readFileSync(file, 'utf8'));
      let found = 0;
      docs.forEach((doc, index) => {
        if (doc.errors.length > 0) {
          out.push({ path: file, content: doc.toString(), parsed: null, kind: 'unknown' });
          found += 1;
          return;
        }
        const parsed = doc.toJS() as Record<string, unknown> | null;
        const kind = parsed?.kind;
        if (kind !== 'SinasConfig' && kind !== 'SinasPackage') return;
        out.push({
          path: docs.length > 1 ? `${file}#${index + 1}` : file,
          content: doc.toString(),
          parsed,
          kind,
        });
        found += 1;
      });
      if (!isDir && found === 0) throw new Error(`${file} holds no SinasConfig or SinasPackage document`);
    }
  }
  return out;
}

/** sinas-config.yaml and sinas-package.yaml here, the ones that exist. */
export function defaultSinasPaths(): string[] {
  return [CONFIG_FILE, PACKAGE_FILE].filter((p) => existsSync(p));
}
