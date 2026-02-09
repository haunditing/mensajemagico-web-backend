const express = require("express");
const router = express.Router();
const User = require("../models/User");
const MercadoPagoService = require("../services/MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");
const logger = require("../utils/logger");

// 1. Crear Preferencia de Pago
router.post("/create_preference", async (req, res) => {
  const { userId, planId } = req.body;
  const clientUrl =
    process.env.CLIENT_URL ||
    req.headers.origin ||
    "https://www.mensajemagico.com";

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const premiumConfig = PLAN_CONFIG.subscription_plans.premium;
    let price;
    let title;

    if (planId === "premium_yearly") {
      price = premiumConfig.pricing_hooks.mercadopago_price_yearly;
      title = "Suscripción Anual - MensajeMágico Premium";
    } else {
      price = premiumConfig.pricing_hooks.mercadopago_price_monthly;
      title = "Suscripción Mensual - MensajeMágico Premium";
    }

    const preference = await MercadoPagoService.createPreference({
      title,
      price,
      payerEmail: user.email,
      externalReference: userId, // Usamos el ID del usuario como referencia externa
      successUrl: `${clientUrl}/success`,
      failureUrl: `${clientUrl}/pricing`,
    });

    res.json({
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    logger.error("Error creando preferencia MercadoPago", { error });
    res.status(500).json({ error: "Error al iniciar pago con MercadoPago" });
  }
});

// 2. Webhook (Notificaciones de pago)
router.post("/webhook", async (req, res) => {
  const { type, data } = req.body;

  try {
    if (type === "payment") {
      const paymentId = data.id;
      logger.info("Webhook MercadoPago recibido", { paymentId });

      // Verificación de pago real con la API de MercadoPago
      const payment = await MercadoPagoService.getPayment(paymentId);

      if (payment.status === "approved") {
        const userId = payment.external_reference;
        if (userId) {
          await User.findByIdAndUpdate(userId, {
            planLevel: "premium",
            subscriptionId: `mp_${payment.id}`,
          });
          logger.info(`Usuario ${userId} actualizado a Premium (MP: ${payment.id})`);
        } else {
          logger.warn(`Pago aprobado sin referencia de usuario: ${payment.id}`);
        }
      } else {
        logger.info(`Pago ${payment.id} no aprobado. Estado: ${payment.status}`);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error("Error en Webhook MercadoPago", { error });
    res.sendStatus(500);
  }
});

module.exports = router;
