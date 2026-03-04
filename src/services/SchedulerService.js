const cron = require("node-cron");
const User = require("../models/User");
const logger = require("../utils/logger");
const EmailService = require("./EmailService");
const MercadoPagoService = require("./MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");

const checkExpiredWompiSubscriptions = async () => {
  logger.info("Ejecutando verificación de suscripciones Wompi expiradas...");
  try {
    // 1. Buscar usuarios Premium o Premium Lite con suscripción Wompi
    const users = await User.find({
      $or: [
        { planLevel: "premium" },
        { planLevel: "premium_lite" }
      ],
      subscriptionId: { $regex: /^wompi_/ }
    });

    const now = new Date();
    let downgradedCount = 0;

    for (const user of users) {
      // Si no tiene fecha de pago, ignoramos
      if (!user.lastPaymentDate) continue;

      const daysUntilExpiration = user.getDaysUntilExpiration();
      
      // Si ya expiró (días negativos o 0)
      if (daysUntilExpiration !== null && daysUntilExpiration <= 0) {
        const expirationDate = user.getExpirationDate();
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
      $or: [
        { planLevel: "premium" },
        { planLevel: "premium_lite" }
      ],
      subscriptionId: { $regex: /^wompi_/ }
    });

    const now = new Date();
    // Normalizar 'now' a medianoche para comparar solo días
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const user of users) {
      if (!user.lastPaymentDate) continue;

      const daysUntilExpiration = user.getDaysUntilExpiration();
      if (daysUntilExpiration === null) continue;

      const expirationDate = user.getExpirationDate();

      // Enviar recordatorios en días específicos: 7, 3 y 1
      if ([7, 3, 1].includes(daysUntilExpiration)) {
        logger.info(`Enviando recordatorio de vencimiento (${daysUntilExpiration} días) a usuario ${user._id}`);
        await EmailService.sendSubscriptionExpirationWarning(
          user.email, 
          daysUntilExpiration, 
          expirationDate.toLocaleDateString(),
          user.planLevel
        );
      }
    }
  } catch (error) {
    logger.error("Error en cron job de notificaciones Wompi", { error: error.message });
  }
};

const checkPromoExpirations = async () => {
  logger.info("Verificando expiración de precios promocionales...");
  try {
    // Buscar usuarios Premium con promo vencida
    const users = await User.find({
      planLevel: "premium",
      promoEndsAt: { $lt: new Date(), $ne: null },
      // Eliminamos el filtro de regex para incluir Wompi y pagos únicos
    });

    const monthlyPrice = PLAN_CONFIG.subscription_plans.premium.pricing_hooks.mercadopago_price_monthly_original || PLAN_CONFIG.subscription_plans.premium.pricing_hooks.mercadopago_price_monthly;
    const yearlyPrice = PLAN_CONFIG.subscription_plans.premium.pricing_hooks.mercadopago_price_yearly_original || PLAN_CONFIG.subscription_plans.premium.pricing_hooks.mercadopago_price_yearly;

    for (const user of users) {
      // Solo si es suscripción automática de Mercado Pago intentamos actualizar el precio en la API
      if (user.subscriptionId && user.subscriptionId.startsWith("mp_sub_")) {
        const subscriptionId = user.subscriptionId.replace("mp_sub_", "");
        try {
          const sub = await MercadoPagoService.getPreApproval(subscriptionId);
          
          if (sub.status === "authorized" || sub.status === "pending") {
            const frequency = sub.auto_recurring.frequency;
            const targetPrice = (frequency === 12) ? yearlyPrice : monthlyPrice;
            const currentPrice = sub.auto_recurring.transaction_amount;

            if (currentPrice !== targetPrice) {
              logger.info(`Fin de promo para ${user.email}. Actualizando precio MP: ${currentPrice} -> ${targetPrice}`);
              await MercadoPagoService.updateSubscription(subscriptionId, targetPrice);
            }
          }
        } catch (error) {
          logger.error(`Error actualizando precio post-promo para ${user._id}`, { error: error.message });
        }
        
        // Pausa para evitar rate limit de MP (solo necesaria si llamamos a su API)
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Para TODOS (Wompi, MP), limpiamos la fecha de promo vencida
      user.promoEndsAt = undefined;
      await user.save();
    }
  } catch (error) {
    logger.error("Error en cron job de promos", { error: error.message });
  }
};

// === CRON JOBS PARA FREE TRIAL ===

const checkExpiredTrials = async () => {
  logger.info("Verificando trials expirados...");
  try {
    const now = new Date();
    
    // Buscar usuarios con trial activo que ya expiró
    const expiredTrialUsers = await User.find({
      trialEndDate: { $lt: now },
      planLevel: "premium_lite",
      // Verificar que no tengan suscripción activa (trial gratuito)
      $or: [
        { subscriptionId: { $exists: false } },
        { subscriptionId: null },
        { subscriptionId: "" }
      ]
    });

    let downgradedCount = 0;

    for (const user of expiredTrialUsers) {
      // Verificar que realmente estaba en trial y no es un usuario de pago
      if (user.hasUsedTrial && user.trialStartDate && user.trialEndDate) {
        logger.info(`Trial expirado para usuario ${user._id} (${user.email}). Degradando a freemium.`);
        
        user.planLevel = "freemium";
        await user.save();
        downgradedCount++;
      }
    }

    if (downgradedCount > 0) {
      logger.info(`${downgradedCount} usuarios degradados de trial a freemium.`);
    } else {
      logger.info("No hay trials expirados hoy.");
    }
  } catch (error) {
    logger.error("Error verificando trials expirados", { error: error.message });
  }
};

const checkUpcomingTrialExpirations = async () => {
  logger.info("Verificando trials próximos a expirar...");
  try {
    const now = new Date();
    
    // Buscar usuarios con trial activo
    const usersInTrial = await User.find({
      trialStartDate: { $exists: true, $ne: null },
      trialEndDate: { $gte: now }, // Aún no expiró
      planLevel: "premium_lite",
      // Sin suscripción de pago (trial gratuito)
      $or: [
        { subscriptionId: { $exists: false } },
        { subscriptionId: null },
        { subscriptionId: "" }
      ]
    });

    for (const user of usersInTrial) {
      const daysRemaining = user.getTrialDaysRemaining();
      
      // Enviar recordatorio 2 días antes de expirar
      if (daysRemaining === 2) {
        logger.info(`Enviando recordatorio de trial a ${user.email} (${daysRemaining} días restantes)`);
        
        try {
          await EmailService.sendTrialExpiringEmail(
            user.email,
            user.name || user.email.split('@')[0],
            daysRemaining,
            user.trialEndDate
          );
        } catch (emailError) {
          logger.error(`Error enviando email de recordatorio de trial a ${user.email}`, { error: emailError.message });
        }
      }
    }
  } catch (error) {
    logger.error("Error verificando trials próximos a expirar", { error: error.message });
  }
};

const initScheduledJobs = () => {
  // Ejecutar todos los días a las 00:00 (Medianoche)
  // Formato cron: min hora día mes día_semana
  cron.schedule("0 0 * * *", async () => {
    await checkExpiredWompiSubscriptions();
    await checkUpcomingWompiExpirations();
    await checkPromoExpirations();
    await checkExpiredTrials();
    await checkUpcomingTrialExpirations();
  });
  
  logger.info("Motor de tareas programadas (Cron) inicializado.");
};

module.exports = { initScheduledJobs };