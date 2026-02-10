const express = require("express");
const router = express.Router();
const User = require("../models/User");
const MercadoPagoService = require("../services/MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");
const logger = require("../utils/logger");

/**
 * @route POST /api/mercadopago/create_preference
 * @desc Inicia el flujo de suscripción generando el link de pago
 */
router.post("/create_preference", async (req, res) => {
  const { userId, planId, country } = req.body;
  const clientUrl = process.env.CLIENT_URL || "https://www.mensajemagico.com";

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const premiumConfig = PLAN_CONFIG.subscription_plans.premium;
    let price, title;
    const currency_id = "COP"; // Forzamos COP para evitar el error de MP,
    const TRM = 3980; // Define una tasa de cambio fija (ej. 1 USD = 3980 COP)
    frequency = 1;

    if (country === "CO") {
      // --- CONCEPTO A: USUARIO LOCAL ---
      if (planId === "premium_yearly") {
        price = premiumConfig.pricing_hooks.mercadopago_price_yearly;
        title = "Suscripción Anual - MensajeMágico Premium";
      } else {
        price = premiumConfig.pricing_hooks.mercadopago_price_monthly;
        title = "Suscripción Mensual - MensajeMágico Premium";
      }
    } else {
      // --- CONCEPTO B: USUARIO INTERNACIONAL (Disfraz de USD a COP) ---
      // Convertimos el precio de USD a COP para que Mercado Pago lo procese
      const priceInUsd =
        planId === "premium_yearly"
          ? premiumConfig.pricing_hooks.mercadopago_price_yearly_usd
          : premiumConfig.pricing_hooks.mercadopago_price_monthly_usd;

      price = priceInUsd * TRM;

      // La leyenda estratégica:
      title = `Plan Premium Internacional (Equivalente a $${priceInUsd} USD)`;
    }

    // 2. Crear Suscripción en Mercado Pago
    const subscription = await MercadoPagoService.createSubscription({
      title,
      price,
      currency_id,
      payerEmail: user.email,
      externalReference: userId.toString(),
      backUrl: `${clientUrl}/success`,
      frequency,
      frequencyType: "months",
    });

    res.json({
      init_point: subscription.init_point,
      sandbox_init_point:
        subscription.sandbox_init_point || subscription.init_point,
    });
  } catch (error) {
    logger.error("Error en create_preference", {
      userId,
      error: error.message,
    });
    res.status(500).json({ error: "No se pudo generar el link de pago" });
  }
});

/**
 * @route POST /api/mercadopago/webhook
 * @desc Escucha notificaciones de MP (Suscripciones y Pagos Únicos)
 */
router.post("/webhook", async (req, res) => {
  const type = req.body.type || req.body.topic;
  const data = req.body.data || { id: req.body.id };

  try {
    // --- CASO 1: SUSCRIPCIONES (PREAPPROVAL) ---
    if (type === "subscription_preapproval") {
      const subscription = await MercadoPagoService.getPreApproval(data.id);
      const userId = subscription.external_reference;

      if (!userId) return res.sendStatus(200);

      if (subscription.status === "authorized") {
        // ACTIVAR PREMIUM
        await User.findByIdAndUpdate(userId, {
          planLevel: "premium",
          subscriptionId: `mp_sub_${subscription.id}`,
          subscriptionStatus: "active",
        });
        logger.info(`Suscripción autorizada: ${userId}`);
      } else if (subscription.status === "cancelled") {
        // DEGRADAR A FREE
        await User.findByIdAndUpdate(userId, {
          planLevel: "free",
          subscriptionStatus: "cancelled",
        });
        logger.warn(`Suscripción cancelada: ${userId}`);
      }
    }

    // --- CASO 2: PAGOS INDIVIDUALES (PAYMENT) ---
    if (type === "payment") {
      const payment = await MercadoPagoService.getPayment(data.id);
      const userId = payment.external_reference;

      if (payment.status === "approved" && userId) {
        await User.findByIdAndUpdate(userId, {
          planLevel: "premium",
          subscriptionId: `mp_pay_${payment.id}`,
          lastPaymentDate: new Date(),
        });
        logger.info(`Pago único aprobado: ${userId}`);
      } else {
        logger.info(
          `Pago con estado: ${payment.status} para usuario: ${userId}`,
        );
      }
    }

    // Siempre responder 200 a Mercado Pago
    res.sendStatus(200);
  } catch (error) {
    logger.error("Error en Webhook", {
      message: error.message,
      body: req.body,
    });
    res.sendStatus(500); // Reintento en caso de error de servidor
  }
});

module.exports = router;
