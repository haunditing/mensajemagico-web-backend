const express = require("express");
const router = express.Router();
const User = require("../models/User");
const MercadoPagoService = require("../services/MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");
const logger = require("../utils/logger");

// 1. Crear Preferencia de Pago
router.post("/create_preference", async (req, res) => {
  const { userId, planId, country } = req.body;
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
    let currency_id;
    let frequency = 1;

    if (country === "CO") {
      currency_id = "COP";
      if (planId === "premium_yearly") {
        price = premiumConfig.pricing_hooks.mercadopago_price_yearly;
        title = "Suscripción Anual - MensajeMágico Premium";
        frequency = 12;
      } else {
        price = premiumConfig.pricing_hooks.mercadopago_price_monthly;
        title = "Suscripción Mensual - MensajeMágico Premium";
      }
    } else {
      currency_id = "USD";
      if (planId === "premium_yearly") {
        price = premiumConfig.pricing_hooks.mercadopago_price_yearly_usd;
        title = "Suscripción Anual - MensajeMágico Premium ($47,90 USD)";
        frequency = 12;
      } else {
        price = premiumConfig.pricing_hooks.mercadopago_price_monthly_usd;
        title = "Suscripción Mensual - MensajeMágico Premium ($4.99 USD)";
      }
    }

    // Usamos createSubscription en lugar de createPreference
    const subscription = await MercadoPagoService.createSubscription({
      title,
      price,
      currency_id,
      payerEmail: user.email,
      externalReference: userId, // Usamos el ID del usuario como referencia externa
      backUrl: `${clientUrl}/success`, // Las suscripciones usan un solo back_url
      frequency,
      frequencyType: "months",
    });

    res.json({
      init_point: subscription.init_point,
      sandbox_init_point: subscription.sandbox_init_point, // A veces MP devuelve solo init_point para suscripciones
    });
  } catch (error) {
    logger.error("Error creando suscripción MercadoPago", { error });
    res.status(500).json({ error: "Error al iniciar suscripción con MercadoPago" });
  }
});

// 2. Webhook (Notificaciones de pago)
router.post("/webhook", async (req, res) => {
  // MercadoPago envía 'type' o 'topic' dependiendo de la versión del webhook
  const type = req.body.type || req.body.topic;
  const data = req.body.data || { id: req.body.id };

  try {
    // Manejo de Suscripciones (Preapprovals)
    if (type === "subscription_preapproval") {
      const subscriptionId = data.id;
      logger.info("Webhook Suscripción MP recibido", { subscriptionId });

      const subscription = await MercadoPagoService.getPreApproval(subscriptionId);

      if (subscription.status === "authorized") {
        const userId = subscription.external_reference;
        if (userId) {
          await User.findByIdAndUpdate(userId, {
            planLevel: "premium",
            // Usamos prefijo mp_sub_ para distinguir de pagos únicos
            subscriptionId: `mp_sub_${subscription.id}`,
          });
          logger.info(`Usuario ${userId} suscrito a Premium (MP Sub: ${subscription.id})`);
        }
      }
    }
    // Mantenemos lógica de pago único por si acaso o para renovaciones
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
