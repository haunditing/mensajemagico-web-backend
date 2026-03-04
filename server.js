require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const paymentRoutes = require("./src/routes/payments");
const magicRoutes = require("./src/routes/magic");
const authRoutes = require("./src/routes/auth");
const configRoutes = require("./src/routes/config");
const favoritesRoutes = require("./src/routes/favorites");
const wompiRoutes = require("./src/routes/wompi");
const mercadopagoRoutes = require("./src/routes/mercadopago");
const remindersRoutes = require("./src/routes/reminders");
const { initScheduledJobs } = require("./src/services/SchedulerService");
const contactsRoutes = require("./src/routes/contacts");
const guardianRoutes = require("./src/routes/guardian");
const logsRoutes = require("./src/routes/logs");
const adminRoutes = require("./src/routes/admin");

const logger = require("./src/utils/logger");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();

// Confiar en el proxy (Necesario para Rate Limiter y evitar bucles de redirección HTTPS en la nube)
app.set("trust proxy", 1);

// Conexión a Mongo
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("MongoDB Conectado"))
  .catch((err) => logger.error("Error Mongo:", { error: err }));

// Iniciar el motor de automatización
initScheduledJobs();

// Middleware
// Permitimos múltiples orígenes definidos en la variable de entorno (separados por coma)
const clientUrls = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map((url) => url.trim())
  : [];

const allowedOrigins = [
  ...clientUrls,
  "https://www.mensajemagico.com",
  "https://mensajemagico.com",
].filter(Boolean);

// Regex para permitir cualquier localhost en desarrollo
const localhostRegex = /^http:\/\/localhost:\d+$/;
const localIPRegex = /^http:\/\/192\.168\.\d+\.\d+:\d+$/;

// Deduplicar orígenes para evitar logs repetidos
const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

const isDevelopment = process.env.NODE_ENV !== "production";

if (isDevelopment) {
  logger.info(`CORS habilitado para: ${uniqueAllowedOrigins.join(", ")} + cualquier localhost/IP local`);
} else {
  logger.info(`CORS habilitado para: ${uniqueAllowedOrigins.join(", ")}`);
}

app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir solicitudes sin origen (como apps móviles, curl o Postman)
      if (!origin) return callback(null, true);

      // En desarrollo, permitir cualquier localhost o IP local
      if (isDevelopment && (localhostRegex.test(origin) || localIPRegex.test(origin))) {
        return callback(null, true);
      }

      // Verificar orígenes permitidos explícitamente
      if (uniqueAllowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }

      logger.warn(`CORS bloqueado para origen: ${origin}`);
      return callback(
        new Error("La política CORS no permite este origen"),
        false,
      );
    },
    credentials: true,
    optionsSuccessStatus: 200, // Mejora compatibilidad con algunos navegadores/proxies
  }),
);

// Middleware general para JSON
app.use(express.json());

// Logger de peticiones básico
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Rutas
app.use("/api/payments", paymentRoutes);
app.use("/api/magic", magicRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/config", configRoutes);
app.use("/api/favorites", favoritesRoutes);
app.use("/api", wompiRoutes); // Montamos en /api para que quede /api/webhooks/wompi
app.use("/api/mercadopago", mercadopagoRoutes);
app.use("/api/reminders", remindersRoutes);
app.use("/api/contacts", contactsRoutes);
app.use("/api/guardian", guardianRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/admin", adminRoutes);

// Servir archivos estáticos (imágenes de perfil)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Manejo de errores global
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  logger.info(`Servidor Mágico corriendo en puerto ${PORT}`),
);
