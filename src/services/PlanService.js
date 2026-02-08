const PLAN_CONFIG = require('../config/plans');

const validateAccess = (user, { occasion, tone, contextWords }) => {
  const planConfig = PLAN_CONFIG.subscription_plans[user.planLevel];
  if (!planConfig) throw new Error("Configuración de plan no encontrada");

  // 1. Verificar daily_limit usando el método del modelo
  user.checkDailyReset();
  if (user.usage.generationsCount >= planConfig.access.daily_limit) {
    const error = new Error("Límite diario alcanzado");
    error.statusCode = 403;
    error.upsell = PLAN_CONFIG.global_upsell_triggers.on_limit_reached;
    throw error;
  }

  // 2. Validar Ocasión
  const allowedOccasions = planConfig.access.occasions;
  if (!allowedOccasions.includes("all") && !allowedOccasions.includes(occasion)) {
    const error = new Error("Ocasión bloqueada en tu plan");
    error.statusCode = 403;
    error.upsell = PLAN_CONFIG.global_upsell_triggers.on_locked_occasion;
    throw error;
  }

  // 3. Validar Tono
  const allowedTones = planConfig.access.exclusive_tones;
  if (
    (allowedTones === false && tone) || // El plan no permite tonos pero se envió uno
    (Array.isArray(allowedTones) && !allowedTones.includes("all") && !allowedTones.includes(tone))
  ) {
    const error = new Error("Tono exclusivo");
    error.statusCode = 403;
    error.upsell = PLAN_CONFIG.global_upsell_triggers.on_locked_tone;
    throw error;
  }

  // 4. Validar Límite de Palabras de Contexto
  if (contextWords) {
    const wordCount = contextWords.trim().split(/\s+/).length;
    if (wordCount > planConfig.access.context_words_limit) {
      const error = new Error(`Tu plan solo permite ${planConfig.access.context_words_limit} palabras de contexto.`);
      error.statusCode = 400;
      throw error;
    }
  }
};

const getAIConfig = (planLevel) => {
  const planConfig = PLAN_CONFIG.subscription_plans[planLevel];
  const { model, temperature, max_tokens, prompt_style } = planConfig.ai_config;
  
  return {
    model,
    temperature,
    max_tokens,
    prompt_style
  };
};

// Helpers para obtener metadatos del plan necesarios para la respuesta
const getPlanMetadata = (planLevel) => {
  return PLAN_CONFIG.subscription_plans[planLevel];
};

module.exports = {
  validateAccess,
  getAIConfig,
  getPlanMetadata
};