// src/services/AIOrchestrator.js
const SystemUsage = require("../models/SystemUsage");
const logger = require("../utils/logger");

const MODELS = {
  // --- FAMILIA GEMMA 3 (14,400 RPD - El Tanque Masivo) ---
  GUEST: process.env.AI_MODEL_GUEST || "gemma-3-4b-it",
  FREE: process.env.AI_MODEL_FREE || "gemma-3-12b-it",
  PREMIUM_EFFICIENT: process.env.AI_MODEL_PREMIUM_EFFICIENT || "gemma-3-27b-it",

  // --- FAMILIA GEMINI (20 RPD cada uno - Los Especialistas) ---
  GEMINI_3: process.env.AI_MODEL_GEMINI_3 || "gemini-3-flash-preview", // Tu modelo top
  GEMINI_25: process.env.AI_MODEL_GEMINI_25 || "gemini-2.5-flash", // Alta fidelidad
  GEMINI_LITE: process.env.AI_MODEL_GEMINI_LITE || "gemini-2.5-flash-lite", // Rápido y pro

  // --- MODELO DE AUDIO (Si llegas a usar notas de voz) ---
  AUDIO: "gemini-2.5-flash-native-audio-latest",
};

const QUOTAS = {
  [MODELS.GEMINI_3]: 20, //
  [MODELS.GEMINI_25]: 20, //
  [MODELS.GEMINI_LITE]: 20, //
  [MODELS.PREMIUM_EFFICIENT]: 14400, //
};

const getRequestStrategy = async (planLevel, relationalHealth = 5) => {
  let strategy = { model: MODELS.PREMIUM_EFFICIENT, delay: 0 };

  if (planLevel === "guest") {
    return { model: MODELS.GUEST, delay: 8000 };
  }

  if (planLevel === "freemium") {
    return { model: MODELS.FREE, delay: 0 };
  }

  if (planLevel === "premium") {
    // 1. Si la salud es alta, intentamos la "Escalera Gemini"
    if (relationalHealth >= 8) {
      // Intentamos en orden de calidad: 3 -> 2.5 -> Lite
      const geminiTier = [
        MODELS.GEMINI_3,
        MODELS.GEMINI_25,
        MODELS.GEMINI_LITE,
      ];

      for (const modelId of geminiTier) {
        const usage = await SystemUsage.getCount(modelId);
        if (usage < QUOTAS[modelId]) {
          logger.info(
            `Orquestador: Asignado ${modelId} (${usage}/${QUOTAS[modelId]})`,
          );
          return { model: modelId, delay: 0 };
        }
      }

      // 2. Si todo Gemini está agotado, usamos el Tanque Gemma 27B
      logger.warn(
        "Orquestador: Toda la cuota Gemini agotada. Usando Gemma 27B.",
      );
      return { model: MODELS.PREMIUM_EFFICIENT, delay: 0 };
    }

    // 3. Para salud media/baja, usamos directamente el modelo eficiente
    return { model: MODELS.PREMIUM_EFFICIENT, delay: 0 };
  }

  return strategy;
};

module.exports = { getRequestStrategy, MODELS };
