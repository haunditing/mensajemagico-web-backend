require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

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
  "http://localhost:5173", // Vite default
  "http://localhost:3000", // Next.js / CRA default
  "http://192.168.1.10:5173", // Tu IP local para pruebas en red
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Permitir solicitudes sin origen (como apps móviles, curl o Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) === -1) {
        return callback(
          new Error("La política CORS no permite este origen"),
          false,
        );
      }
      return callback(null, true);
    },
    credentials: true,
  }),
);

// IMPORTANTE: El webhook de Stripe necesita el body raw, el resto JSON.
// Usamos esta lógica para asegurar que express.json no toque la ruta del webhook.
app.use((req, res, next) => {
  if (req.originalUrl === "/api/payments/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

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

// Manejo de errores global
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  logger.info(`Servidor Mágico corriendo en puerto ${PORT}`),
);
