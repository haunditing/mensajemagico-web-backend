const cron = require("node-cron");
const User = require("../models/User");
const logger = require("../utils/logger");
const EmailService = require("./EmailService");

const checkExpiredWompiSubscriptions = async () => {
  logger.info("Ejecutando verificación de suscripciones Wompi expiradas...");
  try {
    // 1. Buscar usuarios Premium con suscripción Wompi
    const users = await User.find({
      planLevel: "premium",
      subscriptionId: { $regex: /^wompi_/ }
    });

    const now = new Date();
    let downgradedCount = 0;

    for (const user of users) {
      // Si no tiene fecha de pago, ignoramos (o podrías usar createdAt como fallback)
      if (!user.lastPaymentDate) continue;

      const expirationDate = new Date(user.lastPaymentDate);

      // Calcular fecha de vencimiento según el intervalo
      if (user.planInterval === "year") {
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
      } else {
        // Por defecto mensual (30 días)
        expirationDate.setDate(expirationDate.getDate() + 30);
      }

      // Verificar si ya expiró
      if (now > expirationDate) {
        logger.info(`Suscripción Wompi expirada para usuario ${user._id}. Vencía: ${expirationDate.toISOString()}`);
        
        user.planLevel = "freemium";
        user.subscriptionStatus = "expired";
        
        await user.save();
        downgradedCount++;
      }
    }

    if (downgradedCount > 0) {
      logger.info(`Verificación completada. ${downgradedCount} usuarios degradados a Freemium.`);
    }
  } catch (error) {
    logger.error("Error en cron job de Wompi", { error: error.message });
  }
};

const checkUpcomingWompiExpirations = async () => {
  logger.info("Verificando vencimientos próximos de Wompi...");
  try {
    const users = await User.find({
      planLevel: "premium",
      subscriptionId: { $regex: /^wompi_/ }
    });

    const now = new Date();
    // Normalizar 'now' a medianoche para comparar solo días
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const user of users) {
      if (!user.lastPaymentDate) continue;

      const expirationDate = new Date(user.lastPaymentDate);
      if (user.planInterval === "year") {
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
      } else {
        expirationDate.setDate(expirationDate.getDate() + 30);
      }

      // Normalizar fecha de expiración a medianoche
      const expDateOnly = new Date(expirationDate.getFullYear(), expirationDate.getMonth(), expirationDate.getDate());

      // Calcular diferencia en días
      const diffTime = expDateOnly - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Si faltan exactamente 3 días
      if (diffDays === 3) {
        logger.info(`Enviando recordatorio de vencimiento a usuario ${user._id}`);
        await EmailService.sendSubscriptionExpirationWarning(
          user.email, 
          3, 
          expirationDate.toLocaleDateString()
        );
      }
    }
  } catch (error) {
    logger.error("Error en cron job de notificaciones Wompi", { error: error.message });
  }
};

const initScheduledJobs = () => {
  // Ejecutar todos los días a las 00:00 (Medianoche)
  // Formato cron: min hora día mes día_semana
  cron.schedule("0 0 * * *", async () => {
    await checkExpiredWompiSubscriptions();
    await checkUpcomingWompiExpirations();
  });
  
  logger.info("Motor de tareas programadas (Cron) inicializado.");
};

module.exports = { initScheduledJobs };