// c:\Users\marvi\OneDrive\Escritorio\Personal\mensajemagico-web-backend\src\middleware\requestLogger.js
const logger = require("../utils/logger");

const sanitize = (data) => {
  if (!data || typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item));
  }

  const sensitiveKeys = ["password", "token", "creditCard", "cvv", "secret", "authorization"];
  const sanitized = { ...data };

  for (const key in sanitized) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "***FILTERED***";
    } else if (typeof sanitized[key] === "object") {
      sanitized[key] = sanitize(sanitized[key]);
    }
  }
  return sanitized;
};

const requestLogger = (req, res, next) => {
  const start = Date.now();

  // 1. Log del Request (Entrada) - Ahora incluye headers
  logger.info(`➡️ [REQ] ${req.method} ${req.originalUrl}`, {
    headers: sanitize(req.headers),
    body: sanitize(req.body),
    query: req.query,
    params: req.params,
  });

  // 2. Interceptar el Response (Salida) para ver qué respondemos
  const originalSend = res.send;
  res.send = function (body) {
    res.send = originalSend; // Restaurar función original
    const duration = Date.now() - start;

    // Intentar parsear body si es string JSON para mejor legibilidad
    let parsedBody = body;
    try {
      if (typeof body === "string" && (body.startsWith("{") || body.startsWith("["))) {
        parsedBody = JSON.parse(body);
      }
    } catch (e) {}

    logger.info(`⬅️ [RES] ${req.method} ${req.originalUrl} [${res.statusCode}] - ${duration}ms`, {
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      response: parsedBody,
    });

    return originalSend.call(this, body);
  };
  next();
};

module.exports = requestLogger;
