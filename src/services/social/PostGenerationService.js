// Servicio de generación de campañas para backend
const { getPlatformStrategy } = require("./strategies/platformStrategies");
const { generateCampaignWithAI } = require("./AICampaignService");
const { suggestToneIntentionKeywords } = require("./SuggestionService");

async function generateCampaign(platform, payload) {
  const strategy = getPlatformStrategy(platform);
  if (!strategy) throw new Error("Plataforma no soportada: " + platform);
  // 1. Construir prompt específico
  const prompt = strategy.buildPrompt(payload);
  // 2. Llamar a la IA real
  const aiResponse = await generateCampaignWithAI(prompt.instructions + "\n" +
    "TEMA: " + prompt.theme + "\n" +
    "TONO: " + prompt.tone + "\n" +
    "PALABRAS: " + (prompt.contextWords || []).join(", ") +
    (prompt.intention ? "\nINTENCIÓN: " + prompt.intention : "")
  );
  // 3. Parsear respuesta
  return strategy.parseResponse(aiResponse);
}

module.exports = { generateCampaign, suggestToneIntentionKeywords };
