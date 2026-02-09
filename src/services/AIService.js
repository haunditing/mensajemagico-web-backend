const { GoogleGenerativeAI } = require("@google/generative-ai");
const logger = require("../utils/logger");

const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);

// Cache simple en memoria
const responseCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hora

const generate = async (
  aiConfig,
  {
    occasion,
    tone,
    contextWords,
    relationship,
    receivedText,
    formatInstruction,
  },
) => {
  // Generar clave de caché única
  const cacheKey = JSON.stringify({
    model: aiConfig.model,
    style: aiConfig.prompt_style,
    occasion,
    tone,
    context: contextWords || "",
    relationship: relationship || "",
    receivedText: receivedText || "",
    format: formatInstruction || "",
  });

  if (responseCache.has(cacheKey)) {
    const { text, timestamp } = responseCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL_MS) return text;
    responseCache.delete(cacheKey);
  }

  const promptText = `
    Escribe un mensaje para la ocasión: ${occasion}.
    ${relationship ? `Relación: ${relationship}.` : ""}
    Tono: ${tone}.
    ${receivedText ? `En respuesta a: "${receivedText}".` : ""}
    ${contextWords ? `Contexto/Palabras clave: ${contextWords}` : ""}
    ${formatInstruction || ""}
  `.trim();

  try {
    // 1. Configurar el modelo con la instrucción de sistema (personalidad)
    const model = genAI.getGenerativeModel({
      model: aiConfig.model,
      systemInstruction: aiConfig.prompt_style,
    });

    // 2. Configuración de generación (temperatura, tokens)
    const generationConfig = {
      temperature: aiConfig.temperature,
      maxOutputTokens: aiConfig.max_tokens,
    };

    // 3. Generar contenido
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig,
    });

    const response = await result.response;
    const generatedText = response.text();

    responseCache.set(cacheKey, {
      text: generatedText,
      timestamp: Date.now(),
    });

    return generatedText;
  } catch (error) {
    logger.error("Error en AIService", { error });
    // Manejo de errores seguro para no exponer detalles técnicos al cliente
    throw new Error("La IA no pudo completar la solicitud en este momento.");
  }
};

module.exports = { generate };
