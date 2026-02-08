const rateLimitMap = new Map();

/**
 * Middleware de Rate Limiting en memoria.
 * @param {Object} options Configuración del limitador
 * @param {number} options.windowMs Ventana de tiempo en milisegundos
 * @param {number} options.max Número máximo de peticiones por ventana
 * @param {string} options.message Mensaje de error a devolver
 */
const rateLimiter = ({ windowMs = 15 * 60 * 1000, max = 100, message = "Demasiadas peticiones" }) => {
  return (req, res, next) => {
    // Obtener IP (considerando proxies si existen)
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress;
    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
      rateLimitMap.set(ip, { count: 1, startTime: now });
      return next();
    }

    const data = rateLimitMap.get(ip);

    if (now - data.startTime > windowMs) {
      // Resetear ventana si ha pasado el tiempo
      data.count = 1;
      data.startTime = now;
      return next();
    }

    if (data.count >= max) {
      return res.status(429).json({ error: message });
    }

    data.count++;
    next();
  };
};

// Limpieza periódica de memoria (cada 10 minutos) para evitar fugas
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of rateLimitMap.entries()) {
    // Si la entrada es más antigua que 1 hora, eliminarla
    if (now - data.startTime > 3600000) {
      rateLimitMap.delete(ip);
    }
  }
}, 600000);

module.exports = rateLimiter;