const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");
const User = require("../models/User");

router.get("/download/today", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== "admin") {
      logger.warn(`Intento de descarga de logs no autorizado: ${req.userId}`);
      return res
        .status(403)
        .json({
          error: "Acceso denegado. Se requieren permisos de administrador.",
        });
    }
  } catch (error) {
    logger.error("Error verificando permisos de admin", {
      error: error.message,
    });
    return res.status(500).json({ error: "Error interno del servidor" });
  }

  // 1. Calcular el nombre del archivo de logs
  // Con winston-daily-rotate-file, el formato por defecto es filename.YYYY-MM-DD
  const date = new Date().toISOString().split("T")[0];
  const filename = `requests.log.${date}`;
  
  const logDirectory = path.join(__dirname, "../../logs");
  const filePath = path.join(logDirectory, filename);

  // 2. Verificar si existe
  if (!fs.existsSync(filePath)) {
    logger.warn(`Intento de descarga de log fallido: ${filename} no existe en ${logDirectory}`);
    return res
      .status(404)
      .json({ error: "No hay archivo de logs disponible." });
  }

  // 3. Enviar archivo
  res.download(
    filePath,
    `logs-${new Date().toISOString().split("T")[0]}.log`,
    (err) => {
      if (err) {
        logger.error("Error al descargar el log", { error: err.message });
        if (!res.headersSent)
          res.status(500).send("Error al descargar el archivo.");
      }
    },
  );
});

module.exports = router;
