const express = require("express");
const router = express.Router();
const User = require("../models/User");
const MercadoPagoService = require("../services/MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");
const logger = require("../utils/logger");

// 3. Endpoint para consultar estado de suscripción
router.get("/subscription-status", async (req, res) => {
  const { userId } = req.query;

  try {
    if (!userId) return res.status(400).json({ error: "userId requerido" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    let subscriptionInfo = null;

    if (user.subscriptionId) {
      // Detectar si es MercadoPago, Wompi u otro
      if (user.subscriptionId.startsWith("mp_sub_")) {
        // Lógica para Suscripciones Recurrentes (PreApproval)
        const preApprovalId = user.subscriptionId.replace("mp_sub_", "");
        try {
          const sub = await MercadoPagoService.getPreApproval(preApprovalId);
          subscriptionInfo = {
            status: sub.status === "authorized" ? "active" : "inactive",
            renewalDate: sub.next_payment_date ? new Date(sub.next_payment_date) : null,
            cancelAtPeriodEnd: false, // MP cancela inmediatamente o pausa
            provider: "mercadopago",
          };
        } catch (error) {
          logger.error("Error consultando suscripción MP", { error });
        }
      } else if (user.subscriptionId.startsWith("mp_")) {
        // Lógica Legacy: Pago único (Checkout Pro)
        const paymentId = user.subscriptionId.replace("mp_", "");
        try {
          // 1. Intentar obtener el pago directo por ID
          const payment = await MercadoPagoService.getPayment(paymentId);
          
          // Estimación de fecha de renovación (30 días) ya que MP Checkout Pro es pago único
          const paymentDate = new Date(payment.date_approved || payment.date_created);
          const renewalDate = new Date(paymentDate);
          renewalDate.setDate(renewalDate.getDate() + 30);

          subscriptionInfo = {
            status: payment.status === "approved" ? "active" : "inactive",
            renewalDate: renewalDate,
            cancelAtPeriodEnd: false, // No es recurrente automático
            provider: "mercadopago"
          };
        } catch (mpError) {
          logger.warn("Error consultando pago MP, intentando búsqueda...", { error: mpError.message });
          
          // 2. Fallback: Buscar el último pago aprobado de este usuario
          const search = await MercadoPagoService.searchPayment({
             external_reference: userId, 
             sort: 'date_created', 
             criteria: 'desc',
             limit: 1
          });
          
          if (search.results && search.results.length > 0 && search.results[0].status === 'approved') {
             // Lógica similar si encontramos un pago válido reciente
             subscriptionInfo = { status: 'active', provider: 'mercadopago' };
          }
        }
      } else if (user.subscriptionId.startsWith("wompi_")) {
        // Lógica Wompi: Pago único con duración manual
        const lastPayment = user.lastPaymentDate || new Date();
        const renewalDate = new Date(lastPayment);
        
        // Sumar tiempo según el plan guardado (o 30 días por defecto)
        if (user.planInterval === "year") {
          renewalDate.setFullYear(renewalDate.getFullYear() + 1);
        } else {
          // Usar setMonth para consistencia con la duración de la promo
          renewalDate.setMonth(renewalDate.getMonth() + 1);
          
          // Ajuste para meses con menos días (ej. 31 Ene + 1 mes -> 28/29 Feb)
          if (renewalDate.getDate() !== lastPayment.getDate()) {
            renewalDate.setDate(0);
          }
        }

        subscriptionInfo = {
          status: new Date() < renewalDate ? "active" : "expired",
          renewalDate: renewalDate,
          cancelAtPeriodEnd: true, // Wompi no renueva solo, así que siempre "termina" al final
          provider: "wompi",
          interval: user.planInterval === "year" ? "yearly" : "monthly"
        }
      } else {
        // Stripe ha sido eliminado - subscriptionId no reconocido
        subscriptionInfo = null;
      }
    }

    res.json({ planLevel: user.planLevel, subscription: subscriptionInfo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3.5 Endpoint para verificar estado de renovación (específico para Wompi)
router.get("/renewal-status", async (req, res) => {
  const { userId } = req.query;

  try {
    if (!userId) return res.status(400).json({ error: "userId requerido" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    // Solo aplica para Wompi (pago único)
    if (!user.subscriptionId || !user.subscriptionId.startsWith("wompi_")) {
      return res.json({ 
        needsRenewal: false,
        daysUntilExpiration: null,
        expirationDate: null,
        provider: user.subscriptionId ? user.subscriptionId.split("_")[0] : null
      });
    }

    const expirationDate = user.getExpirationDate();
    const daysUntilExpiration = user.getDaysUntilExpiration();
    const needsRenewal = user.needsRenewal();

    res.json({
      needsRenewal,
      daysUntilExpiration,
      expirationDate,
      provider: "wompi",
      planLevel: user.planLevel,
      planInterval: user.planInterval
    });
  } catch (error) {
    logger.error("Error en renewal-status", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

// 4. Endpoint para cancelar suscripción
router.post("/cancel-subscription", async (req, res) => {
  const { userId } = req.body;

  try {
    if (!userId) return res.status(400).json({ error: "userId requerido" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    if (!user.subscriptionId) {
      return res.status(400).json({ error: "No se encontró una suscripción activa" });
    }

    // Lógica para MercadoPago
    if (user.subscriptionId.startsWith("mp_")) {
      // Extraer ID limpiando prefijos (soporta mp_ y mp_sub_)
      const id = user.subscriptionId.replace("mp_sub_", "").replace("mp_", "");
      try {
        // Caso 1: Pago único (Checkout Pro) - Solo calculamos fecha de fin
        // Como es pago único, no hay recurrencia que cancelar, solo informamos.
        const payment = await MercadoPagoService.getPayment(id);
        const paymentDate = new Date(
          payment.date_approved || payment.date_created,
        );
        const cancelAt = new Date(paymentDate);
        cancelAt.setDate(cancelAt.getDate() + 30);

        return res.json({
          message: "Tu suscripción finalizará al terminar el periodo actual.",
          cancelAt: cancelAt,
        });
      } catch (error) {
        // Caso 2: Suscripción recurrente (PreApproval) - Intentamos cancelar
        try {
          await MercadoPagoService.cancelPreApproval(id);
          return res.json({
            message: "Suscripción cancelada exitosamente.",
            cancelAt: new Date(),
          });
        } catch (err) {
          logger.error("Error cancelando suscripción MP", { error: err });
          return res.status(500).json({ error: "Error al cancelar la suscripción" });
        }
      }
    } else if (user.subscriptionId.startsWith("wompi_")) {
      // Wompi no tiene recurrencia automática en este modo, así que no hay nada que cancelar en la pasarela.
      // Simplemente informamos al usuario que su plan terminará en la fecha prevista.
      
      const lastPayment = user.lastPaymentDate || new Date();
      const expirationDate = new Date(lastPayment);

      if (user.planInterval === "year") {
        expirationDate.setFullYear(expirationDate.getFullYear() + 1);
      } else {
        expirationDate.setMonth(expirationDate.getMonth() + 1);
        if (expirationDate.getDate() !== lastPayment.getDate()) {
          expirationDate.setDate(0);
        }
      }

      return res.json({
        message: "Tu plan Wompi no tiene renovación automática. Finalizará en la fecha indicada.",
        cancelAt: expirationDate
      });
    }

    // Stripe ha sido eliminado. Esta lógica ya está manejada en los bloques de MercadoPago y Wompi.
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Endpoint para reactivar suscripción de MercadoPago
router.post("/reactivate-subscription", async (req, res) => {
  const { userId } = req.body;

  try {
    if (!userId) return res.status(400).json({ error: "userId requerido" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    if (!user.subscriptionId) {
      return res.status(400).json({ error: "No se encontró una suscripción activa" });
    }

    // Lógica para MercadoPago PreApproval
    if (user.subscriptionId.startsWith("mp_sub_")) {
      const id = user.subscriptionId.replace("mp_sub_", "");
      try {
        await MercadoPagoService.reactivatePreApproval(id);
        
        // Actualizar estado del usuario en la BD
        const updatedUser = await User.findByIdAndUpdate(
          userId,
          { planLevel: user.planLevel, subscriptionStatus: "active" },
          { new: true }
        );

        logger.info(`Suscripción MP ${id} reactivada para usuario ${userId}`);
        
        return res.json({
          message: "¡Suscripción reactivada exitosamente! Volverás a recibir tus renovaciones automáticas.",
          planLevel: updatedUser.planLevel,
        });
      } catch (error) {
        logger.error("Error reactivando PreApproval", { error: error.message });
        return res.status(500).json({ error: "Error al reactivar la suscripción: " + error.message });
      }
    }

    // Para Wompi, no hay reactivación automática (es pago único)
    if (user.subscriptionId.startsWith("wompi_")) {
      return res.status(400).json({ 
        error: "Tu suscripción Wompi no tiene renovación automática. Puedes hacer una nueva compra en Pricing." 
      });
    }

    return res.status(400).json({ error: "Tipo de suscripción no reconocido" });
  } catch (error) {
    logger.error("Error en reactivate-subscription", { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
