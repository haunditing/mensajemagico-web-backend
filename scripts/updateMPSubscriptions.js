// scripts/updateMPSubscriptions.js
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const MercadoPagoService = require("../src/services/MercadoPagoService");
const PLAN_CONFIG = require("../src/config/plans");
const logger = require("../src/utils/logger");

// Helper para pausar la ejecución (evitar Rate Limiting)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  // Capturar argumentos de línea de comandos para modo seguro
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dryRun");

  try {
    logger.info("Iniciando script de actualización de precios MP...");
    if (isDryRun) {
      logger.warn("⚠️ MODO DRY RUN ACTIVADO: No se realizarán cambios reales.");
    }

    await mongoose.connect(process.env.MONGO_URI);
    logger.info("Conectado a MongoDB");

    // 1. Buscar usuarios Premium con suscripción de Mercado Pago
    const users = await User.find({
      planLevel: "premium",
      subscriptionId: { $regex: /^mp_sub_/ },
    });

    logger.info(
      `Analizando ${users.length} usuarios Premium con suscripción MP...`,
    );

    // Precios objetivo (Los configurados actualmente como "reales")
    const monthlyPrice =
      PLAN_CONFIG.subscription_plans.premium.pricing_hooks
        .mercadopago_price_monthly;
    const yearlyPrice =
      PLAN_CONFIG.subscription_plans.premium.pricing_hooks
        .mercadopago_price_yearly;

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const user of users) {
      // Pausa de 500ms entre cada usuario para no saturar la API
      await sleep(500);

      const subscriptionId = user.subscriptionId.replace("mp_sub_", "");

      try {
        // 2. Obtener estado actual en Mercado Pago
        const sub = await MercadoPagoService.getPreApproval(subscriptionId);

        // Solo procesar suscripciones activas o pendientes
        if (sub.status !== "authorized" && sub.status !== "pending") {
          skippedCount++;
          continue;
        }

        const currentPrice = sub.auto_recurring.transaction_amount;
        const frequency = sub.auto_recurring.frequency; // 1 (meses) o 12 (meses/año)

        // 3. Determinar precio objetivo según la frecuencia
        let targetPrice;
        if (frequency === 1) targetPrice = monthlyPrice;
        else if (frequency === 12) targetPrice = yearlyPrice;
        else {
          logger.warn(
            `Frecuencia desconocida (${frequency}) para usuario ${user.email}`,
          );
          skippedCount++;
          continue;
        }

        // 4. Actualizar si hay discrepancia
        if (currentPrice !== targetPrice) {
          logger.info(`Usuario ${user.email}: Precio actual $${currentPrice} -> Nuevo $${targetPrice}`);
          
          if (!isDryRun) {
            await MercadoPagoService.updateSubscription(
              subscriptionId,
              targetPrice,
            );
            logger.info(`✅ Actualizado correctamente.`);
          } else {
            logger.info(`[DRY RUN] Se hubiera actualizado.`);
          }
          updatedCount++;
        } else {
          skippedCount++;
        }
      } catch (err) {
        logger.error(
          `Error con usuario ${user.email} (Sub: ${subscriptionId}): ${err.message}`,
        );
        errorCount++;
      }
    }

    logger.info("------------------------------------------------");
    logger.info(`Proceso finalizado ${isDryRun ? "(DRY RUN)" : ""}.`);
    logger.info(`Candidatos a actualizar: ${updatedCount}`);
    logger.info(`Omitidos (Ya correctos o inactivos): ${skippedCount}`);
    logger.info(`Errores: ${errorCount}`);
    logger.info("------------------------------------------------");

    process.exit(0);
  } catch (error) {
    logger.error("Error fatal en el script:", error);
    process.exit(1);
  }
}

run();
