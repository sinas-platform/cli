import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

export interface VariableOptions {
  var?: string[];
  varsFile?: string;
}

/**
 * Install-time variables for packages, from (lowest to highest precedence):
 * SINAS_VAR_<NAME> environment variables (handy for CI secrets), a YAML/JSON
 * file of name: value pairs, and --var NAME=value flags.
 */
export function collectVariables(opts: VariableOptions): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('SINAS_VAR_') && value !== undefined) vars[key.slice('SINAS_VAR_'.length)] = value;
  }
  if (opts.varsFile) {
    const parsed = parseYaml(readFileSync(opts.varsFile, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) Object.assign(vars, parsed);
    else throw new Error(`${opts.varsFile} must hold name: value pairs`);
  }
  for (const pair of opts.var ?? []) {
    const eq = pair.indexOf('=');
    if (eq <= 0) throw new Error(`--var expects NAME=value, got "${pair}"`);
    vars[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return vars;
}

export interface VariableDeclaration {
  name: string;
  required?: boolean;
  default?: unknown;
}

/** Required variables (no default) the run doesn't provide. */
export function missingVariables(declared: unknown, provided: Record<string, unknown>): string[] {
  if (!Array.isArray(declared)) return [];
  return (declared as VariableDeclaration[])
    .filter((d) => d && d.required !== false && (d.default === undefined || d.default === null))
    .map((d) => d.name)
    .filter((name) => provided[name] === undefined || provided[name] === '');
}
