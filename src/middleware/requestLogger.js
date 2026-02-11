// c:\Users\marvi\OneDrive\Escritorio\Personal\mensajemagico-web-backend\src\middleware\requestLogger.js
const logger = require("../utils/logger");

const requestLogger = (req, res, next) => {
  // Solo ejecutamos el log si NO estamos en producción
  if (process.env.NODE_ENV !== "production") {
    logger.info(`[REQUEST] ${req.method} ${req.originalUrl}`, {
      body: req.body, // Útil para ver qué envía el frontend
      query: req.query, // Útil para parámetros de URL
      params: req.params, // Útil para rutas dinámicas
      ip: req.ip,
    });
  }
  next();
};

module.exports = requestLogger;
