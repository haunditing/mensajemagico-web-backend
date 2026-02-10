const express = require("express");
const router = express.Router();
const User = require("../models/User");
const PlanService = require("../services/PlanService");
const AIService = require("../services/AIService");
const logger = require("../utils/logger");
const GuardianService = require("../services/GuardianService");

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
  const {
    occasion,
    tone,
    contextWords,
    relationship,
    receivedText,
    formatInstruction,
    userLocation, // Recibimos la ubicación (puede venir del frontend o un middleware de IP)
    snoozeCount,
    relationalHealth,
    contactId,
  } = req.body;
  const user = req.user;

  try {
    // 1. Validar acceso (Centralizado en el servicio)
    // Lanza error con upsell si falla alguna validación
    PlanService.validateAccess(user, { occasion, tone, contextWords });

    // 2. Obtener configuración de IA para este plan
    const aiConfig = PlanService.getAIConfig(user.planLevel);

    // 2.5 Lógica del Guardián: Obtener contexto de la relación
    let guardianContext = {
      snoozeCount: snoozeCount || 0,
      relationalHealth: relationalHealth || 5,
    };

    if (contactId) {
      const context = await GuardianService.getContext(user._id, contactId);
      guardianContext = { ...guardianContext, ...context };
    }

    // 3. Llamada al servicio de IA
    const generatedText = await AIService.generate(aiConfig, {
      occasion,
      tone,
      contextWords,
      relationship,
      receivedText,
      formatInstruction,
      userLocation,
      planLevel: user.planLevel, // Pasamos el nivel de plan para la lógica condicional
      neutralMode: user.preferences?.neutralMode, // Preferencia de modo neutro
      snoozeCount: guardianContext.snoozeCount,
      relationalHealth: guardianContext.relationalHealth,
    });

    // 4. Incrementar uso
    await user.incrementUsage();

    // 4.5 Guardar historial en el Guardián (Si hay un contacto asociado)
    if (contactId) {
      await GuardianService.recordInteraction(user._id, contactId, {
        occasion,
        tone,
        content: generatedText
      });
    }

    // 5. Respuesta final
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
