import prompts from 'prompts';
import { loadSavedConfig, saveProjectConfig, type SinasConfig } from '../config.js';
import { SinasApi } from '../api.js';
import { ok, fail, info, header, ui } from '../ui.js';

export async function loginCommand(opts: { global?: boolean }): Promise<void> {
  const { config: existing } = loadSavedConfig();

  header('Sinas login');
  info(`Writing to ${opts.global ? '~/.sinas/config.json' : './.sinas/config.json'}`);

  const answers = await prompts(
    [
      {
        type: 'text',
        name: 'instance_url',
        message: 'Sinas instance URL',
        initial: existing?.instance_url,
        validate: (v: string) =>
          /^https?:\/\/.+/.test(v.trim()) ? true : 'Must start with http:// or https://',
        format: (v: string) => v.trim().replace(/\/+$/, ''),
      },
      {
        type: 'password',
        name: 'admin_token',
        message: 'Admin API token (Bearer)',
        validate: (v: string) => (v.trim().length > 0 ? true : 'Required'),
      },
    ],
    { onCancel: () => process.exit(130) },
  );

  const instance_url = answers.instance_url as string;
  const admin_token = answers.admin_token as string;

  // Validate by hitting /auth/me
  info('Verifying token against /auth/me ...');
  const api = new SinasApi(instance_url, admin_token);
  try {
    const me = await api.getMe();
    ok(`Authenticated as ${ui.bold(me.email)} (roles: ${me.roles.join(', ') || 'none'})`);
  } catch (e) {
    fail(`Token rejected: ${(e as Error).message}`);
    process.exit(1);
  }

  const next: SinasConfig = {
    instance_url,
    admin_token,
    app: existing?.app,
  };

  const path = opts.global
    ? (await import('../config.js')).saveGlobalConfig(next)
    : saveProjectConfig(next);
  ok(`Saved ${path}`);
}
