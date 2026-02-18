const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const logger = require("../utils/logger");
const RegionalContextService = require("./RegionalContextService");
const SystemUsage = require("../models/SystemUsage");

const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);

const responseCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60;

const prepareRequest = (aiConfig, data) => {
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
    creativityLevel, // Nivel de creatividad calculado en el frontend
    greetingMoment, // Momento del saludo (amanecer, tarde, ocaso, etc.)
    apologyReason, // Motivo de la disculpa
  } = data;

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

  // 2.6. ADAPTACIÓN DE ENERGÍA (Modo Respuesta)
  let energyInstruction = "";
  if (receivedText && receivedText.length > 0) {
    const receivedLength = receivedText.length;
    const responseLength = receivedLength < 50 ? "muy breve y directa" : receivedLength < 150 ? "concisa" : "detallada y profunda";
    energyInstruction = `\n  ### ADAPTACIÓN DE ENERGÍA (ESPEJO)\n  El usuario recibió un mensaje de ${receivedLength} caracteres. Tu respuesta debe ser **${responseLength}** para igualar la energía del interlocutor. No seas intenso si el otro fue seco.`;
  }

  // 2.7. COHERENCIA TEMPORAL (Para Saludos)
  let timeInstruction = "";
  if (greetingMoment) {
    if (greetingMoment === "madrugada") {
      timeInstruction = `\n  ### COHERENCIA TEMPORAL (MADRUGADA)\n  Es de madrugada (entre 12am y 5am). El mundo duerme. El tono debe ser íntimo, de "susurro", cómplice de insomnio o desvelo. No saludes con energía explosiva.`;
    } else if (greetingMoment === "lunes") {
      timeInstruction = `\n  ### COHERENCIA TEMPORAL (LUNES)\n  Es lunes, inicio de semana. El tono debe ser motivador, energético y optimista. Ayuda al usuario a empezar con el pie derecho. Evita la queja por el fin del descanso.`;
    } else if (greetingMoment === "fin_de_semana") {
      timeInstruction = `\n  ### COHERENCIA TEMPORAL (FIN DE SEMANA)\n  Es fin de semana. El tono debe ser relajado, de descanso, planes o desconexión. Evita hablar de trabajo, rutina o estrés. Pregunta por planes divertidos o descanso merecido.`;
    } else if (greetingMoment === "amanecer") {
      timeInstruction = `\n  ### COHERENCIA TEMPORAL (MAÑANA)\n  Es temprano. El día apenas comienza. OBLIGATORIO: Debes incluir el saludo "Buenos días" (o "Buen día"). Puedes anteponer "Hola" si es informal, pero el saludo temporal es mandatorio. PROHIBIDO preguntar "¿qué tal tu día?". Céntrate en desear energía.`;
    } else if (greetingMoment === "tarde") {
      timeInstruction = `\n  ### COHERENCIA TEMPORAL (TARDE)\n  Es por la tarde. OBLIGATORIO: Debes incluir el saludo "Buenas tardes". Puedes anteponer "Hola" si es informal. Desea una buena continuación de jornada.`;
    } else if (greetingMoment === "ocaso") {
      timeInstruction = `\n  ### COHERENCIA TEMPORAL (NOCHE)\n  El día terminó. OBLIGATORIO: Debes incluir el saludo "Buenas noches" (o "Linda noche"). Desea un buen descanso.`;
    }
  }

  // 2.8. COHERENCIA DE OCASIÓN (Perdón)
  let occasionInstruction = "";
  if (occasion === "perdoname") {
    const reasonText = apologyReason ? ` MOTIVO ESPECÍFICO: "${apologyReason}".` : "";
    occasionInstruction = `\n  ### COHERENCIA DE OCASIÓN (PERDÓN)\n  El usuario es quien PIDE PERDÓN. El mensaje debe expresar arrepentimiento, asumir responsabilidad y buscar la reconciliación.${reasonText} PROHIBIDO redactar como si el usuario estuviera perdonando al destinatario. El foco es: "Lo siento", "Perdóname", "Me equivoqué".`;
  }

  // 3. CONSTRUCCIÓN DEL SYSTEM INSTRUCTION (Reglas de Oro)
  const systemInstructionText = `
  ### ROLE
  Eres el "Guardián de Sentimiento". Tu misión es redactar mensajes de texto listos para enviar. Escribes EN NOMBRE DEL USUARIO (Yo) dirigido a su CONTACTO (Tú).
${intentionInstruction}

  ### REGLAS DE ORO DE NATURALIDAD (CRÍTICO)
  00. **PERSPECTIVA DE SALIDA:** El mensaje es del usuario para otra persona. No saludes al usuario. No uses frases como "Dile que..." o "Podrías escribir...". Escribe directamente el contenido del mensaje.
  0. **HONESTIDAD DE CONTEXTO (ANTI-ALUCINACIÓN):** Si no hay historial previo ("No hay datos de estilo previos"), tu mundo empieza HOY. PROHIBIDO usar verbos en pasado que impliquen una relación anterior (ej: "hemos", "fuimos", "dijiste", "te acuerdas"). Habla solo del presente o futuro inmediato.
  ${preferredLexicon && preferredLexicon.length > 0 ? `0.1. **ADN LÉXICO PRIORITARIO:** Es OBLIGATORIO integrar al menos una palabra de este ADN Léxico: ${preferredLexicon.join(", ")}. Es la identidad del usuario y no debe ignorarse.` : ""}
  1. **CERO REFERENCIAS GEOGRÁFICAS O CLIMÁTICAS:** El usuario vive ahí, no necesita un reporte del clima. PROHIBIDO mencionar: el nombre de la ciudad (ej. "Cartagena"), "el sol", "la brisa", "el calor", "la plaza", "las murallas", "algo frío". Si usas estas palabras, el mensaje será rechazado.
  2. **IDENTIDAD SENSORIAL (SOLO ACENTO):** La región se nota en el *ritmo* y la *jerga* (ej. "ajá", "ve", "bacano"), NO en descripciones del entorno físico.
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
  ${energyInstruction}
  ${timeInstruction}
  ${occasionInstruction}

  ### MODOS DE OPERACIÓN SEGÚN PLAN
  - **PLAN GUEST/FREEMIUM:** Mensaje breve (max 2 párrafos) + un "GUARDIAN_INSIGHT" (un consejo psicológico breve sobre por qué este mensaje ayuda a la relación).
  - **PLAN PREMIUM:** 1. **ADN Regional Sophisticated:** Jerga local elegante y fluida. 
    2. **Enfoque Relacional:** Céntrate en el vínculo y la emoción del momento. NO sugieras planes logísticos (como ir a comer o beber) a menos que el usuario lo pida explícitamente en el contexto.
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
    - GreetingMoment: ${greetingMoment || "N/A"}
    - ApologyReason: ${apologyReason || "N/A"}
    - ReceivedText: ${receivedText || "N/A"}
    - RegionalContext: ${regionalBoost}

    ${styleInstructions ? `### INSTRUCCIONES DE ESTILO (GUARDIÁN)\n${styleInstructions}` : ""}

    ${formatInstruction || ""}
  `.trim();

  const selectedModel = modelOverride || aiConfig.model || "gemini-1.5-flash";
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

  // Configuración de seguridad
  const safetySettings = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
  ];

  // Ajuste de Temperatura Dinámica
  // 0.5 es el "Sweet Spot" para evitar alucinaciones sin sonar robótico.
  let targetTemperature = aiConfig.temperature || 0.3; // Bajamos la base para evitar invenciones

  // Si el frontend solicitó un nivel específico (basado en el tono), lo respetamos
  if (creativityLevel === "high") targetTemperature = 0.6; // Reducimos el máximo para controlar el riesgo
  if (creativityLevel === "low") targetTemperature = 0.2;   // Más preciso para formal/directo
  if (creativityLevel === "imitation") targetTemperature = 0.35; // Baja temperatura para fidelidad a ejemplos exitosos

  const generationConfig = {
    temperature: targetTemperature,
    topP: 0.9, // Reducimos ligeramente de 0.95 a 0.9 para enfocar la respuesta
    topK: 40,
  };

  return { model, finalPrompt, generationConfig, safetySettings, selectedModel, systemInstructionText, promptText };
};

const generate = async (aiConfig, data) => {
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

  try {
    const { model, finalPrompt, generationConfig, safetySettings, selectedModel, systemInstructionText, promptText } = prepareRequest(aiConfig, data);

    // --- LOGGING: Registro del Prompt enviado ---
    logger.info(`🤖 AI Request [${selectedModel}]`, {
      model: selectedModel,
      grammaticalGender: data.grammaticalGender,
      intention: data.intention,
      systemInstruction: selectedModel.toLowerCase().includes("gemma") ? "Injected in prompt" : systemInstructionText,
      userPrompt: promptText
    });

    // 6. EJECUCIÓN
    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig,
      safetySettings,
    });

    let generatedText = '';
    for await (const chunk of result.stream) {
      generatedText += chunk.text();
    }

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

    const errorMessage = error.message?.toLowerCase() || "";

    // Si el error es de cuota (429), lo lanzamos para que el Controller active el fallback
    if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("exhausted")) {
      const quotaError = new Error("QUOTA_EXCEEDED");
      quotaError.statusCode = 429;
      throw quotaError;
    }

    throw new Error("La IA no pudo completar la solicitud en este momento.");
  }
};

const generateStream = async function* (aiConfig, data) {
  try {
    const { model, finalPrompt, generationConfig, safetySettings, selectedModel } = prepareRequest(aiConfig, data);

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig,
      safetySettings,
    });

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      yield chunkText;
    }

    // Registrar uso del modelo
    await SystemUsage.increment(selectedModel);

  } catch (error) {
    logger.error("Error en AIService Stream", { error: error.message });
    
    const errorMessage = error.message?.toLowerCase() || "";
    if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("exhausted")) {
      const quotaError = new Error("QUOTA_EXCEEDED");
      quotaError.statusCode = 429;
      throw quotaError;
    }
    throw error;
  }
};

module.exports = { generate, generateStream };
