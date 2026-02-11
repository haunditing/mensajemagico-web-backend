const SystemUsage = require("../models/SystemUsage");
const logger = require("../utils/logger");

const MODELS = {
  GUEST: process.env.AI_MODEL_GUEST || "gemma-3-4b-it",
  FREE: process.env.AI_MODEL_FREE || "gemma-3-12b-it",
  PREMIUM_EFFICIENT: process.env.AI_MODEL_PREMIUM_EFFICIENT || "gemma-3-27b-it",
  GEMINI_3: process.env.AI_MODEL_GEMINI_3 || "gemini-3-flash-preview",
  GEMINI_25: process.env.AI_MODEL_GEMINI_25 || "gemini-2.5-flash",
  GEMINI_LITE: process.env.AI_MODEL_GEMINI_LITE || "gemini-2.5-flash-lite",  // --- MODELO DE AUDIO (Si llegas a usar notas de voz) ---
  AUDIO: "gemini-2.5-flash-native-audio-latest",
};

const QUOTAS = {
  [MODELS.GEMINI_3]: 20,
  [MODELS.GEMINI_25]: 20,
  [MODELS.GEMINI_LITE]: 20,
  [MODELS.PREMIUM_EFFICIENT]: 14400,
};

/**
 * Determina el modelo inicial basado en el plan y salud.
 */
const getInitialStrategy = async (planLevel, relationalHealth = 5) => {
  if (planLevel === "guest") return { model: MODELS.GUEST, delay: 8000 };
  if (planLevel === "freemium") return { model: MODELS.FREE, delay: 3000 };

  if (planLevel === "premium") {
    if (relationalHealth >= 8) {
      const geminiTier = [
        MODELS.GEMINI_3,
        MODELS.GEMINI_25,
        MODELS.GEMINI_LITE,
      ];
      for (const modelId of geminiTier) {
        const usage = await SystemUsage.getCount(modelId);
        if (usage < QUOTAS[modelId]) return { model: modelId, delay: 0 };
      }
    }
    return { model: MODELS.PREMIUM_EFFICIENT, delay: 0 };
  }
  return { model: MODELS.PREMIUM_EFFICIENT, delay: 0 };
};

/**
 * EJECUCIÓN CON RESILIENCIA:
 * Si el modelo elegido falla por 503, intenta con el "modelo de rescate" (Gemini Flash).
 */
const executeWithFallback = async (
  planLevel,
  relationalHealth,
  apiCallFunction,
) => {
  const strategy = await getInitialStrategy(planLevel, relationalHealth);

  try {
    // Intento 1 con el modelo ideal
    logger.info(`AIOrchestrator: Ejecutando estrategia principal`, { model: strategy.model });
    return await apiCallFunction(strategy.model);
  } catch (error) {
    const isServiceUnavailable =
      error.message?.includes("503") || error.status === 503;

    // Si el error es saturación, activamos el plan de rescate
    if (isServiceUnavailable) {
      logger.warn(
        `Orquestador: ${strategy.model} saturado (503). Activando Fallback.`,
      );

      // El modelo de rescate por excelencia es Gemini 2.5 Flash por su alta disponibilidad
      const fallbackModel = MODELS.GEMINI_25;

      try {
        logger.info(
          `Orquestador: Reintentando con modelo de rescate ${fallbackModel}`,
        );
        return await apiCallFunction(fallbackModel);
      } catch (fallbackError) {
        logger.error("Orquestador: El modelo de rescate también falló.");
        throw fallbackError;
      }
    }

    // Si es otro tipo de error (400, 401), lo lanzamos normal
    throw error;
  }
};

module.exports = { executeWithFallback, MODELS };
