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
      logger.warn(`Plan desconocido recibido: "${planId}". Usando precio mensual por defecto.`);
    }

    const mpKey = isYearly ? "mercadopago_price_yearly" : "mercadopago_price_monthly";
    const wompiKey = isYearly ? "wompi_price_in_cents_yearly" : "wompi_price_in_cents_monthly";

    let amountInCents;

    // Prioridad 1: Usar el precio de MercadoPago (COP) para asegurar paridad exacta
    // Verificamos explícitamente que no sea undefined/null (para permitir valor 0 si fuera necesario)
    if (premiumConfig.pricing_hooks[mpKey] !== undefined && premiumConfig.pricing_hooks[mpKey] !== null) {
      const mpPrice = premiumConfig.pricing_hooks[mpKey];
      amountInCents = Math.round(mpPrice * 100);
      logger.info(`[Wompi] Usando precio base de MercadoPago: ${mpPrice} COP -> ${amountInCents} centavos`);
    } else if (premiumConfig.pricing_hooks[wompiKey] !== undefined && premiumConfig.pricing_hooks[wompiKey] !== null) {
      // Prioridad 2: Configuración específica de Wompi (Solo si no hay precio base)
      amountInCents = premiumConfig.pricing_hooks[wompiKey];
      logger.info(`[Wompi] Usando precio específico de Wompi: ${amountInCents} centavos`);
    }
    
    // Asegurar que sea entero para evitar errores de firma con decimales
    amountInCents = Math.round(Number(amountInCents));

    logger.info(`Precio resuelto para Wompi: ${amountInCents} (Plan: ${planId})`);

    if (!amountInCents) {
      logger.error("Precio Wompi no configurado en plans.js", { planId });
      return res.status(500).json({ error: "Error de configuración de precios" });
    }

    const currency = "COP";
    const reference = `TX-${userId}-${Date.now()}`; // Referencia única

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
      // Extraer userId de la referencia (formato: TX-{userId}-{timestamp})
      const parts = transaction.reference.split("-");
      const userId = parts[1];

      if (userId) {
        // 3. Actualizar usuario a PRO (Premium)
        const updatedUser = await User.findByIdAndUpdate(userId, {
          planLevel: "premium",
          // Guardamos el ID de transacción de Wompi como referencia
          subscriptionId: `wompi_${transaction.id}` 
        }, { new: true });

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