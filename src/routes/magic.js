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
  let {
    contactId,
    occasion,
    tone,
    contextWords, // <-- Faltaba extraer esto
    receivedText,
    formatInstruction,
  } = req.body;

  const user = req.user;

  // Si contextWords es un array, lo convertimos a string para evitar errores de .trim() en PlanService
  if (Array.isArray(contextWords)) {
    contextWords = contextWords.join(", ");
  }

  try {
    // 1. Validar acceso - Ahora contextWords existe
    PlanService.validateAccess(user, { occasion, tone, contextWords });

    const aiConfig = PlanService.getAIConfig(user.planLevel);

    // 3. Contexto del Guardián
    let guardianContext = {
      relationalHealth: 5,
      snoozeCount: 0,
      guardianMetadata: null,
    };
    if (contactId && user._id) {
      // <-- Validación de seguridad para invitados
      const context = await GuardianService.getContext(user._id, contactId);
      guardianContext = { ...guardianContext, ...context };
    }

    // 3. Ejecución Resiliente con el Orquestador
    // El orquestador ahora maneja internamente el delay y los reintentos (503)
    const generatedText = await AIOrchestrator.executeWithFallback(
      user.planLevel,
      guardianContext.relationalHealth,
      async (selectedModel) => {
        // Configuramos la data para la IA incluyendo los nuevos metadatos de aprendizaje
        const generationData = {
          ...req.body,
          contextWords, // Usamos la versión saneada
          planLevel: user.planLevel,
          relationalHealth: guardianContext.relationalHealth,
          snoozeCount: guardianContext.snoozeCount,
          neutralMode: user.preferences?.neutralMode,
          modelOverride: selectedModel,
          grammaticalGender: user.preferences?.grammaticalGender,
          // Inyectamos el aprendizaje del usuario
          lastUserStyle: guardianContext.lastUserStyle,
          preferredLexicon: guardianContext.preferredLexicon,
        };

        return await AIService.generate(aiConfig, generationData);
      },
    );

    // 4. Post-procesamiento (Sin await para no bloquear la respuesta)
    // El .catch es vital aquí para que un error en BD no mate la respuesta del usuario
    Promise.all([
      user.incrementUsage(),
      contactId && user._id
        ? GuardianService.recordInteraction(user._id, contactId, {
            content: generatedText,
            occasion,
            tone,
            ...req.body,
            contextWords, // Usamos la versión saneada
          })
        : Promise.resolve(),
    ]).catch((err) => logger.error("Error en post-procesamiento", err));

    // 7. Respuesta
    const planMetadata = PlanService.getPlanMetadata(user.planLevel);
    res.json({
      result: generatedText,
      monetization: planMetadata.monetization,
      remaining_credits:
        planMetadata.access.daily_limit - (user.usage?.generationsCount || 0),
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
