import prompts from 'prompts';
import { SinasApi } from '../api.js';
import { loadConfig, requireConfig } from '../config.js';
import { collectSinasFiles, findAllSinasFiles } from '../files.js';
import { run, type Mode } from '../run.js';
import { fail, info, warn } from '../ui.js';
import { collectVariables } from '../vars.js';

export interface RunCommandOptions {
  var?: string[];
  varsFile?: string;
  instance?: string;
  allowBroadRolePermissions?: boolean;
  json?: boolean;
  markdown?: string;
  yes?: boolean;
}

/**
 * validate / preview / install. With paths (files or folders), those;
 * without, sinas-config.yaml and sinas-package.yaml here, as before.
 */
export async function runCommand(mode: Mode, paths: string[], opts: RunCommandOptions): Promise<void> {
  const config = requireConfig();
  const api = new SinasApi(config.instance_url, config.admin_token);
  const files = paths.length > 0 ? collectSinasFiles(paths) : findAllSinasFiles();
  if (files.length === 0) {
    fail(
      paths.length > 0
        ? `No SinasConfig or SinasPackage documents in ${paths.join(', ')}`
        : 'No sinas-package.yaml or sinas-config.yaml found in the current directory.',
    );
    process.exit(1);
  }

  if (mode === 'install' && !opts.yes) {
    if (!process.stdin.isTTY) {
      fail('Not a terminal: pass --yes to install without confirmation (e.g. in CI).');
      process.exit(1);
    }
    info(`This will modify the Sinas instance at ${config.instance_url}`);
    const { go } = await prompts({ type: 'confirm', name: 'go', message: 'Continue?', initial: false });
    if (!go) {
      warn('Cancelled.');
      return;
    }
  }

  const passed = await run(
    api,
    files,
    mode,
    {
      variables: collectVariables(opts),
      instance: opts.instance,
      allowBroadRolePermissions: opts.allowBroadRolePermissions,
      json: opts.json,
      markdown: opts.markdown,
    },
    loadConfig().source === 'env' ? config.instance_url : undefined,
  );
  if (!passed) process.exit(1);
}
