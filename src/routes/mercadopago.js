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
  const { userId, planId, country, deviceId, amount } = req.body;

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

    // Extraer plan y intervalo del planId (ej: "premium_monthly" o "premium_lite_yearly")
    let planType = "premium";
    let interval = "monthly";
    
    if (planId.includes("premium_lite")) {
      planType = "premium_lite";
      interval = planId.includes("yearly") ? "yearly" : "monthly";
    } else if (planId.includes("premium")) {
      planType = "premium";
      interval = planId.includes("yearly") ? "yearly" : "monthly";
    }

    const planConfig = PLAN_CONFIG.subscription_plans[planType];
    let price, title;
    const currency_id = "COP"; // Forzamos COP para evitar el error de MP
    const TRM = await getTRM(); // Obtiene la TRM dinámica con fallback
    let frequency = 1;

    // Lógica de expiración de oferta (Backend)
    const offerEndDate = planConfig.pricing_hooks.offer_end_date;
    const offerDuration = planConfig.pricing_hooks.offer_duration_months || 0;
    let isOfferActive = true;
    let durationToApply = 0;

    // 1. Verificar expiración por fecha global
    if (offerEndDate) {
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (isoDateRegex.test(offerEndDate)) {
        const [year, month, day] = offerEndDate.split('-').map(Number);
        const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
        if (new Date() > expiryDate) {
          isOfferActive = false;
          logger.info(`[MercadoPago] Oferta global expirada (Fin: ${offerEndDate}).`);
        }
      }
    }

    // 2. Verificar si el usuario ya tiene una promo activa (Prioridad Personal - Override)
    if (user.promoEndsAt && new Date() < user.promoEndsAt) {
      isOfferActive = true;
      logger.info(`[MercadoPago] Usuario tiene promo personal activa hasta ${user.promoEndsAt}`);
    }

    // 3. Determinar duración a aplicar
    if (isOfferActive) {
      durationToApply = offerDuration;
    }

    // CASO A: Usar precio del frontend (Prioridad)
    if (amount && !isNaN(amount) && amount > 0) {
      price = Number(amount);
      const intervalLabel = interval === "yearly" ? "Anual" : "Mensual";
      title = `Suscripción ${intervalLabel} - MensajeMágico ${planConfig.name}`;
      
      if (planId === `${planType}_yearly` || interval === "yearly") {
        frequency = 12;
      }
      logger.info(`[MercadoPago] Usando precio del frontend: ${price}`);
    } else if (country === "CO") {
      // --- CONCEPTO A: USUARIO LOCAL ---
      if (planId === `${planType}_yearly` || interval === "yearly") {
        if (!isOfferActive && planConfig.pricing_hooks.mercadopago_price_yearly_original) {
          price = planConfig.pricing_hooks.mercadopago_price_yearly_original;
          logger.info(`[MercadoPago] Restaurando precio original anual: ${price}`);
        } else {
          price = planConfig.pricing_hooks.mercadopago_price_yearly;
        }
        title = `Suscripción Anual - MensajeMágico ${planConfig.name}`;
        frequency = 12;
      } else {
        if (!isOfferActive && planConfig.pricing_hooks.mercadopago_price_monthly_original) {
          price = planConfig.pricing_hooks.mercadopago_price_monthly_original;
          logger.info(`[MercadoPago] Restaurando precio original mensual: ${price}`);
        } else {
          price = planConfig.pricing_hooks.mercadopago_price_monthly;
        }
        title = `Suscripción Mensual - MensajeMágico ${planConfig.name}`;
      }
    } else {
      // --- CONCEPTO B: USUARIO INTERNACIONAL (Disfraz de USD a COP) ---
      // Convertimos el precio de USD a COP para que Mercado Pago lo procese
      let priceInUsd;

      if (planId === `${planType}_yearly` || interval === "yearly") {
        if (!isOfferActive && planConfig.pricing_hooks.mercadopago_price_yearly_usd_original) {
          priceInUsd = planConfig.pricing_hooks.mercadopago_price_yearly_usd_original;
          logger.info(`[MercadoPago] Restaurando precio original anual USD: ${priceInUsd}`);
        } else {
          priceInUsd = planConfig.pricing_hooks.mercadopago_price_yearly_usd;
        }
      } else {
        if (!isOfferActive && planConfig.pricing_hooks.mercadopago_price_monthly_usd_original) {
          priceInUsd = planConfig.pricing_hooks.mercadopago_price_monthly_usd_original;
          logger.info(`[MercadoPago] Restaurando precio original mensual USD: ${priceInUsd}`);
        } else {
          priceInUsd = planConfig.pricing_hooks.mercadopago_price_monthly_usd;
        }
      }

      // IMPORTANTE: Redondear a entero para COP para evitar errores de formato en MP
      price = Math.round(priceInUsd * TRM);

      // La leyenda estratégica:
      title = `Plan ${planConfig.name} Internacional (Equivalente a $${priceInUsd} USD)`;

      if (planId === `${planType}_yearly` || interval === "yearly") {
        frequency = 12;
      }
    }

    const idempotencyKey = crypto.randomUUID();
    // Pasamos la duración en la referencia externa para que el webhook la procese
    // Formato: userId|durationMonths
    const externalReference = durationToApply > 0 ? `${userId}|${durationToApply}` : userId.toString();

    // Guardar temporalmente el plan que se está comprando para el webhook
    user._pendingPlan = planType;
    await user.save();

    // Log de depuración para verificar los datos antes de enviar a MP
    logger.info("Iniciando creación de preferencia MP", {
      userId,
      price,
      title,
      frequency,
      planType,
      idempotencyKey,
    });

    // 2. Crear Suscripción en Mercado Pago
    const subscription = await MercadoPagoService.createSubscription({
      title,
      price,
      currency_id,
      payerEmail: user.email,
      externalReference,
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
      const rawRef = subscription.external_reference;

      logger.info(`[MercadoPago Webhook] PreApproval Reference received: ${rawRef}`);

      if (!rawRef) return res.sendStatus(200);

      const [userId, durationStr] = rawRef.split('|');
      const duration = durationStr ? parseInt(durationStr) : 0;

      // Recuperar el plan pendiente del usuario
      const userForPlan = await User.findById(userId);
      const planType = userForPlan?._pendingPlan || "premium";

      const updateData = {
        planLevel: planType,
        subscriptionId: `mp_sub_${subscription.id}`,
        subscriptionStatus: "active",
        _pendingPlan: null, // Limpiar el campo temporal
      };

      // Si hay duración de promo, calculamos fecha fin
      if (duration > 0) {
        const now = new Date();
        const promoEndsAt = new Date(now);
        promoEndsAt.setMonth(now.getMonth() + duration);
        
        // Ajuste para meses con menos días (ej. 31 Ene + 1 mes -> 28/29 Feb)
        if (promoEndsAt.getDate() !== now.getDate()) {
          promoEndsAt.setDate(0);
        }
        
        updateData.promoEndsAt = promoEndsAt;
        logger.info(`Promo aplicada para usuario ${userId}. Vence: ${promoEndsAt}`);
      }

      if (subscription.status === "authorized") {
        // ACTIVAR PLAN (premium o premium_lite)
        await User.findByIdAndUpdate(userId, updateData);
        logger.info(`Suscripción autorizada: ${userId} al plan ${planType}`);
      } else if (subscription.status === "cancelled") {
        // DEGRADAR A FREE
        await User.findByIdAndUpdate(userId, {
          planLevel: "freemium",
          subscriptionStatus: "cancelled",
          _pendingPlan: null,
        });
        logger.warn(`Suscripción cancelada: ${userId}`);
      }
    }

    // --- CASO 2: PAGOS INDIVIDUALES (PAYMENT) ---
    if (type === "payment") {
      const payment = await MercadoPagoService.getPayment(data.id);
      // Soporte para referencia simple o compuesta
      const rawRef = payment.external_reference;
      
      logger.info(`[MercadoPago Webhook] Payment Reference received: ${rawRef}`);

      const parts = rawRef ? rawRef.split('|') : [];
      const userId = parts[0];
      const duration = parts[1] ? parseInt(parts[1]) : 0;

      if (payment.status === "approved" && userId) {
        // Recuperar el plan pendiente del usuario
        const userForPlan = await User.findById(userId);
        const planType = userForPlan?._pendingPlan || "premium";

        const updateData = {
          planLevel: planType,
          subscriptionId: `mp_pay_${payment.id}`,
          lastPaymentDate: new Date(),
          _pendingPlan: null, // Limpiar el campo temporal
        };

        if (duration > 0) {
          const now = new Date();
          const promoEndsAt = new Date(now);
          promoEndsAt.setMonth(now.getMonth() + duration);
          
          if (promoEndsAt.getDate() !== now.getDate()) {
            promoEndsAt.setDate(0);
          }
          updateData.promoEndsAt = promoEndsAt;
        }

        await User.findByIdAndUpdate(userId, updateData);
        logger.info(`Pago único aprobado: ${userId} al plan ${planType}`);
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

// Ruta para actualizar el precio de una suscripción existente (Ej. Fin de oferta)
router.put("/subscription/:id", async (req, res) => {
  const { id } = req.params;
  const { price } = req.body;

  try {
    // Nota: Mercado Pago puede notificar al usuario por email sobre el cambio de precio
    const result = await MercadoPagoService.updateSubscription(id, price);
    logger.info(`Suscripción MP ${id} actualizada a precio: ${price}`);
    res.json({ message: "Precio actualizado correctamente", result });
  } catch (error) {
    logger.error("Error actualizando suscripción MP", { error: error.message });
    res.status(500).json({ error: "No se pudo actualizar la suscripción", details: error.message });
  }
});

module.exports = router;
