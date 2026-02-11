// c:\Users\marvi\OneDrive\Escritorio\Personal\mensajemagico-web-backend\src\middleware\errorHandler.js
const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  // 1. Registrar el error con detalles de contexto (Ruta, Método, Stack)
  logger.error("🔥 Error No Controlado", {
    message: err.message,
    stack: err.stack,
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // 2. Determinar el código de estado (si el error lo trae, úsalo; si no, 500)
  const statusCode = err.statusCode || 500;

  // 3. Mensaje seguro para el cliente
  // En producción, ocultamos errores 500 genéricos para no exponer info sensible
  const message =
    statusCode === 500 && process.env.NODE_ENV === "production"
      ? "Error interno del servidor"
      : err.message;

  // 4. Enviar respuesta si no se ha enviado aún
  if (!res.headersSent) {
    res.status(statusCode).json({
      error: message,
      // Si el error incluye una sugerencia de venta (upsell), la pasamos
      ...(err.upsell && { upsell: err.upsell }),
      // Stack trace solo en desarrollo para facilitar la depuración
      ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
  }
};

module.exports = errorHandler;
