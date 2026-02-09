const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto"); // 👈 Error 1: Faltaba esta importación
const logger = require("../utils/logger");
const RegionalContextService = require("./RegionalContextService");

const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);

const responseCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60;

const generate = async (aiConfig, data) => {
  const {
    occasion,
    tone,
    contextWords,
    relationship,
    receivedText,
    formatInstruction,
    userLocation,
    planLevel,
  } = data;

  // 👈 Error 1 (cont.): Usar 'data' en lugar de 'params' y generar hash
  const cacheKey = crypto
    .createHash("md5")
    .update(JSON.stringify(data, Object.keys(data).sort()))
    .digest("hex");

  if (responseCache.has(cacheKey)) {
    const { text, timestamp } = responseCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL_MS) return text;
    responseCache.delete(cacheKey);
  }

  // Lógica de Tono Regional Premium (Delegada al servicio escalable)
  const regionalBoost = RegionalContextService.getRegionalBoost(userLocation, planLevel);

  const promptText = `
    Escribe un mensaje para la ocasión: ${occasion}.
    ${relationship ? `Relación: ${relationship}.` : ""}
    Tono: ${tone}.
    ${receivedText ? `En respuesta a: "${receivedText}".` : ""}
    ${contextWords ? `Contexto/Palabras clave: ${contextWords}` : ""}
    ${regionalBoost}
    ${formatInstruction || ""}
  `.trim();

  try {
    // 👈 Error 2 & 3: Limpiamos la instrucción de sistema
    // Consolidamos la lógica de planes en un solo string limpio para el SDK
    const systemInstructionText = `
      ${aiConfig.prompt_style || "Actúa como un asistente de mensajería."} 
      ${aiConfig.length_instruction || ""}
      STRICT_RULES:
      - Plan GUEST: Breve, sin emojis, respuesta directa.
      - Plan FREEMIUM: Empático, 1 emoji, tono conversacional.
      - Plan PREMIUM: Análisis psicológico, estructura elegante, copywriting de alta conversión.
      - Variable Regional (Premium Only): Si el contexto menciona una ciudad específica (ej. Cartagena, Medellín, Bogotá), el sistema debe adoptar sutilmente el 'Modo Regional'. Esto implica: usar el ritmo local, mencionar referencias icónicas si encajan y aplicar un lenguaje que genere cercanía inmediata según la cultura de la ciudad, pero manteniendo la sofisticación del Plan Premium.
    `.trim();

    const model = genAI.getGenerativeModel({
      model: aiConfig.model || "gemini-1.5-flash",
      systemInstruction: systemInstructionText, // El SDK acepta el string directamente aquí
    });

    const generationConfig = {
      temperature: aiConfig.temperature || 0.7,
      //maxOutputTokens: aiConfig.plan === "Guest" ? 100 : 500,
      topP: 0.95,
      topK: 40,
    };

    const safetySettings = [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    ];

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig,
      safetySettings,
    });

    const response = await result.response;
    const generatedText = response.text();

    responseCache.set(cacheKey, {
      text: generatedText,
      timestamp: Date.now(),
    });

    return generatedText;
  } catch (error) {
    logger.error("Error en AIService", { error: error.message });
    throw new Error("La IA no pudo completar la solicitud en este momento.");
  }
};

module.exports = { generate };
