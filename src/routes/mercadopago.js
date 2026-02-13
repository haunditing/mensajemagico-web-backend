const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const User = require("../models/User");
const MercadoPagoService = require("../services/MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");
const logger = require("../utils/logger");

// Cache simple para la TRM (Tasa Representativa del Mercado)
let cachedTRM = 3980;
let lastTRMUpdate = 0;

const getTRM = async () => {
  // Actualizar cada 12 horas (43200000 ms)
  if (Date.now() - lastTRMUpdate < 43200000) return cachedTRM;

  try {
    // API de Datos Abiertos Colombia (Socrata)
    const response = await fetch(
      "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciahasta DESC",
    );
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0 && data[0].valor) {
        cachedTRM = parseFloat(data[0].valor);
        lastTRMUpdate = Date.now();
        logger.info(`TRM actualizada dinámicamente: ${cachedTRM}`);
      }
    }
  } catch (error) {
    logger.warn("Error obteniendo TRM, usando valor cacheado", {
      error: error.message,
    });
  }
  return cachedTRM;
};

/**
 * @route POST /api/mercadopago/create_preference
 * @desc Inicia el flujo de suscripción generando el link de pago
 */
router.post("/create_preference", async (req, res) => {
  const { userId, planId, country, deviceId } = req.body;

  // Determinar la URL base para el retorno (back_url)
  let clientUrl = process.env.CLIENT_URL || "https://www.mensajemagico.com";

  // Si CLIENT_URL contiene múltiples orígenes (separados por coma), seleccionamos el correcto
  if (clientUrl.includes(",")) {
    const origins = clientUrl.split(",").map((u) => u.trim());
    const reqOrigin = req.headers.origin;

    // Si el origen de la petición está en nuestra lista permitida, lo usamos. Si no, el primero.
    clientUrl =
      reqOrigin && origins.includes(reqOrigin) ? reqOrigin : origins[0];
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const premiumConfig = PLAN_CONFIG.subscription_plans.premium;
    let price, title;
    const currency_id = "COP"; // Forzamos COP para evitar el error de MP,
    const TRM = await getTRM(); // Obtiene la TRM dinámica con fallback
    let frequency = 1;

    if (country === "CO") {
      // --- CONCEPTO A: USUARIO LOCAL ---
      if (planId === "premium_yearly") {
        price = premiumConfig.pricing_hooks.mercadopago_price_yearly;
        title = "Suscripción Anual - MensajeMágico Premium";
        frequency = 12;
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

      // IMPORTANTE: Redondear a entero para COP para evitar errores de formato en MP
      price = Math.round(priceInUsd * TRM);

      // La leyenda estratégica:
      title = `Plan Premium Internacional (Equivalente a $${priceInUsd} USD)`;

      if (planId === "premium_yearly") {
        frequency = 12;
      }
    }

    const idempotencyKey = crypto.randomUUID();
    // Log de depuración para verificar los datos antes de enviar a MP
    logger.info("Iniciando creación de preferencia MP", {
      userId,
      price,
      title,
      frequency,
      idempotencyKey,
    });

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
      deviceId, // Pasamos el ID del dispositivo
      idempotencyKey, // Enviamos la llave de idempotencia
    });

    logger.info("Preferencia MP creada", { 
      init_point: subscription.init_point, 
      sandbox: subscription.sandbox_init_point || "No específico (usando init_point)" 
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
    // Devolvemos el mensaje técnico en 'details' para facilitar la depuración en el frontend
    res
      .status(500)
      .json({
        error: "No se pudo generar el link de pago",
        details: error.message,
      });
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
      } else if (
        payment.status === "pending" ||
        payment.status === "in_process"
      ) {
        // El pago está en revisión. No actualizamos a Premium todavía.
        logger.info(
          `Pago en estado '${payment.status}' para usuario: ${userId}. Esperando confirmación.`,
        );
      } else if (
        payment.status === "rejected" ||
        payment.status === "cancelled"
      ) {
        // El pago falló o fue cancelado.
        logger.warn(
          `Pago '${payment.status}' para usuario: ${userId}. No se otorga acceso.`,
        );
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
