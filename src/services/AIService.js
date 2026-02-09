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
  // Ordenar las claves del objeto antes de stringify para asegurar consistencia
  const cacheKey = crypto
    .createHash("md5")
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest("hex");

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
    //const systemInstruction = `${aiConfig.prompt_style} ${aiConfig.length_instruction || ""}`.trim();
    // Dentro de la función generate...
    const systemInstruction = {
      role: "system",
      parts: [
        {
          text: `
    ${aiConfig.prompt_style} 
    ${aiConfig.length_instruction || ""}
    STRICT_RULES:
    - Plan GUEST: Breve, sin emojis, respuesta directa.
    - Plan FREEMIUM: Empático, 1 emoji, tono conversacional.
    - Plan PREMIUM: Análisis psicológico, estructura elegante, copywriting de alta conversión.
  `.trim(),
        },
      ],
    };

    const model = genAI.getGenerativeModel({
      model: aiConfig.model,
      // Google SDK espera systemInstruction como un string o un objeto específico
      systemInstruction: {
        parts: [{ text: aiConfig.system_prompt_logic }],
      },
    });

    // 2. Configuración de generación (temperatura, tokens)
    const generationConfig = {
      temperature: aiConfig.temperature,
      // Limitar tokens en planes inferiores para ahorrar costes
      maxOutputTokens: aiConfig.plan === "Guest" ? 100 : 500,
      topP: 0.95,
      topK: 40,
    };

    // Implementar "Safety Settings" para evitar respuestas tóxicas en mensajes delicados
    const safetySettings = [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
      },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    ];

    // 3. Generar contenido
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
    logger.error("Error en AIService", { error });
    // Manejo de errores seguro para no exponer detalles técnicos al cliente
    throw new Error("La IA no pudo completar la solicitud en este momento.");
  }
};

module.exports = { generate };
