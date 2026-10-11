/**
 * Validate, preview or install a set of Sinas documents, with output for
 * people (terminal), machines (--json) and pull requests (--markdown, and
 * the GitHub job summary when running in Actions). Exit code 1 on any error.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import { SinasApi } from './api.js';
import type { SinasYamlInfo } from './files.js';
import { fail, header, info, ok, ui, warn } from './ui.js';
import { missingVariables } from './vars.js';

export type Mode = 'validate' | 'preview' | 'install';

export interface Change {
  action: string;
  resourceType: string;
  resourceName: string;
  details?: string | null;
}

export interface FileResult {
  path: string;
  kind: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  summary?: Record<string, Record<string, number>>;
  changes?: Change[];
  package?: { name: string; version: string };
}

export interface RunOptions {
  variables: Record<string, unknown>;
  instance?: string;
  allowBroadRolePermissions?: boolean;
  json?: boolean;
  markdown?: string;
}

function asText(e: unknown): string {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) {
    const { path, message } = e as { path?: string; message: string };
    return path ? `${path}: ${message}` : message;
  }
  return JSON.stringify(e);
}

async function runOne(api: SinasApi, file: SinasYamlInfo, mode: Mode, opts: RunOptions): Promise<FileResult> {
  const result: FileResult = { path: file.path, kind: file.kind, ok: false, errors: [], warnings: [] };
  if (file.kind === 'unknown') {
    result.errors.push('Not valid YAML, or not a SinasConfig / SinasPackage document');
    return result;
  }
  try {
    if (mode === 'validate') {
      const r = await api.validateConfig(file.content);
      result.errors = r.errors.map(asText);
      result.warnings = r.warnings.map(asText);
      result.ok = r.valid && r.errors.length === 0;
      return result;
    }
    if (file.kind === 'SinasConfig') {
      const r = await api.applyConfig(file.content, mode === 'preview');
      result.summary = r.summary;
      result.changes = r.changes;
      result.errors = (r.errors ?? []).map(asText);
      result.warnings = (r.warnings ?? []).map(asText);
      result.ok = r.success;
      return result;
    }
    // SinasPackage: preview first in both modes (it reports missing variables).
    const preview = await api.previewPackage(file.content, opts.variables, opts.instance);
    const missing = missingVariables(preview.variables, opts.variables);
    if (missing.length > 0) {
      result.errors.push(
        `Missing variables: ${missing.join(', ')} (pass --var NAME=value, --vars-file, or SINAS_VAR_<NAME>)`,
      );
      return result;
    }
    if (mode === 'preview') {
      result.summary = preview.summary;
      result.changes = preview.changes;
      result.errors = (preview.errors ?? []).map(asText);
      result.warnings = (preview.warnings ?? []).map(asText);
      result.ok = preview.success;
      return result;
    }
    const installed = await api.installPackage(file.content, opts.variables, {
      instance: opts.instance,
      allowBroadRolePermissions: opts.allowBroadRolePermissions,
    });
    result.summary = installed.apply.summary;
    result.changes = installed.apply.changes as Change[];
    result.errors = (installed.apply.errors ?? []).map(asText);
    result.warnings = ((installed.apply as { warnings?: unknown[] }).warnings ?? []).map(asText);
    result.package = { name: installed.package.name, version: installed.package.version };
    result.ok = installed.apply.success;
  } catch (e) {
    result.errors.push((e as Error).message);
  }
  return result;
}

function counts(summary?: Record<string, Record<string, number>>) {
  const total = (action: string) => Object.values(summary?.[action] ?? {}).reduce((a, b) => a + b, 0);
  return { created: total('created'), updated: total('updated'), unchanged: total('unchanged'), deleted: total('deleted') };
}

function printHuman(r: FileResult, mode: Mode): void {
  header(`${r.kind}  ${r.path}${mode === 'preview' ? '  (dry run)' : ''}`);
  for (const e of r.errors) fail(e);
  for (const w of r.warnings) warn(w);
  if (r.summary) {
    const c = counts(r.summary);
    info(
      `${ui.green('+' + c.created)} created   ${ui.yellow('~' + c.updated)} updated   ` +
        `${ui.gray('·' + c.unchanged)} unchanged   ${ui.red('-' + c.deleted)} deleted`,
    );
    for (const ch of r.changes ?? []) {
      if (ch.action === 'unchanged') continue;
      const glyph = ch.action === 'create' ? ui.green('+') : ch.action === 'update' ? ui.yellow('~')
        : ch.action === 'delete' ? ui.red('-') : ui.gray('·');
      console.log(`  ${glyph} ${ui.cyan(ch.resourceType)} ${ch.resourceName}${ch.details ? ui.dim(` — ${ch.details}`) : ''}`);
    }
  }
  if (r.ok) ok(r.package ? `Installed ${r.package.name}@${r.package.version}` : mode === 'validate' ? 'Valid' : 'OK');
}

export function markdownReport(results: FileResult[], mode: Mode, target?: string): string {
  const title = { validate: 'Sinas validate', preview: 'Sinas plan', install: 'Sinas install' }[mode];
  const lines = [`### ${results.every((r) => r.ok) ? '✅' : '❌'} ${title}${target ? ` — ${target}` : ''}`, ''];
  for (const r of results) {
    lines.push(`**${r.kind}** \`${r.path}\`${r.package ? ` → ${r.package.name}@${r.package.version}` : ''}`, '');
    if (r.summary) {
      const c = counts(r.summary);
      lines.push(`${c.created} to create · ${c.updated} to update · ${c.deleted} to delete · ${c.unchanged} unchanged`, '');
      const changed = (r.changes ?? []).filter((ch) => ch.action !== 'unchanged');
      if (changed.length > 0) {
        lines.push('| | Kind | Name |', '|---|---|---|');
        for (const ch of changed) {
          const mark = ch.action === 'create' ? '➕' : ch.action === 'update' ? '✏️' : ch.action === 'delete' ? '🗑️' : ch.action;
          lines.push(`| ${mark} | ${ch.resourceType} | \`${ch.resourceName}\` |`);
        }
        lines.push('');
      }
    }
    for (const e of r.errors) lines.push(`- ❌ ${e}`);
    for (const w of r.warnings) lines.push(`- ⚠️ ${w}`);
    if (r.errors.length || r.warnings.length) lines.push('');
  }
  return lines.join('\n');
}

/** Run every document; config files first (they may define what packages use). */
export async function run(api: SinasApi, files: SinasYamlInfo[], mode: Mode, opts: RunOptions, target?: string): Promise<boolean> {
  const ordered = [...files.filter((f) => f.kind !== 'SinasPackage'), ...files.filter((f) => f.kind === 'SinasPackage')];
  const results: FileResult[] = [];
  for (const file of ordered) {
    const result = await runOne(api, file, mode, opts);
    results.push(result);
    if (!opts.json) printHuman(result, mode);
    // An install stops at the first failure: later files may depend on it.
    if (mode === 'install' && !result.ok) break;
  }
  const report = markdownReport(results, mode, target);
  if (opts.markdown) writeFileSync(opts.markdown, report + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n');
    } catch {
      // not fatal
    }
  }
  if (opts.json) console.log(JSON.stringify({ ok: results.every((r) => r.ok), mode, results }, null, 2));
  return results.length > 0 && results.every((r) => r.ok) && results.length === ordered.length;
}
