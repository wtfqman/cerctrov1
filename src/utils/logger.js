import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const transport =
  isProduction
    ? undefined
    : pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
        },
      });

export const logger = pino(
  {
    base: undefined,
    level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport,
);