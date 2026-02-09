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
        model: "gemini-2.5-flash",
        temperature: 0.5,
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
        model: "gemini-2.5-flash",
        temperature: 0.75,
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
        model: "gemini-3-pro-preview",
        temperature: 0.95,
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
        stripe_price_id_monthly: "price_1Syif3D9BNQ52nHRE7qngWUu", // ID real de Stripe
        stripe_price_id_yearly: "price_1Syig1D9BNQ52nHRtvvanYpY", // ID real de Stripe
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
