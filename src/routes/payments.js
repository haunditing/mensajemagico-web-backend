const express = require("express");
const router = express.Router();
const Stripe = require("stripe");
const User = require("../models/User");
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
      const sub = await stripe.subscriptions.retrieve(user.subscriptionId);
      subscriptionInfo = {
        renewalDate: new Date(sub.current_period_end * 1000),
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        status: sub.status,
      };
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
