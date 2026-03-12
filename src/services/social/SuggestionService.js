// Servicio para sugerir tono, intención y palabras clave usando IA
const { executeWithFallback } = require("../AIOrchestrator");
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function suggestToneIntentionKeywords({ platform, theme }) {
  const prompt = `Eres un community manager senior. Sugiere el tono ideal, la intención principal y 5 palabras clave para una campaña de ${platform} cuyo tema es: "${theme}". Responde SOLO en JSON así:\n{\n  "tone": "Tono sugerido",\n  "intention": "Intención principal",\n  "keywords": ["palabra1", "palabra2", ...]\n}`;

  return await executeWithFallback("premium", 10, async (model) => {
    const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
    const aiModel = genAI.getGenerativeModel({ model });
    const result = await aiModel.generateContent(prompt);
    const response = await result.response;
    // Extraer JSON aunque venga con markdown
    let jsonText = response.text();
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) jsonText = match[0];
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      return { tone: "", intention: "", keywords: [] };
    }
    return {
      tone: parsed.tone || "",
      intention: parsed.intention || "",
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    };
  });
}

module.exports = { suggestToneIntentionKeywords };
