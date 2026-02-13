// src/config/plans.js

const PLAN_CONFIG = {
  subscription_plans: {
    guest: {
      id: "plan_guest",
      name: "Invitado",
      monetization: {
        show_ads: true,
        watermark: true,
      },
      access: {
        daily_limit: 3,
        occasions: [
          "pensamiento",
          "responder",
          "amor",
          "birthday",
          "anniversary",
          "perdoname",
        ],
        exclusive_tones: [
          "romántico",
          "divertido",
          "corto",
          "formal",
          "profundo",
        ],
        context_words_limit: 0, // Bloqueado para invitados
      },
      ai_config: {
        model: process.env.AI_MODEL_GUEST || "gemini-2.5-flash",
        temperature: process.env.AI_TEMP_GUEST ? Number(process.env.AI_TEMP_GUEST) : 0.5,
        prompt_style: "Eres un asistente útil, breve y directo.",
        length_instruction: "IMPORTANTE: El mensaje debe ser muy corto (máximo 2 frases).",
      },
    },
    freemium: {
      id: "plan_free",
      name: "Mágico Free",
      monetization: {
        show_ads: true,
        watermark: true,
      },
      access: {
        daily_limit: 5,
        occasions: ["all"],
        exclusive_tones: [
          "romántico",
          "divertido",
          "corto",
          "formal",
          "profundo",
          "directo",
          "sutil",
        ],
        context_words_limit: 0, // Bloqueado para free
      },
      ai_config: {
        model: process.env.AI_MODEL_FREE || "gemini-2.5-flash",
        temperature: process.env.AI_TEMP_FREE ? Number(process.env.AI_TEMP_FREE) : 0.75,
        prompt_style: "Eres un asistente creativo, amigable y empático.",
        length_instruction: "IMPORTANTE: El mensaje debe ser conciso (máximo 1 párrafo breve).",
      },
    },
    premium: {
      id: "plan_premium_gold",
      name: "Mágico Premium",
      monetization: {
        show_ads: false,
        watermark: false,
      },
      access: {
        daily_limit: 9999,
        occasions: ["all"],
        exclusive_tones: ["all"],
        context_words_limit: 50,
      },
      ai_config: {
        model: process.env.AI_MODEL_PREMIUM || "gemini-3-pro-preview",
        temperature: process.env.AI_TEMP_PREMIUM ? Number(process.env.AI_TEMP_PREMIUM) : 0.95,
        prompt_style:
          "Eres un experto en redacción, con inteligencia emocional superior y gran creatividad.",
        length_instruction: "Extiéndete lo necesario para crear un mensaje detallado y emotivo.",
      },
      pricing: {
        monthly: 4.99,
        yearly: 47.9,
        yearly_monthly_equivalent: 3.99,
      },
      pricing_hooks: {
        stripe_price_id_monthly: process.env.STRIPE_PRICE_ID_MONTHLY || "price_1Syif3D9BNQ52nHRE7qngWUu",
        stripe_price_id_yearly: process.env.STRIPE_PRICE_ID_YEARLY || "price_1Syig1D9BNQ52nHRtvvanYpY",
        wompi_price_in_cents_monthly: process.env.WOMPI_PRICE_IN_CENTS_MONTHLY ? Number(process.env.WOMPI_PRICE_IN_CENTS_MONTHLY) : undefined,
        wompi_price_in_cents_yearly: process.env.WOMPI_PRICE_IN_CENTS_YEARLY ? Number(process.env.WOMPI_PRICE_IN_CENTS_YEARLY) : undefined,
        mercadopago_price_monthly: process.env.MERCADOPAGO_PRICE_MONTHLY ? Number(process.env.MERCADOPAGO_PRICE_MONTHLY) : 18360,
        mercadopago_price_yearly: process.env.MERCADOPAGO_PRICE_YEARLY ? Number(process.env.MERCADOPAGO_PRICE_YEARLY) : 190000,
        mercadopago_price_monthly_usd: process.env.MERCADOPAGO_PRICE_MONTHLY_USD ? Number(process.env.MERCADOPAGO_PRICE_MONTHLY_USD) : 4.99,
        mercadopago_price_yearly_usd: process.env.MERCADOPAGO_PRICE_YEARLY_USD ? Number(process.env.MERCADOPAGO_PRICE_YEARLY_USD) : 47.9,
      },
    },
  },
  global_upsell_triggers: {
    on_limit_reached:
      "¡Te has quedado sin créditos mágicos! Pásate a Premium para seguir escribiendo.",
    on_locked_occasion: "Esta ocasión es exclusiva para usuarios Premium.",
    on_locked_tone: "Este tono es una joya oculta. Desbloquéalo con Premium.",
    on_context_limit:
      "La personalización con contexto es exclusiva de Premium.",
  },
};

module.exports = PLAN_CONFIG;
