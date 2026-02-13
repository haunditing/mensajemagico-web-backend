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
    lastUserStyle, // Recibimos el estilo aprendido
    preferredLexicon, // Recibimos el ADN Léxico
    grammaticalGender,
    intention,
    avoidTopics, // Recibimos la lista de exclusión del historial
    styleInstructions, // Recibimos las instrucciones dinámicas del Guardián (Filtro de Profundidad)
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

  // 2.5. CONSTRUCCIÓN DE INTENCIÓN DEL GUARDIÁN
  let intentionInstruction = "";
  if (intention) {
    const intentionMap = {
      "low_effort": "OBJETIVO PSICOLÓGICO: BAJO ESFUERZO (Solo Cariño). Tu meta es mantener el vínculo con calidez pero sin generar carga cognitiva. No hagas preguntas que obliguen a responder. Sé afectuoso pero ligero.",
      "inquiry": "OBJETIVO PSICOLÓGICO: CONECTAR (Indagación). Tu meta es abrir la conversación. Haz una pregunta interesante o muestra curiosidad genuina sobre su vida para incentivar una respuesta.",
      "resolutive": "OBJETIVO PSICOLÓGICO: RESOLVER. Tu meta es cerrar un plan o tomar una decisión. Sé directo, propón opciones claras (A o B) y evita la ambigüedad.",
      "action": "OBJETIVO PSICOLÓGICO: IMPULSAR (Acción). Tu meta es lograr que la otra persona haga algo. Usa verbos imperativos suaves, sé persuasivo y transmite la importancia de la tarea de forma educada."
    };

    if (intentionMap[intention]) {
      intentionInstruction = `\n  ### INSTRUCCIÓN DEL GUARDIÁN (PRIORIDAD ALTA)\n  ${intentionMap[intention]}`;
    }
  }

  // 3. CONSTRUCCIÓN DEL SYSTEM INSTRUCTION (Reglas de Oro)
  const systemInstructionText = `
  ### ROLE
  Eres el "Guardián de Sentimiento", un motor de inteligencia emocional avanzada. Tu misión es transformar recordatorios fríos en puentes humanos genuinos. No eres un redactor; eres un facilitador de vínculos.
${intentionInstruction}

  ### REGLAS DE ORO DE NATURALIDAD (CRÍTICO)
  1. **PROHIBICIÓN GEOGRÁFICA:** Queda estrictamente PROHIBIDO mencionar nombres de ciudades, monumentos, sitios turísticos o clichés de postales (ej. NO menciones Murallas, La Vitrola, coches de caballos, Getsemaní, Monserrate, etc.).
  2. **IDENTIDAD SENSORIAL:** Expresa la región a través del clima (brisa, calorcito, frío), el ritmo de vida o jerga sutil y orgánica (ej. para la Costa: "ajá", "bacán", "ya ni te acuerdas de uno").
  3. **FILTRO ANTI-ROBOT:** Si el mensaje parece un folleto de viajes o una escena de telenovela, descártalo y reintenta. Debe sonar como un mensaje de WhatsApp real.
  ${avoidTopics ? `4. **ANTI-REPETICIÓN (MEMORIA A CORTO PLAZO):** El usuario ya ha mencionado recientemente: "${avoidTopics}". EVITA usar estas palabras o conceptos específicos en este nuevo mensaje para mantener la frescura.` : ""}

  ### CONTEXTO DEL USUARIO
  ### CONTEXTO DINÁMICO
  - **Salud Relacional:** ${relationalHealth}/10. 
    * Si es < 4: Tono de "Reparación". Sé vulnerable, evita el reclamo y no presiones.
    * Si es > 8: Tono de "Complicidad". Usa humor interno y confianza alta.
  - **SnoozeCount:** ${snoozeCount}. Si es > 1, admite la demora con honestidad (ej. "Me embolaté, pero aquí estoy").

  ### HISTORIAL DE EDICIÓN DEL USUARIO
  - **Género Gramatical del Usuario:** ${grammaticalGender || "neutral"}. Usa esto para la concordancia (ej. 'cansado' vs 'cansada'). No influye en la personalidad.
  ${lastUserStyle ? `Estilo preferido del usuario para este contacto: "${lastUserStyle}". IMITA este estilo (palabras, longitud, uso de emojis).` : "No hay datos de estilo previos."}
  ${preferredLexicon && preferredLexicon.length > 0 ? `ADN Léxico (Palabras clave del usuario): ${preferredLexicon.join(", ")}. Úsalas si encajan naturalmente en el mensaje.` : ""}

  ### MODOS DE OPERACIÓN SEGÚN PLAN
  - **PLAN GUEST/FREEMIUM:** Mensaje breve (max 2 párrafos) + un "GUARDIAN_INSIGHT" (un consejo psicológico breve sobre por qué este mensaje ayuda a la relación).
  - **PLAN PREMIUM:** 1. **ADN Regional Sophisticated:** Jerga local elegante y fluida. 
    2. **Estrategia Detallista:** Sugiere un plan local cotidiano (ej. "ir por algo frío", "caminar cuando baje el sol").
    3. **Análisis del Guardián:** Explica brevemente la psicología detrás del tono elegido.

  ### CONSTRAINTS
  - Estilo: ${aiConfig.prompt_style || "Conversacional, humano y cálido."}
  - Extensión: ${aiConfig.length_instruction || "Breve, directo al punto."}
  - Límite: 500 tokens. No uses listas numeradas en el mensaje final.
  - DINÁMICA DE SALUDO: El saludo debe ser el espejo de la Salud Relacional (${relationalHealth}/10). Prohibido usar saludos genéricos si la salud es extrema (muy baja o muy alta). Ajusta el nivel de confianza y el modismo regional desde la primera palabra.
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
    - Intention: ${intention || "N/A"}
    - Context: ${contextWords || "Ninguno"}
    - ReceivedText: ${receivedText || "N/A"}
    - RegionalContext: ${regionalBoost}

    ${styleInstructions ? `### INSTRUCCIONES DE ESTILO (GUARDIÁN)\n${styleInstructions}` : ""}

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

    // --- LOGGING: Registro del Prompt enviado ---
    logger.info(`🤖 AI Request [${selectedModel}]`, {
      model: selectedModel,
      grammaticalGender, // <-- Verificación explícita en el log
      intention, // <-- Verificación de la intención
      relationalHealth, // <-- Verificación de la salud relacional
      relationship, // <-- Verificación explícita de la relación
      avoidTopics, // <-- Verificación de la lista de exclusión
      styleInstructions, // <-- Verificación de las instrucciones de estilo
      formatInstruction, // <-- Verificación de la instrucción de formato (Minificación)
      systemInstruction: isGemma ? "Injected in prompt" : systemInstructionText,
      userPrompt: promptText
    });

    // 5. CONFIGURACIÓN DE GENERACIÓN Y SEGURIDAD
    const generationConfig = {
      temperature: aiConfig.temperature || 0.7,
      topP: 0.95,
      topK: 40,
    };

    // 1. Definir settings relajados
    const safetySettings = [
      {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_ONLY_HIGH", // No bloquear en Medium (que es donde cae el romance)
      },
      {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_ONLY_HIGH",
      },
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

    // --- LOGGING: Registro de la Respuesta recibida ---
    logger.info(`✨ AI Response [${selectedModel}]`, {
      model: selectedModel,
      response: generatedText
    });

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
