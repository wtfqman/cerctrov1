import { env } from '../src/config/env.js';
import { createGoogleSheetsService } from '../src/services/googleSheets.js';
import { logger } from '../src/utils/logger.js';

const scriptLogger = logger.child({ script: 'resetGoogleSheet' });

function parseArgs(argv) {
  const options = {
    apply: false,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.apply && options.dryRun) {
    throw new Error('Use either --dry-run or --apply');
  }

  if (!options.apply) {
    options.dryRun = true;
  }

  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (!env.GOOGLE_SHEETS_ENABLED) {
    throw new Error(`Google Sheets is not configured: ${env.GOOGLE_SHEETS_MISSING_VARS.join(', ')}`);
  }

  const googleSheets = createGoogleSheetsService({
    env,
    logger: scriptLogger,
  });

  const ready = await googleSheets.init();

  if (!ready) {
    throw new Error('Google Sheets initialization failed');
  }

  const rows = await googleSheets.getAllRows();

  console.log(`Mode: ${options.apply ? 'apply' : 'dry-run'}`);
  console.log(`Spreadsheet: ${env.GOOGLE_SHEETS_SPREADSHEET_ID}`);
  console.log(`Sheet: ${env.GOOGLE_SHEET_NAME}`);
  console.log(`Rows to clear: ${rows.length}`);
  console.log(`Header after reset: ${googleSheets.SHEET_HEADERS.join(' | ')}`);

  if (options.dryRun) {
    return;
  }

  const result = await googleSheets.clearSheetData();

  if (!result.ok) {
    throw new Error(result.message || 'Failed to clear Google Sheets');
  }

  console.log('');
  console.log('Google Sheets reset completed.');
  console.log(`Cleared rows: ${result.clearedRows}`);
  console.log('The sheet now keeps only the new readable header row.');
}

main().catch((error) => {
  scriptLogger.error(
    {
      err: error,
    },
    'Google Sheets reset failed',
  );
  process.exit(1);
});
