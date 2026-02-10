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

const logger = require("./src/utils/logger");

const app = express();

// Conexión a Mongo
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => logger.info("MongoDB Conectado"))
  .catch((err) => logger.error("Error Mongo:", { error: err }));

// Iniciar el motor de automatización
initScheduledJobs();

// Middleware
app.use(cors());

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

// Manejo de errores global
app.use((err, req, res, next) => {
  logger.error("Error no controlado", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Error interno del servidor" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  logger.info(`Servidor Mágico corriendo en puerto ${PORT}`),
);
