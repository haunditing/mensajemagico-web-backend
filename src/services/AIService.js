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
    neutralMode,
    snoozeCount = 0,
    relationalHealth = 5,
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
  const regionalBoost = RegionalContextService.getRegionalBoost(userLocation, planLevel, neutralMode);

  const promptText = `
    ### INPUT DATA (Contexto del Algoritmo)
    - **UserPlan**: ${planLevel ? planLevel.toUpperCase() : "GUEST"}
    - **RelationalHealth**: ${relationalHealth} (1-10)
    - **SnoozeCount**: ${snoozeCount}
    - **Region**: ${userLocation || "Desconocida"}
    - **Occasion**: ${occasion}
    - **Relationship**: ${relationship || "General"}
    - **Tone**: ${tone}
    - **Context**: ${contextWords || "Ninguno"}
    - **ReceivedText**: ${receivedText || "N/A"}
    - **RegionalContext**: ${regionalBoost}

    ${formatInstruction || ""}
  `.trim();

  try {
    // 👈 Error 2 & 3: Limpiamos la instrucción de sistema
    // Consolidamos la lógica de planes en un solo string limpio para el SDK
    const systemInstructionText = `
      ### ROLE
      Actúas como el "Guardián de Sentimiento", un motor de inteligencia emocional para una Web App de mensajería proactiva. Tu misión es transformar recordatorios fríos en conexiones humanas significativas, priorizando la cultura de Cartagena y la Costa Caribe si el contexto lo permite.

      ### OPERATING MODES (Lógica de Negocio)
      #### 1. MODO ANÁLISIS (Para todos los planes)
      - Analiza la salud de la relación (Input: RelationalHealth). Si es < 4, el tono debe ser de "Recuperación de Vínculo" (humilde, sin presión).
      - Si SnoozeCount > 1, reconoce la demora de forma natural: "Sé que ha pasado tiempo..." o "He estado a mil, pero...".

      #### 2. MODO ESTRATEGIA (Diferenciación de Planes)
      - **Si Plan == GUEST/FREEMIUM:**
          - Genera un mensaje estándar, correcto pero breve.
          - **IMPORTANTE:** Al final del mensaje, añade un bloque llamado GUARDIAN_INSIGHT. Redacta un consejo breve y directo. EVITA CLICHÉS como "nutrir el corazón", "reforzar el amor" o "lazos auténticos". En lugar de lenguaje de marketing ("Te ofrecemos una estrategia..."), usa un tono de valor: "Tengo una idea para...". Menciona sutilmente elementos del contexto local (ej. la brisa, un café, el ambiente) para generar curiosidad, sin nombrar la ciudad explícitamente. No des el mensaje premium, solo sugiere la idea.

      - **Si Plan == PREMIUM:**
          - **ADN Regional:** Si Region es Cartagena o Barranquilla (o detectado en RegionalContext), inyecta carisma caribeño sofisticado. Usa modismos con elegancia.
          - **Estrategia de Regalo:** Si la Occasion es importante (Boda, Cumpleaños, Ascenso), sugiere un regalo específico basado en la cultura local (ej. Dulces del Portal, una experiencia en las Murallas, o un café premium).
          - **Análisis Psicológico:** Explica brevemente por qué elegiste ese tono específico para este contacto.

      ### CONSTRAINTS
      - Prohibido sonar robótico.
      - Prohibido cortar frases (Max 500 tokens).
      - En Plan Premium, la prioridad es la "Alta Conversión Emocional".

      ${aiConfig.prompt_style || "Actúa como un asistente de mensajería."} 
      ${aiConfig.length_instruction || ""}
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
