const winston = require("winston");
require("winston-daily-rotate-file");
const path = require("path");

const logger = winston.createLogger({
  // Colocamos el nivel en 'info' para que solo guarde lo que tú mandes como logger.info
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.json(),
  ),
  // ❌ Eliminamos defaultMeta para que no añada "service: mensajemagico" a cada línea
  transports: [
    // 1. CONSOLA: Mantenemos esto para que tú veas qué pasa mientras programas
    new winston.transports.Console({
      format: winston.format.simple(),
    }),

    // 2. ARCHIVO: Solo escribirá cuando tú llames a logger.info en tu ruta
    new winston.transports.DailyRotateFile({
      filename: path.join(__dirname, "../../logs/transacciones-%DATE%.log"), // Nombre más descriptivo
      datePattern: "YYYY-MM-DD",
      zippedArchive: false,
      maxSize: "10m",
      maxFiles: "3d",
      auditFile: path.join(__dirname, "../../logs/audit-control.json"),
    }),
  ],
});

module.exports = logger;
