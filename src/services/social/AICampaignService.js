// Servicio de generación de campañas reales usando IA (copia de AIService, adaptado a campañas)
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
const { executeWithFallback } = require("../AIOrchestrator");

// Recibe un prompt y devuelve el texto generado por la IA usando el orquestador
async function generateCampaignWithAI(prompt, planLevel = "premium", relationalHealth = 10) {
  return await executeWithFallback(planLevel, relationalHealth, async (model) => {
    const genAI = new (require("@google/generative-ai").GoogleGenerativeAI)(process.env.AI_API_KEY);
    const aiModel = genAI.getGenerativeModel({ model });
    const result = await aiModel.generateContent(prompt);
    const response = await result.response;
    return response.text();
  });
}

module.exports = { generateCampaignWithAI };
