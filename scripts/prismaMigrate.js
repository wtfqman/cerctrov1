import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { loadEnvFiles } from '../src/config/loadEnv.js';

loadEnvFiles();

const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
const databaseUrl = process.env.DATABASE_URL ?? '';
const prismaCliPath = path.resolve(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
    ...options,
  });
}

function relayResult(result) {
  if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
  }

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function resolveSqliteDatabasePath(url) {
  if (!url.startsWith('file:')) {
    return null;
  }

  const rawPath = url.slice('file:'.length).split('?')[0];

  if (!rawPath) {
    return null;
  }

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(path.dirname(schemaPath), rawPath);
}

function buildPrismaSqliteUrl(databasePath) {
  const normalizedPath = databasePath.replace(/\\/g, '/');
  return `file:${normalizedPath}`;
}

function shouldUseSqliteFallback(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  return (
    output.includes('Schema engine error') ||
    output.includes('Drift detected') ||
    output.includes('We need to reset the SQLite database')
  );
}

async function main() {
  const args = process.argv.slice(2);
  const nodeCommand = process.execPath;
  const commandEnv = {
    ...process.env,
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
  };

  const migrateResult = run(nodeCommand, [prismaCliPath, 'migrate', 'dev', ...args], {
    cwd: process.cwd(),
    env: commandEnv,
  });

  if (migrateResult.status === 0) {
    relayResult(migrateResult);
    process.exit(0);
  }

  if (!shouldUseSqliteFallback(migrateResult)) {
    relayResult(migrateResult);
    process.exit(migrateResult.status ?? 1);
  }

  if (!databaseUrl.startsWith('file:')) {
    relayResult(migrateResult);
    process.exit(migrateResult.status ?? 1);
  }

  process.stdout.write('Prisma migrate dev cannot continue normally. Using SQLite fallback.\n');

  const databasePath = resolveSqliteDatabasePath(databaseUrl);
  const absoluteDatabaseUrl = databasePath ? buildPrismaSqliteUrl(databasePath) : databaseUrl;

  if (databasePath) {
    mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const diffArgs = [
    prismaCliPath,
    'migrate',
    'diff',
    ...(databasePath && existsSync(databasePath) && statSync(databasePath).size > 0
      ? ['--from-url', absoluteDatabaseUrl]
      : ['--from-empty']),
    '--to-schema-datamodel',
    schemaPath,
    '--script',
  ];

  const diffResult = run(nodeCommand, diffArgs, {
    cwd: process.cwd(),
    env: commandEnv,
  });

  if (diffResult.status !== 0) {
    relayResult(diffResult);
    process.exit(diffResult.status ?? 1);
  }

  const sql = diffResult.stdout?.trim() ?? '';

  if (sql) {
    const executeResult = run(
      nodeCommand,
      [prismaCliPath, 'db', 'execute', '--stdin', '--schema', schemaPath],
      {
        cwd: process.cwd(),
        env: commandEnv,
        input: sql,
      },
    );

    relayResult(executeResult);

    if (executeResult.status !== 0) {
      process.exit(executeResult.status ?? 1);
    }
  }

  const generateResult = run(nodeCommand, [prismaCliPath, 'generate'], {
    cwd: process.cwd(),
    env: commandEnv,
  });

  relayResult(generateResult);

  if (generateResult.status !== 0) {
    process.exit(generateResult.status ?? 1);
  }

  process.stdout.write('\nPrisma migrate fallback completed via diff + db execute.\n');
}

await main();
