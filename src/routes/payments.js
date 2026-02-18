const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const User = require("../models/User");
const MercadoPagoService = require("../services/MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");
const logger = require("../utils/logger");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 1. Crear sesión de Checkout
router.post("/create-checkout-session", async (req, res) => {
  const { userId, interval } = req.body; // interval: 'monthly' o 'yearly'
  const clientUrl = process.env.CLIENT_URL || req.headers.origin || "http://www.mensajemagico.com";

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    const premiumConfig = PLAN_CONFIG.subscription_plans.premium;

    // Seleccionar el Price ID correcto basado en tu config
    const priceId =
      interval === "yearly"
        ? premiumConfig.pricing_hooks.stripe_price_id_yearly
        : premiumConfig.pricing_hooks.stripe_price_id_monthly;

    let customerId = user.stripeCustomerId;

    // Si el usuario no tiene ID de Stripe, crearlo
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await user.save();
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${clientUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/pricing`,
      metadata: { userId: user._id.toString() },
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Webhook de Stripe (CRÍTICO para actualizar la DB)
// Nota: Este endpoint debe usar express.raw() en el server.js
router.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    logger.error(`Error de firma en Webhook: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`Evento de Webhook recibido: ${event.type}`);

  try {
    // Manejar eventos
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata ? session.metadata.userId : null;

      if (userId) {
        logger.info(`Procesando actualización a Premium para usuario: ${userId}`);
        // Actualizar usuario a Premium
        const updatedUser = await User.findByIdAndUpdate(userId, {
          planLevel: "premium",
          subscriptionId: session.subscription,
        }, { new: true });

        if (updatedUser) logger.info(`Usuario ${userId} actualizado a Premium exitosamente`);
        else logger.error(`No se encontró el usuario ${userId} en la base de datos`);
      } else {
        logger.warn(`Sesión completada sin userId en metadata: ${session.id}`);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      // Buscar usuario por subscriptionId y bajarlo a Freemium
      await User.findOneAndUpdate(
        { subscriptionId: subscription.id },
        {
          planLevel: "freemium",
          subscriptionId: null,
        },
      );
      logger.info(`Suscripción ${subscription.id} finalizada. Usuario degradado.`, { subscriptionId: subscription.id });
    } else if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      // Asegurar que, en cada renovación exitosa, el usuario mantenga su estatus Premium
      if (invoice.subscription) {
        await User.findOneAndUpdate(
          { subscriptionId: invoice.subscription },
          { planLevel: "premium" }
        );
        logger.info(`Renovación exitosa para suscripción ${invoice.subscription}`, { subscriptionId: invoice.subscription });
      }
    }
  } catch (error) {
    logger.error("Error en procesamiento de Webhook", { error });
  }

  res.json({ received: true });
});

// 3. Endpoint para consultar estado de suscripción
router.get("/subscription-status", async (req, res) => {
  const { userId } = req.query;

  try {
    if (!userId) return res.status(400).json({ error: "userId requerido" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    let subscriptionInfo = null;

    if (user.subscriptionId) {
      // Detectar si es MercadoPago (prefijo mp_) o Stripe
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
        // Lógica original de Stripe
        const sub = await stripe.subscriptions.retrieve(user.subscriptionId);
        subscriptionInfo = {
          renewalDate: new Date(sub.current_period_end * 1000),
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          status: sub.status,
          provider: "stripe"
        };
      }
    }

    res.json({ planLevel: user.planLevel, subscription: subscriptionInfo });
  } catch (error) {
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

    const subscription = await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      message: "La suscripción se cancelará al final del periodo actual",
      cancelAt: new Date(subscription.current_period_end * 1000),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Endpoint para reactivar suscripción (arrepentimiento)
router.post("/reactivate-subscription", async (req, res) => {
  const { userId } = req.body;

  try {
    if (!userId) return res.status(400).json({ error: "userId requerido" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

    if (!user.subscriptionId) {
      return res.status(400).json({ error: "No se encontró una suscripción activa" });
    }

    const subscription = await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: false,
    });

    res.json({
      message: "Suscripción reactivada. Se renovará automáticamente.",
      renewalDate: new Date(subscription.current_period_end * 1000),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
