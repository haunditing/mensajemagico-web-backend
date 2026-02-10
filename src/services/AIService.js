const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const logger = require("../utils/logger");
const RegionalContextService = require("./RegionalContextService");
const SystemUsage = require("../models/SystemUsage");

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
    neutralMode,
    snoozeCount = 0,
    relationalHealth = 5,
    modelOverride,
  } = data;

  // 1. GESTIÓN DE CACHÉ
  const cacheKey = crypto
    .createHash("md5")
    .update(JSON.stringify(data, Object.keys(data).sort()))
    .digest("hex");

  if (responseCache.has(cacheKey)) {
    const { text, timestamp } = responseCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL_MS) return text;
    responseCache.delete(cacheKey);
  }

  // 2. CONSTRUCCIÓN DE CONTEXTO REGIONAL
  const regionalBoost = RegionalContextService.getRegionalBoost(
    userLocation,
    planLevel,
    neutralMode,
  );

  // 3. CONSTRUCCIÓN DEL SYSTEM INSTRUCTION (Reglas de Oro)
  const systemInstructionText = `
    ### ROLE
    Actúas como el "Guardián de Sentimiento", un motor de inteligencia emocional. Tu misión es transformar recordatorios fríos en conexiones humanas significativas, priorizando la cultura de Cartagena y la Costa Caribe si el contexto lo permite.

    ### OPERATING MODES
    #### 1. MODO ANÁLISIS (Para todos los planes)
    - Analiza la salud de la relación (Salud: ${relationalHealth}/10). Si es < 4, usa tono de "Recuperación de Vínculo" (humilde, sin presión).
    - Si SnoozeCount (${snoozeCount}) > 1, reconoce la demora de forma natural.

    #### 2. MODO ESTRATEGIA (Diferenciación)
    - **Si Plan == GUEST/FREEMIUM:** Mensaje estándar y breve + GUARDIAN_INSIGHT (consejo de valor sin clichés).
    - **Si Plan == PREMIUM:** ADN Regional (Carisma caribeño sofisticado), Estrategia de Regalo local y Análisis Psicológico de la elección del tono.

    ### CONSTRAINTS
    - Prohibido sonar robótico. Max 500 tokens.
    - ${aiConfig.prompt_style || "Actúa como un asistente de mensajería."} 
    - ${aiConfig.length_instruction || ""}
  `.trim();

  // 4. CONSTRUCCIÓN DEL PROMPT DE USUARIO
  const promptText = `
    ### INPUT DATA
    - UserPlan: ${planLevel ? planLevel.toUpperCase() : "GUEST"}
    - RelationalHealth: ${relationalHealth}/10
    - Region: ${userLocation || "Desconocida"}
    - Occasion: ${occasion}
    - Relationship: ${relationship || "General"}
    - Tone: ${tone}
    - Context: ${contextWords || "Ninguno"}
    - ReceivedText: ${receivedText || "N/A"}
    - RegionalContext: ${regionalBoost}

    ${formatInstruction || ""}
  `.trim();

  try {
    const selectedModel = modelOverride || aiConfig.model || "gemini-1.5-flash";

    // 👈 SOLUCIÓN AL ERROR 400 (Compatibilidad Gemma)
    // Gemma NO acepta 'systemInstruction'. Si es Gemma, inyectamos las reglas en el prompt.
    const isGemma = selectedModel.toLowerCase().includes("gemma");

    let model;
    let finalPrompt;

    if (isGemma) {
      model = genAI.getGenerativeModel({ model: selectedModel });
      finalPrompt = `[SYSTEM_RULES]\n${systemInstructionText}\n\n[USER_REQUEST]\n${promptText}`;
    } else {
      model = genAI.getGenerativeModel({
        model: selectedModel,
        systemInstruction: systemInstructionText,
      });
      finalPrompt = promptText;
    }

    // 5. CONFIGURACIÓN DE GENERACIÓN Y SEGURIDAD
    const generationConfig = {
      temperature: aiConfig.temperature || 0.7,
      topP: 0.95,
      topK: 40,
    };

    const safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_ONLY_HIGH",
      },
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_ONLY_HIGH",
      },
    ];

    // 6. EJECUCIÓN
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig,
      safetySettings,
    });

    const response = await result.response;
    const generatedText = response.text();

    // 7. PERSISTENCIA Y MÉTRICAS
    responseCache.set(cacheKey, {
      text: generatedText,
      timestamp: Date.now(),
    });

    // Registrar uso del modelo para el orquestador
    await SystemUsage.increment(selectedModel);

    return generatedText;
  } catch (error) {
    logger.error("Error en AIService", {
      model: modelOverride,
      error: error.message,
      stack: error.stack,
    });

    // Si el error es de cuota (429), lo lanzamos para que el Controller active el fallback
    if (error.message.includes("429") || error.message.includes("quota")) {
      const quotaError = new Error("QUOTA_EXCEEDED");
      quotaError.statusCode = 429;
      throw quotaError;
    }

    throw new Error("La IA no pudo completar la solicitud en este momento.");
  }
};

module.exports = { generate };
