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
    premium_lite: {
      id: "plan_premium_lite",
      name: "Mágico Premium Lite",
      monetization: {
        show_ads: false,
        watermark: false,
      },
      access: {
        daily_limit: 20,
        occasions: ["all"],
        exclusive_tones: [
          "romántico",
          "divertido",
          "corto",
          "formal",
          "profundo",
          "directo",
          "sutil",
          "sarcástico",
          "profesional",
          "cálido",
          "apasionado",
        ],
        context_words_limit: 20,
      },
      ai_config: {
        model: process.env.AI_MODEL_LITE || "gemini-2.5-flash",
        temperature: process.env.AI_TEMP_LITE ? Number(process.env.AI_TEMP_LITE) : 0.8,
        prompt_style: "Eres un asistente creativo, empático y versátil.",
        length_instruction: "Crea un mensaje natural y emotivo, adaptado al tono.",
      },
      pricing: {
        monthly: 2.99,
        yearly: 29.99,
        yearly_monthly_equivalent: 2.5,
      },
      pricing_hooks: {
        wompi_price_in_cents_monthly: process.env.WOMPI_PRICE_IN_CENTS_LITE_MONTHLY ? Number(process.env.WOMPI_PRICE_IN_CENTS_LITE_MONTHLY) : 12990,
        wompi_price_in_cents_yearly: process.env.WOMPI_PRICE_IN_CENTS_LITE_YEARLY ? Number(process.env.WOMPI_PRICE_IN_CENTS_LITE_YEARLY) : 129900,
        mercadopago_price_monthly: process.env.MERCADOPAGO_PRICE_LITE_MONTHLY ? Number(process.env.MERCADOPAGO_PRICE_LITE_MONTHLY) : 9180,
        mercadopago_price_yearly: process.env.MERCADOPAGO_PRICE_LITE_YEARLY ? Number(process.env.MERCADOPAGO_PRICE_LITE_YEARLY) : 91800,
        mercadopago_price_monthly_original: process.env.MERCADOPAGO_PRICE_LITE_MONTHLY_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_LITE_MONTHLY_ORIGINAL) : 12990,
        mercadopago_price_yearly_original: process.env.MERCADOPAGO_PRICE_LITE_YEARLY_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_LITE_YEARLY_ORIGINAL) : 129900,
        mercadopago_price_monthly_usd: process.env.MERCADOPAGO_PRICE_LITE_MONTHLY_USD ? Number(process.env.MERCADOPAGO_PRICE_LITE_MONTHLY_USD) : 2.49,
        mercadopago_price_yearly_usd: process.env.MERCADOPAGO_PRICE_LITE_YEARLY_USD ? Number(process.env.MERCADOPAGO_PRICE_LITE_YEARLY_USD) : 24.99,
        mercadopago_price_monthly_usd_original: process.env.MERCADOPAGO_PRICE_LITE_MONTHLY_USD_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_LITE_MONTHLY_USD_ORIGINAL) : 3.99,
        mercadopago_price_yearly_usd_original: process.env.MERCADOPAGO_PRICE_LITE_YEARLY_USD_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_LITE_YEARLY_USD_ORIGINAL) : 39.99,
        offer_end_date: process.env.OFFER_END_DATE,
        offer_duration_months: process.env.OFFER_DURATION_MONTHS ? Number(process.env.OFFER_DURATION_MONTHS) : 0,
      },
    },
    premium: {
      id: "plan_premium_gold",
      name: "Mágico Premium Pro",
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
        wompi_price_in_cents_monthly: process.env.WOMPI_PRICE_IN_CENTS_MONTHLY ? Number(process.env.WOMPI_PRICE_IN_CENTS_MONTHLY) : 15960,
        wompi_price_in_cents_yearly: process.env.WOMPI_PRICE_IN_CENTS_YEARLY ? Number(process.env.WOMPI_PRICE_IN_CENTS_YEARLY) : 159600,
        mercadopago_price_monthly: process.env.MERCADOPAGO_PRICE_MONTHLY ? Number(process.env.MERCADOPAGO_PRICE_MONTHLY) : 15960,
        mercadopago_price_yearly: process.env.MERCADOPAGO_PRICE_YEARLY ? Number(process.env.MERCADOPAGO_PRICE_YEARLY) : 159600,
        mercadopago_price_monthly_original: process.env.MERCADOPAGO_PRICE_MONTHLY_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_MONTHLY_ORIGINAL) : 21960,
        mercadopago_price_yearly_original: process.env.MERCADOPAGO_PRICE_YEARLY_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_YEARLY_ORIGINAL) : 219600,
        mercadopago_price_monthly_usd: process.env.MERCADOPAGO_PRICE_MONTHLY_USD ? Number(process.env.MERCADOPAGO_PRICE_MONTHLY_USD) : 3.99,
        mercadopago_price_yearly_usd: process.env.MERCADOPAGO_PRICE_YEARLY_USD ? Number(process.env.MERCADOPAGO_PRICE_YEARLY_USD) : 39.9,
        mercadopago_price_monthly_usd_original: process.env.MERCADOPAGO_PRICE_MONTHLY_USD_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_MONTHLY_USD_ORIGINAL) : 5.99,
        mercadopago_price_yearly_usd_original: process.env.MERCADOPAGO_PRICE_YEARLY_USD_ORIGINAL ? Number(process.env.MERCADOPAGO_PRICE_YEARLY_USD_ORIGINAL) : 59.9,
        offer_end_date: process.env.OFFER_END_DATE,
        offer_duration_months: process.env.OFFER_DURATION_MONTHS ? Number(process.env.OFFER_DURATION_MONTHS) : 0,
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
