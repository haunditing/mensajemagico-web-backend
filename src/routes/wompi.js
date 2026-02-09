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

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    // Definir precio según el plan (Esto debería venir de tu config, hardcodeado por brevedad del ejemplo)
    // Wompi usa centavos (COP). Ejemplo: $20.000 COP = 2000000
    const amountInCents = 2000000; // $20.000 COP
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
      redirectUrl: `${process.env.CLIENT_URL}/success` // Opcional, para redirección
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
  
  logger.info("Webhook Wompi recibido", { reference: event?.data?.transaction?.reference, status: event?.data?.transaction?.status });

  try {
    // 1. Validar firma de seguridad (Checksum)
    const isValid = WompiService.verifyWebhookSignature(event);
    if (!isValid) {
      logger.warn("Firma de Webhook Wompi inválida", { signature: event.signature });
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