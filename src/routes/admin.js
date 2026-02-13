const express = require("express");
const router = express.Router();
const adminController = require("../controller/adminController");
const { verifyToken } = require("../middleware/auth");
const User = require("../models/User");
const MercadoPagoService = require("../services/MercadoPagoService");
const PLAN_CONFIG = require("../config/plans");
const logger = require("../utils/logger");

// Middleware específico para verificar rol admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Requiere rol de Administrador" });
};

// Ruta de Login (Pública)
router.post("/login", adminController.loginAdmin);

// Esta será la URL: midominio.com/api/admin/logs
router.get("/logs", verifyToken, isAdmin, adminController.getStreamLogs);

// Actualización masiva de precios MP (Ej. Fin de oferta)
router.post("/update-mp-prices", verifyToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find({
      planLevel: "premium",
      subscriptionId: { $regex: /^mp_sub_/ },
    });

    const monthlyPrice = PLAN_CONFIG.subscription_plans.premium.pricing_hooks.mercadopago_price_monthly;
    const yearlyPrice = PLAN_CONFIG.subscription_plans.premium.pricing_hooks.mercadopago_price_yearly;
    
    let stats = { total: users.length, updated: 0, errors: 0, skipped: 0 };

    // Procesamos en serie para no saturar la API de MP (Rate Limiting)
    for (const user of users) {
      const subscriptionId = user.subscriptionId.replace("mp_sub_", "");
      try {
        const sub = await MercadoPagoService.getPreApproval(subscriptionId);
        
        if (sub.status === "authorized" || sub.status === "pending") {
             const currentPrice = sub.auto_recurring.transaction_amount;
             const frequency = sub.auto_recurring.frequency;
             
             // Determinar precio correcto
             let targetPrice = (frequency === 12) ? yearlyPrice : monthlyPrice;
             
             if (currentPrice !== targetPrice) {
                 await MercadoPagoService.updateSubscription(subscriptionId, targetPrice);
                 stats.updated++;
                 logger.info(`Admin: Precio actualizado para ${user.email} -> ${targetPrice}`);
             } else {
                 stats.skipped++;
             }
        } else {
            stats.skipped++;
        }
      } catch (e) {
        logger.error(`Admin: Error actualizando sub ${subscriptionId}`, { error: e.message });
        stats.errors++;
      }
    }

    res.json({ message: "Proceso completado", stats });
  } catch (error) {
    logger.error("Error en actualización masiva MP", { error });
    res.status(500).json({ error: "Error interno al procesar actualizaciones" });
  }
});

module.exports = router;
