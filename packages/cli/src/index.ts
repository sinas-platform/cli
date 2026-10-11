import { Command } from 'commander';
import { fail } from './ui.js';

const program = new Command();

program
  .name('sinas')
  .description('CLI for building on Sinas: author, validate, preview, and install packages')
  .version('0.3.0');

program
  .command('init')
  .description('Set up this repo for Sinas development: agent skills + starter package file')
  .argument('[dir]', 'Target directory (default: current)')
  .action(async (dir?: string) => {
    const { initCommand } = await import('./commands/init.js');
    await initCommand(dir);
  });

program
  .command('login')
  .description('Save an instance URL + admin token to .sinas/config.json')
  .option('--global', 'Save to ~/.sinas/config.json instead of the current project')
  .action(async (opts) => {
    const { loginCommand } = await import('./commands/login.js');
    await loginCommand(opts);
  });

const collect = (value: string, previous: string[] = []) => [...previous, value];

function withRunOptions(cmd: Command, { install = false } = {}): Command {
  cmd
    .argument('[paths...]', 'Files or folders of SinasConfig / SinasPackage YAML (default: sinas-config.yaml + sinas-package.yaml here)')
    .option('--var <NAME=value>', 'Package variable (repeatable); also SINAS_VAR_<NAME> env vars', collect, [])
    .option('--vars-file <file>', 'YAML/JSON file of package variables (name: value)')
    .option('--instance <name>', 'Install name, for packages with multiInstance: true')
    .option('--json', 'Print the result as JSON')
    .option('--markdown <file>', 'Write a Markdown report (e.g. for a pull request comment)');
  if (install) {
    cmd
      .option('-y, --yes', 'Skip the confirmation prompt (required when not in a terminal, e.g. CI)')
      .option('--allow-broad-role-permissions', 'Accept package roles that grant beyond its own namespaces');
  }
  return cmd;
}

withRunOptions(
  program.command('validate').description('Validate Sinas config and package files (errors exit 1)'),
).action(async (paths: string[], opts) => {
  const { runCommand } = await import('./commands/ci.js');
  await runCommand('validate', paths, opts);
});

withRunOptions(
  program.command('preview').description('Dry run: show what applying/installing would change (errors exit 1)'),
).action(async (paths: string[], opts) => {
  const { runCommand } = await import('./commands/ci.js');
  await runCommand('preview', paths, opts);
});

withRunOptions(
  program.command('install').description('Apply config files, then install packages (stops at the first failure)'),
  { install: true },
).action(async (paths: string[], opts) => {
  const { runCommand } = await import('./commands/ci.js');
  await runCommand('install', paths, opts);
});

program
  .command('status')
  .description('Check manifest health: resources, permissions, stores')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js');
    await statusCommand();
  });

program
  .command('add')
  .description('Append a templated resource block to sinas-package.yaml')
  .argument('<type>', 'query | function | connector | agent | skill | collection | store | webhook | schedule | pipeline')
  .argument('<name>', 'Resource name')
  .option('--namespace <ns>', 'Namespace (default: package name)')
  .action(async (type: string, name: string, opts) => {
    const { addCommand } = await import('./commands/add.js');
    await addCommand(type, name, opts);
  });

program.parseAsync(process.argv).catch((err) => {
  fail(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
