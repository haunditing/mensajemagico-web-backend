const express = require("express");
const router = express.Router();
const User = require("../models/User");
const PlanService = require("../services/PlanService");
const AIService = require("../services/AIService");
const logger = require("../utils/logger");
const GuardianService = require("../services/GuardianService");
const AIOrchestrator = require("../services/AIOrchestrator");

// Middleware simulado para obtener usuario
const getUser = async (req, res, next) => {
  const { userId } = req.body;

  if (userId) {
    try {
      const user = await User.findById(userId);
      if (user) {
        req.user = user;
        return next();
      }
    } catch (error) {
      // Si el ID es inválido, continuamos como invitado
    }
  }

  // Fallback para invitados (Guest)
  req.user = {
    planLevel: "guest",
    usage: { generationsCount: 0 }, // El backend no persiste el uso de invitados (lo hace el frontend)
    checkDailyReset: () => {},
    incrementUsage: async () => {},
  };
  next();
};

router.post("/generate", getUser, async (req, res) => {
  const { contactId, occasion, tone } = req.body;
  const user = req.user;

  try {
    // 1. Validar acceso (Centralizado en el servicio)
    // Lanza error con upsell si falla alguna validación
    PlanService.validateAccess(user, { occasion, tone, contextWords });

    // 2. Obtener configuración base de IA para este plan
    const aiConfig = PlanService.getAIConfig(user.planLevel);

    // 3. Contexto del Guardián (Uso de Embeddings - 1000 RPD)
    let guardianContext = { relationalHealth: 5, snoozeCount: 0 };
    if (contactId) {
      const context = await GuardianService.getContext(user._id, contactId);
      guardianContext = { ...guardianContext, ...context };
    }

    // 4. ORQUESTADOR: Definir estrategia (Selección inteligente entre Gemini 3, 2.5 y Lite)
    const strategy = await AIOrchestrator.getRequestStrategy(
      user.planLevel,
      guardianContext.relationalHealth,
    );

    // Delay para Guest (Incentivo de Conversión)
    if (strategy.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, strategy.delay));
    }

    const generationData = {
      ...req.body,
      planLevel: user.planLevel,
      relationalHealth: guardianContext.relationalHealth,
      neutralMode: user.preferences?.neutralMode,
      modelOverride: strategy.model, // Modelo inicial (ej: Gemini 3 Flash - 20 RPD)
    };

    // 5. EJECUCIÓN CON RECURSIVIDAD DE SEGURIDAD (Fallback en Cascada)
    let generatedText;
    try {
      generatedText = await AIService.generate(aiConfig, generationData);
    } catch (error) {
      // Si falla por cuota (429), el Orquestador ahora provee el siguiente mejor modelo disponible
      // Esto nos permite agotar los 60 créditos de la familia Gemini
      if (error.statusCode === 429 || error.message.includes("quota")) {
        logger.warn(
          `Cuota agotada para ${strategy.model}. Buscando modelo de respaldo...`,
        );

        // Intentamos el "Tanque Masivo" (Gemma 3 - 14.4K RPD) como fallback final
        generationData.modelOverride = AIOrchestrator.MODELS.PREMIUM_EFFICIENT;
        generatedText = await AIService.generate(aiConfig, generationData);
      } else {
        throw error;
      }
    }
    // 6. POST-PROCESAMIENTO
    await Promise.all([
      user.incrementUsage(),
      contactId
        ? GuardianService.recordInteraction(user._id, contactId, {
            content: generatedText,
            ...req.body,
          })
        : Promise.resolve(),
    ]);

    // 7. RESPUESTA CON METADATOS
    const planMetadata = PlanService.getPlanMetadata(user.planLevel);
    res.json({
      result: generatedText,
      monetization: planMetadata.monetization,
      remaining_credits:
        planMetadata.access.daily_limit - user.usage.generationsCount,
    });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        upsell: err.upsell,
      });
    }
    logger.error("Error en la generación de magia", { error: err });
    res.status(500).json({ error: "Error en la magia" });
  }
});

module.exports = router;
