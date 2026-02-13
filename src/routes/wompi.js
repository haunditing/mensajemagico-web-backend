const express = require("express");
const router = express.Router();
const User = require("../models/User");
const WompiService = require("../services/WompiService");
const logger = require("../utils/logger");
const PLAN_CONFIG = require("../config/plans");

// 1. Endpoint para iniciar transacción (Checkout)
// El frontend llama aquí para obtener la firma y referencia antes de abrir el widget
router.post("/checkout", async (req, res) => {
  const { userId, planId } = req.body; // planId puede ser 'premium_monthly' o 'premium_yearly'

  if (!planId) {
    return res.status(400).json({ error: "El parámetro planId es obligatorio" });
  }

  // Determinar la URL base para el retorno (redirectUrl)
  let clientUrl = process.env.CLIENT_URL || "https://www.mensajemagico.com";

  // Si CLIENT_URL contiene múltiples orígenes (separados por coma), seleccionamos el correcto
  if (clientUrl.includes(",")) {
    const origins = clientUrl.split(",").map((u) => u.trim());
    const reqOrigin = req.headers.origin;
    
    // Si el origen de la petición está en nuestra lista permitida, lo usamos. Si no, el primero.
    clientUrl = (reqOrigin && origins.includes(reqOrigin)) ? reqOrigin : origins[0];
  }

  logger.info(`Iniciando checkout Wompi`, { userId, planId });

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    // Definir precio según el plan y el intervalo seleccionado
    const premiumConfig = PLAN_CONFIG.subscription_plans.premium;
    const isYearly = planId === "premium_yearly";

    if (!isYearly && planId !== "premium_monthly") {
      logger.warn(`Plan desconocido recibido: "${planId}". Rechazando solicitud.`);
      return res.status(400).json({ error: "Plan no válido" });
    }

    const mpKey = isYearly ? "mercadopago_price_yearly" : "mercadopago_price_monthly";
    const mpOriginalKey = isYearly ? "mercadopago_price_yearly_original" : "mercadopago_price_monthly_original";
    const wompiKey = isYearly ? "wompi_price_in_cents_yearly" : "wompi_price_in_cents_monthly";

    let amountInCents;
    
    // Lógica de expiración de oferta (Backend)
    const offerEndDate = premiumConfig.pricing_hooks.offer_end_date;
    const offerDuration = premiumConfig.pricing_hooks.offer_duration_months || 0;
    let isOfferActive = true;
    let durationToApply = 0;

    // 1. Verificar si el usuario ya tiene una promo activa (Prioridad Personal)
    if (user.promoEndsAt && new Date() < user.promoEndsAt) {
      isOfferActive = true;
      logger.info(`[Wompi] Usuario tiene promo personal activa hasta ${user.promoEndsAt}`);
    } 
    // 2. Si no, verificar oferta global
    else if (offerEndDate) {
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (isoDateRegex.test(offerEndDate)) {
        const [year, month, day] = offerEndDate.split('-').map(Number);
        const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
        if (new Date() > expiryDate) {
          isOfferActive = false;
          logger.info(`[Wompi] Oferta global expirada (Fin: ${offerEndDate}).`);
        } else {
          durationToApply = offerDuration;
        }
      }
    }

    // Si la oferta expiró y tenemos un precio original, lo usamos con prioridad absoluta
    if (!isOfferActive && premiumConfig.pricing_hooks[mpOriginalKey]) {
      const originalPrice = premiumConfig.pricing_hooks[mpOriginalKey];
      amountInCents = Math.round(originalPrice * 100);
      logger.info(`[Wompi] Restaurando precio original (${mpOriginalKey}): ${originalPrice} COP -> ${amountInCents} centavos`);
    } else {
      // Si la oferta sigue activa O no hay precio original definido, usamos la lógica estándar
      // Prioridad 1: Configuración específica de Wompi
      if (premiumConfig.pricing_hooks[wompiKey] !== undefined && premiumConfig.pricing_hooks[wompiKey] !== null) {
        amountInCents = premiumConfig.pricing_hooks[wompiKey];
        logger.info(`[Wompi] Usando precio específico (${wompiKey}): ${amountInCents} centavos`);
      } else if (premiumConfig.pricing_hooks[mpKey] !== undefined && premiumConfig.pricing_hooks[mpKey] !== null) {
        // Prioridad 2: Usar el precio de MercadoPago (COP) como fallback para asegurar paridad
        const mpPrice = premiumConfig.pricing_hooks[mpKey];
        amountInCents = Math.round(mpPrice * 100);
        logger.info(`[Wompi] Fallback a precio base MP (${mpKey}): ${mpPrice} COP -> ${amountInCents} centavos`);
      }
    }
    
    // Asegurar que sea entero para evitar errores de firma con decimales
    amountInCents = Math.round(Number(amountInCents));

    logger.info(`Precio resuelto para Wompi: ${amountInCents} (Plan: ${planId})`);

    if (!amountInCents) {
      logger.error("Precio Wompi no configurado en plans.js", { planId });
      return res.status(500).json({ error: "Error de configuración de precios" });
    }

    const currency = "COP";
    // Incluimos el planId y la duración en la referencia
    const reference = `TX-${userId}-${planId}-${durationToApply}-${Date.now()}`; 

    // Generar firma de integridad
    const signature = WompiService.generateCheckoutSignature(reference, amountInCents, currency);

    res.json({
      reference,
      amountInCents,
      currency,
      signature,
      publicKey: WompiService.getPublicKey(),
      redirectUrl: `${clientUrl}/success` // Opcional, para redirección
    });

  } catch (error) {
    logger.error("Error generando checkout Wompi", { error });
    res.status(500).json({ error: "Error al iniciar pago con Wompi" });
  }
});

// 2. Webhook de Wompi
// Wompi envía una petición POST cuando el estado de la transacción cambia
router.post("/webhooks/wompi", async (req, res) => {
  const event = req.body;
  
  // Validación preliminar de estructura para evitar errores 500 si el payload está mal formado
  if (!event || !event.data || !event.signature || !event.timestamp) {
    logger.warn("Webhook Wompi recibido con estructura inválida");
    return res.status(400).json({ error: "Payload inválido" });
  }

  logger.info("Webhook Wompi recibido", { reference: event.data.transaction?.reference, status: event.data.transaction?.status });

  try {
    // 1. Validar firma de seguridad (Checksum)
    const isValid = WompiService.verifyWebhookSignature(event);
    if (!isValid) {
      logger.warn("Firma de Webhook Wompi inválida", { checksum: event.signature.checksum, reference: event.data.transaction?.reference });
      return res.status(400).json({ error: "Firma inválida" });
    }

    const { event: eventType, data } = event;
    const { transaction } = data;

    logger.info(`Evento Wompi recibido: ${eventType}, Estado: ${transaction.status}`);

    // 2. Procesar solo transacciones aprobadas
    if (eventType === "transaction.updated" && transaction.status === "APPROVED") {
      // Extraer datos de la referencia (formato: TX-{userId}-{planId}-{duration}-{timestamp})
      const parts = transaction.reference.split("-");
      const userId = parts[1];
      const planId = parts[2]; // 'premium_monthly' o 'premium_yearly'
      const duration = parts[3] ? parseInt(parts[3]) : 0;

      if (userId) {
        const updateData = {
          planLevel: "premium",
          subscriptionId: `wompi_${transaction.id}`,
          lastPaymentDate: new Date(),
          planInterval: planId === "premium_yearly" ? "year" : "month"
        };

        // Si es una nueva adquisición con promo, guardamos la fecha fin
        if (duration > 0) {
          const promoEndsAt = new Date();
          promoEndsAt.setMonth(promoEndsAt.getMonth() + duration);
          updateData.promoEndsAt = promoEndsAt;
          logger.info(`Promo Wompi aplicada para usuario ${userId}. Vence: ${promoEndsAt}`);
        }

        // 3. Actualizar usuario a PRO (Premium)
        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

        if (updatedUser) {
          logger.info(`Usuario ${userId} actualizado a Premium vía Wompi`);
        } else {
          logger.error(`Usuario ${userId} no encontrado para actualización Wompi`);
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error("Error procesando Webhook Wompi", { error });
    res.status(500).json({ error: "Error interno" });
  }
});

module.exports = router;