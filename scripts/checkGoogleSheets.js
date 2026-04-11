import { env } from '../src/config/env.js';
import { createGoogleSheetsService } from '../src/services/googleSheets.js';
import { logger } from '../src/utils/logger.js';

const scriptLogger = logger.child({ script: 'checkGoogleSheets' });

async function main() {
  scriptLogger.info(
    {
      credentialsPath: env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || undefined,
      missingEnv: env.GOOGLE_SHEETS_MISSING_VARS,
      sheetName: env.GOOGLE_SHEET_NAME || undefined,
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID || undefined,
    },
    'Checking Google Sheets integration',
  );

  if (!env.GOOGLE_SHEETS_ENABLED) {
    scriptLogger.error(
      {
        missingEnv: env.GOOGLE_SHEETS_MISSING_VARS,
      },
      'Google Sheets is not fully configured',
    );
    process.exit(1);
  }

  const googleSheets = createGoogleSheetsService({
    env,
    logger: scriptLogger,
  });

  const ready = await googleSheets.init();

  if (!ready) {
    scriptLogger.error('Google Sheets initialization check failed');
    process.exit(1);
  }

  const rows = await googleSheets.getAllRows();

  scriptLogger.info(
    {
      rowsCount: rows.length,
      sheetName: env.GOOGLE_SHEET_NAME,
      spreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID,
    },
    'Google Sheets check passed',
  );
}

main().catch((error) => {
  scriptLogger.error(
    {
      err: error,
    },
    'Google Sheets check crashed',
  );
  process.exit(1);
});
