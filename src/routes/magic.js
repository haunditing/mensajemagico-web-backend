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
  // CORRECCIÓN: Extraer todas las variables necesarias de req.body
  const { 
    contactId, 
    occasion, 
    tone, 
    contextWords, // <-- Faltaba extraer esto
    receivedText, 
    formatInstruction 
  } = req.body;
  
  const user = req.user;

  try {
    // 1. Validar acceso - Ahora contextWords existe
    PlanService.validateAccess(user, { occasion, tone, contextWords });

    const aiConfig = PlanService.getAIConfig(user.planLevel);

    // 3. Contexto del Guardián
    let guardianContext = { relationalHealth: 5, snoozeCount: 0 };
    if (contactId && user._id) { // <-- Validación de seguridad para invitados
      const context = await GuardianService.getContext(user._id, contactId);
      guardianContext = { ...guardianContext, ...context };
    }

    // 4. Orquestador
    const strategy = await AIOrchestrator.getRequestStrategy(
      user.planLevel,
      guardianContext.relationalHealth
    );

    if (strategy.delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, strategy.delay));
    }

    const generationData = {
      ...req.body, // Incluye contextWords, tone, etc.
      planLevel: user.planLevel,
      relationalHealth: guardianContext.relationalHealth,
      neutralMode: user.preferences?.neutralMode,
      modelOverride: strategy.model,
    };

    // 5. Ejecución con Fallback
    let generatedText;
    try {
      generatedText = await AIService.generate(aiConfig, generationData);
    } catch (error) {
      if (error.statusCode === 429 || error.message.includes("quota")) {
        logger.warn(`Fallback activo para ${strategy.model}`);
        generationData.modelOverride = AIOrchestrator.MODELS.PREMIUM_EFFICIENT;
        generatedText = await AIService.generate(aiConfig, generationData);
      } else {
        throw error;
      }
    }

    // 6. Post-procesamiento (Sin await para no bloquear la respuesta)
    // El .catch es vital aquí para que un error en BD no mate la respuesta del usuario
    Promise.all([
      user.incrementUsage(),
      (contactId && user._id) 
        ? GuardianService.recordInteraction(user._id, contactId, {
            content: generatedText,
            occasion,
            tone,
            ...req.body
          })
        : Promise.resolve(),
    ]).catch(err => logger.error("Error en post-procesamiento", err));

    // 7. Respuesta
    const planMetadata = PlanService.getPlanMetadata(user.planLevel);
    res.json({
      result: generatedText,
      monetization: planMetadata.monetization,
      remaining_credits: planMetadata.access.daily_limit - (user.usage?.generationsCount || 0),
    });

  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        upsell: err.upsell,
      });
    }
    logger.error("Error en la generación de magia", { error: err.message });
    res.status(500).json({ error: "Error en la magia" });
  }
});

module.exports = router;
