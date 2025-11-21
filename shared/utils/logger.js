const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');

const LOG_DIR = process.env.LOG_DIRECTORY || '/var/log';

function ensureLogDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch (error) {
    console.warn(`[logger] unable to create log directory ${dirPath}:`, error.message);
  }
}

function buildLogger(serviceName = 'app') {
  ensureLogDir(LOG_DIR);
  const filePath = path.join(LOG_DIR, `${serviceName}.log`);

  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service: serviceName },
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.splat(),
      format.json()
    ),
    transports: [
      new transports.Console({
        format: format.combine(format.colorize(), format.simple()),
      }),
      new transports.File({ filename: filePath }),
    ],
  });
}

module.exports = {
  buildLogger,
};
