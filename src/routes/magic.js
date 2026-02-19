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

router.post("/generate", getUser, async (req, res, next) => {
  // CORRECCIÓN: Extraer todas las variables necesarias de req.body
  let {
    contactId,
    occasion,
    tone,
    contextWords, // <-- Faltaba extraer esto
    receivedText,
    formatInstruction,
    intention,
    relationship,
    greetingMoment,
    apologyReason,
  } = req.body;

  const user = req.user;

  // Si contextWords es un array, lo convertimos a string para evitar errores de .trim() en PlanService
  if (Array.isArray(contextWords)) {
    contextWords = contextWords.join(", ");
  }

  try {
    // 1. Validar acceso - Ahora contextWords existe
    PlanService.validateAccess(user, {
      occasion,
      tone,
      contextWords,
      intention,
    });

    const aiConfig = PlanService.getAIConfig(user.planLevel);

    // 3. Contexto del Guardián
    let guardianContext = {
      relationalHealth: req.body.relationalHealth || 5, // Prioridad al dato del frontend si no hay contacto guardado
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
          grammaticalGender: user.preferences?.grammaticalGender || req.body.grammaticalGender, // Fallback para Guest
          // Inyectamos el aprendizaje del usuario
          lastUserStyle: guardianContext.lastUserStyle,
          preferredLexicon: guardianContext.preferredLexicon,
        };

        return await AIService.generate(aiConfig, generationData);
      },
    );
    // 🚀 AGREGA EL LOG AQUÍ (Justo antes del post-procesamiento)
    logger.info({
      message: "Transacción IA: Generación Exitosa",
      peticion: {
        userId: user._id || "guest",
        plan: user.planLevel,
        input: {
          occasion,
          relationship,
          tone,
          intention,
          contextWords,
          receivedText,
          grammaticalGender: user.preferences?.grammaticalGender || req.body.grammaticalGender,
        },
      },
      respuesta: {
        result: generatedText,
      },
    });
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
            grammaticalGender: user.preferences?.grammaticalGender || req.body.grammaticalGender,
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
    next(err);
  }
});

router.post("/generate-stream", getUser, async (req, res) => {
  let {
    contactId,
    occasion,
    tone,
    contextWords,
    receivedText,
    formatInstruction,
    intention,
    relationship,
    greetingMoment,
    apologyReason,
  } = req.body;

  const user = req.user;

  if (Array.isArray(contextWords)) {
    contextWords = contextWords.join(", ");
  }

  try {
    // 1. Validar acceso
    PlanService.validateAccess(user, {
      occasion,
      tone,
      contextWords,
      intention,
    });

    const aiConfig = PlanService.getAIConfig(user.planLevel);

    // 2. Contexto del Guardián
    let guardianContext = {
      relationalHealth: req.body.relationalHealth || 5,
      snoozeCount: 0,
      guardianMetadata: null,
    };
    if (contactId && user._id) {
      const context = await GuardianService.getContext(user._id, contactId);
      guardianContext = { ...guardianContext, ...context };
    }

    // 3. Preparar datos
    const generationData = {
      ...req.body,
      contextWords,
      planLevel: user.planLevel,
      relationalHealth: guardianContext.relationalHealth,
      snoozeCount: guardianContext.snoozeCount,
      neutralMode: user.preferences?.neutralMode,
      grammaticalGender: user.preferences?.grammaticalGender || req.body.grammaticalGender,
      lastUserStyle: guardianContext.lastUserStyle,
      preferredLexicon: guardianContext.preferredLexicon,
    };

    // Headers para streaming de texto (Solo si pasamos las validaciones)
    res.setHeader("Content-Type", "text/plain; charset=utf-8");

    // Fix para Safari/iOS: Enviar padding inicial (~1KB) para forzar el flush del buffer
    res.write(" ".repeat(1024));

    // 4. Iniciar Stream con Orquestador (Maneja Fallback 429/503 automáticamente)
    const stream = AIOrchestrator.executeStreamWithFallback(
      user.planLevel,
      guardianContext.relationalHealth,
      (modelOverride) => {
         // Inyectamos el modelo seleccionado por el orquestador en los datos
         return AIService.generateStream(aiConfig, { ...generationData, modelOverride });
      }
    );
    
    for await (const chunk of stream) {
      res.write(chunk);
    }

    // Registrar consumo del usuario al finalizar el stream con éxito
    if (user.incrementUsage) {
      await user.incrementUsage();
    }

    res.end();
  } catch (error) {
    logger.error("Stream Error", error);
    if (!res.headersSent) {
      res.status(error.statusCode || 500).json({ error: error.message });
    } else {
      res.end();
    }
  }
});

// POST /api/magic/generate-image
router.post("/generate-image", getUser, async (req, res, next) => {
  const { prompt } = req.body;
  const user = req.user;

  if (!prompt) {
    return res.status(400).json({ error: "El prompt es obligatorio" });
  }

  try {
    const aiConfig = PlanService.getAIConfig(user.planLevel);
    const imageModel = AIOrchestrator.MODELS.IMAGE;

    const result = await AIService.generateImage(
      { ...aiConfig, model: imageModel },
      { prompt }
    );

    if (user.incrementUsage) {
      await user.incrementUsage();
    }

    res.json({ result });
  } catch (error) {
    next(error);
  }
});

// POST /api/magic/mark-used - Feedback Loop (Cerrar el ciclo de aprendizaje)
router.post("/mark-used", getUser, async (req, res) => {
  const { contactId, content, originalContent, occasion, tone } = req.body;
  const user = req.user;

  if (!user._id || !contactId) return res.status(200).send(); // Ignorar silenciosamente si es invitado

  try {
    await GuardianService.markAsUsed(user._id, contactId, content, {
      occasion,
      tone,
      originalContent,
    });
    res.json({ success: true });
  } catch (error) {
    logger.error("Error marking message as used", error);
    res.status(500).json({ error: "Error processing feedback" });
  }
});

module.exports = router;
