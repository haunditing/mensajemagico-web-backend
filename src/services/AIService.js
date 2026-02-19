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
    lastUserStyle,
    preferredLexicon,
    grammaticalGender,
    intention,
    avoidTopics,
    styleInstructions,
    creativityLevel,
    greetingMoment,
    apologyReason,
  } = data;

  // 1. CONTEXTO REGIONAL
  const regionalBoost = RegionalContextService.getRegionalBoost(
    userLocation,
    planLevel,
    neutralMode,
  );

  // 2. INTENCIÓN DEL GUARDIÁN (OBJETIVO PSICOLÓGICO)
  let intentionInstruction = "";
  const intentionMap = {
    low_effort:
      "OBJETIVO: BAJO ESFUERZO. Mantén el vínculo con calidez pero sin generar carga cognitiva. No hagas preguntas.",
    inquiry:
      "OBJETIVO: CONECTAR. Haz una pregunta interesante o muestra curiosidad genuina.",
    resolutive:
      "OBJETIVO: RESOLVER. Sé directo, propón opciones claras (A o B) y evita ambigüedad.",
    action:
      "OBJETIVO: IMPULSAR. Usa verbos imperativos suaves, sé persuasivo y directo.",
  };

  if (intention && intentionMap[intention]) {
    intentionInstruction = `\n### INSTRUCCIÓN DE INTENCIÓN (DOMINANTE)\n${intentionMap[intention]}`;
  }

  // 3. ADAPTACIÓN DE ENERGÍA (ESPEJO) - Controla extensión sin solaparse con constraints
  let energyInstruction = "";
  if (receivedText && receivedText.trim().length > 0) {
    const receivedLength = receivedText.trim().length;
    let responseLength = "detallada";

    if (receivedLength < 25) {
      responseLength = "ultra breve (máximo 1 oración o 5 palabras)";
    } else if (receivedLength < 60) {
      responseLength = "muy breve (máximo 15 palabras)";
    } else if (receivedLength < 150) {
      responseLength = "concisa";
    }

    energyInstruction = `\n### ADAPTACIÓN DE ENERGÍA (ESPEJO)\nEl mensaje recibido es de ${receivedLength} caracteres. Tu respuesta DEBE ser **${responseLength}** para igualar la energía.`;
  }

  // 4. COHERENCIA TEMPORAL (AJUSTADA AL TONO)
  let timeInstruction = "";
  const isDirect = tone === "directo";
  if (greetingMoment) {
    const timeMap = {
      madrugada:
        "Contexto: Madrugada. Tono íntimo, susurro o complicidad de desvelo.",
      lunes: "Contexto: Lunes. Tono motivador y energético.",
      fin_de_semana: "Contexto: Fin de semana. Tono relajado y de descanso.",
      amanecer: isDirect
        ? "Saludo: Usa 'Buen día' o 'Hola'."
        : "OBLIGATORIO: Saludo 'Buenos días'. Desea energía.",
      tarde: isDirect
        ? "Saludo: Usa 'Buenas tardes'."
        : "OBLIGATORIO: Saludo 'Buenas tardes'.",
      ocaso: isDirect
        ? "Saludo: Usa 'Buenas noches'."
        : "OBLIGATORIO: Saludo 'Buenas noches'. Desea descanso.",
    };
    if (timeMap[greetingMoment]) {
      timeInstruction = `\n### CONTEXTO TEMPORAL\n${timeMap[greetingMoment]}`;
    }
  }

  // 5. COHERENCIA DE TONO (ELIMINA CURSILLERÍA Y SOLAPAMIENTOS)
  let toneInstruction = "";
  if (isDirect) {
    toneInstruction = `\n### REGLA DE ESTILO: DIRECTO Y SINCRONIZADO (MÁXIMA PRIORIDAD)
1. **Apertura:** Salta protocolos. Ve al punto inmediatamente.
2. **Anclaje:** Si el contexto menciona eventos (hoy, mañana, partido, recoger, cumple), el mensaje DEBE centrarse en eso.
3. **Cero Poesía:** Prohibido usar metáforas, frases profundas o cursilerías (ej. "mi refugio", "mi calma"). Sé práctico.
4. **Filtro de Muletillas:** No uses "ajá" o jergas a menos que el usuario las incluya en el contexto.`;
  } else if (tone === "sarcástico") {
    toneInstruction = `\n### REGLA DE ESTILO: SARCASMO FINO (NO AGRESIVO)
1. **Humor, no Odio:** El objetivo es hacer reír o señalar una ironía, NO herir ni insultar.
2. **Inteligencia:** Usa juegos de palabras, exageraciones absurdas o subversión de expectativas.
3. **Límite de Crueldad:** Evita ataques personales directos. Búrlate de la situación, no de la persona.
4. **Emoji:** Usa 🙄, 🙃 o 💅 para marcar el tono.`;
  } else if (tone === "coqueto") {
    toneInstruction = `\n### REGLA DE ESTILO: COQUETO CON CLASE (NO VULGAR)
1. **Sutileza:** El coqueteo debe ser un juego, no una exigencia. Usa el doble sentido con elegancia.
2. **Respeto:** Evita comentarios explícitos sobre el cuerpo. Enfócate en la energía, la sonrisa o la inteligencia.
3. **Misterio:** Deja algo a la imaginación. Es mejor sugerir que mostrar.
4. **Emoji:** Usa 😉, 😏 o 🔥 con moderación.`;
  } else if (tone === "divertido") {
    toneInstruction = `\n### REGLA DE ESTILO: HUMOR FRESCO (NO CLICHÉS)
1. **Originalidad:** Evita chistes de "papá", juegos de palabras gastados o memes antiguos.
2. **Contextual:** El humor debe nacer de la situación actual, no ser un chiste genérico pegado.
3. **Autenticidad:** Usa un tono conversacional y espontáneo.
4. **Emoji:** Usa 😂, 🤣 o 💀 para marcar el tono.`;
  } else if (tone === "sincero") {
    toneInstruction = `\n### REGLA DE ESTILO: SINCERIDAD EQUILIBRADA (NO DRAMA)
1. **Autenticidad:** Habla desde la verdad, pero sin exagerar sentimientos.
2. **Claridad:** Di lo que sientes de forma simple y directa, sin rodeos poéticos innecesarios.
3. **Cero Melodrama:** Evita frases de telenovela o victimización. La sinceridad es tranquila.
4. **Emoji:** Usa 🙂, 🤍 o ✨ para suavizar.`;
  } else if (tone === "formal") {
    toneInstruction = `\n### REGLA DE ESTILO: FORMALIDAD CÁLIDA (NO ROBÓTICA)
1. **Profesionalismo:** Usa un lenguaje correcto y estructurado, pero humano.
2. **Cero Rigidez:** Evita sonar como un bot o un comunicado oficial antiguo. Usa "Hola" o "Estimado" según corresponda, pero no "Muy señor mío".
3. **Claridad:** La cortesía no debe oscurecer el mensaje. Sé claro y respetuoso.
4. **Emoji:** Usa 🤝, 📩 o ✅ si el contexto lo permite (mínimo).`;
  } else if (tone === "profundo") {
    toneInstruction = `\n### REGLA DE ESTILO: PROFUNDIDAD ACCESIBLE (NO PRETENCIOSA)
1. **Claridad:** La profundidad está en la idea, no en palabras complicadas. Usa lenguaje sencillo.
2. **Conexión:** Relaciona la reflexión con la experiencia compartida o la emoción del momento.
3. **Cero Confusión:** Evita abstracciones vagas. Sé concreto en el sentimiento.
4. **Emoji:** Usa 🌌, 🍃 o 🕯️ para dar atmósfera.`;
  } else if (tone === "sutil") {
    toneInstruction = `\n### REGLA DE ESTILO: SUTILEZA EFECTIVA (NO INVISIBLE)
1. **Indirecta Clara:** Sugiere la intención sin decirla explícitamente, pero asegúrate de que se entienda entre líneas.
2. **Ambigüedad Estratégica:** Deja espacio para que la otra persona interprete, pero guía esa interpretación.
3. **Suavidad:** Usa palabras que quiten peso o presión (ej. "quizás", "de pronto", "me pareció").
4. **Emoji:** Usa 👀, 🤔 o 🍃 para dejar la puerta abierta.`;
  } else if (tone === "atrasado") {
    toneInstruction = `\n### REGLA DE ESTILO: ATRASADO CON CLASE (NO CULPA TÓXICA)
1. **Reconocer, no Rogar:** Admite el retraso brevemente ("Se me pasó", "Llego tarde"), pero no te arrastres pidiendo perdón.
2. **Foco en el Deseo:** Lo importante es que te acordaste, no cuándo. Centra el 80% del mensaje en los buenos deseos.
3. **Cero Excusas Baratas:** Evita inventar historias complejas. La honestidad o el humor ("soy un desastre con las fechas") funcionan mejor.
4. **Emoji:** Usa 🐢, 🙈 o 🎉 para quitarle hierro al asunto.`;
  } else if (tone === "desesperado-light") {
    toneInstruction = `\n### REGLA DE ESTILO: VULNERABILIDAD DIGNA (NO PATÉTICA)
1. **Honestidad sin Súplica:** Expresa que te importa o que extrañas, pero sin rogar atención.
2. **Brevedad:** La desesperación larga cansa. La corta impacta. Sé conciso.
3. **Dignidad:** Muestra tu sentimiento, pero mantén tu valor. No te rebajes.
4. **Emoji:** Usa 😔, 🥀 o 💔 (uno solo).`;
  } else if (tone === "romántico") {
    const isLigue = relationship && (relationship.toLowerCase().includes("ligue") || relationship.toLowerCase().includes("crush"));
    toneInstruction = `\n### REGLA DE ESTILO: ROMANCE REAL (NO CLICHÉ)
1. **Autenticidad:** Evita frases de tarjeta de regalo ("eres mi sol", "bajar la luna"). Habla de detalles específicos de la relación.
2. **Intimidad:** Enfócate en cómo te hace sentir, no en halagos vacíos.
3. **Equilibrio:** Sé cariñoso pero no empalagoso. Menos es más.
${isLigue ? '4. **FRENO DE INTENSIDAD (LIGUE):** PROHIBIDO decir "te amo", "eres el amor de mi vida" o promesas eternas. Es un ligue, no un matrimonio. Sé coqueto pero no intenso.' : '4. **Emoji:** Usa ❤️, 🥰 o 🌹 con naturalidad.'}`;
  } else if (tone === "corto") {
    toneInstruction = `\n### REGLA DE ESTILO: BREVEDAD ABSOLUTA
1. **Economía de Palabras:** Di lo máximo con lo mínimo. Elimina adjetivos innecesarios.
2. **Impacto:** Frases contundentes.
3. **Sin Relleno:** Nada de "espero que estés bien" o introducciones largas.
4. **Longitud:** Máximo 2 oraciones.`;
  }

  // 6. CONSTRUCCIÓN DEL SYSTEM INSTRUCTION (REGLAS DE ORO)
  const systemInstructionText = `
### ROLE
Eres el "Guardián de Sentimiento". Escribes EN NOMBRE DEL USUARIO para su CONTACTO.
${intentionInstruction}

### REGLAS DE ORO (ANTI-ALUCINACIÓN)
0. **PRESENTE PURO:** Si no hay historial previo, PROHIBIDO asumir pasado (ej: "fuimos", "dijiste"). Tu relación empieza HOY.
1. **SIN REPORTE CLIMÁTICO:** Prohibido mencionar sol, calor, brisa o nombres de ciudades (ej. Cartagena).
2. **ADN LÉXICO:** ${preferredLexicon?.length > 0 ? (isDirect ? `Usa estas palabras SOLO si encajan con la brevedad: ${preferredLexicon.join(", ")}.` : `Usa obligatoriamente: ${preferredLexicon.join(", ")}.`) : "Usa lenguaje natural."}
3. **FILTRO ANTI-ROBOT:** Si suena a poema o folleto de ventas, descártalo. Debe ser un WhatsApp real.
${avoidTopics ? `4. **TEMAS A EVITAR:** No menciones ${avoidTopics}.` : ""}
${isDirect ? `5. **CERO POESÍA (CRÍTICO):** Al ser tono DIRECTO, ignora cualquier instrucción de "buscar emoción". Prohibido usar metáforas, frases profundas o cursilerías. Sé práctico.` : ""}

### JERARQUÍA DE ESTILO (ORDEN DE IMPORTANCIA)
${styleInstructions ? `1. PRIORIDAD TOTAL: ${styleInstructions}` : ""}
${toneInstruction ? `2. SEGUNDA PRIORIDAD: ${toneInstruction}` : ""}
${lastUserStyle ? `3. REFERENCIA DE ESTILO: "${lastUserStyle}" (No usar si contradice los puntos 1 y 2).` : ""}

### CONTEXTO DINÁMICO
- Salud Relacional: ${relationalHealth}/10. ${relationalHealth > 8 ? "Confianza alta/Humor." : "Cuidado/Vulnerabilidad."}
- Género Gramatical: ${grammaticalGender || "neutral"}.
${energyInstruction}
${timeInstruction}
${occasion === "perdoname" ? `\n### PERDÓN: El usuario pide disculpas. FOCO: "Lo siento", "Me equivoqué". ${apologyReason ? `Motivo: ${apologyReason}` : ""}` : ""}
`.trim();

  // 7. PROMPT DE USUARIO (DATOS PUROS)
  const promptText = `
### INPUT DATA
- Relationship: ${relationship} | Occasion: ${occasion}
- Context: ${contextWords || "N/A"}
- Received: "${receivedText || "N/A"}"
- RegionalContext: ${regionalBoost}
${formatInstruction || ""}
`.trim();

  // 8. CONFIGURACIÓN DE GENERACIÓN (TEMPERATURA DINÁMICA)
  let targetTemperature = 0.35;
  if (creativityLevel === "high") targetTemperature = 0.55;
  if (isDirect || creativityLevel === "low") targetTemperature = 0.25;

  const selectedModel = modelOverride || aiConfig.model || "gemini-1.5-flash";

  return {
    model: genAI.getGenerativeModel({
      model: selectedModel,
      systemInstruction: selectedModel.toLowerCase().includes("gemma")
        ? undefined
        : systemInstructionText,
    }),
    finalPrompt: selectedModel.toLowerCase().includes("gemma")
      ? `[SYSTEM]\n${systemInstructionText}\n\n[USER]\n${promptText}`
      : promptText,
    generationConfig: {
      temperature: targetTemperature,
      topP: 0.85,
      topK: 40,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    ],
    selectedModel,
    systemInstructionText,
    promptText,
  };
};

const generate = async (aiConfig, data) => {
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
    const {
      model,
      finalPrompt,
      generationConfig,
      safetySettings,
      selectedModel,
      systemInstructionText,
      promptText,
    } = prepareRequest(aiConfig, data);

    logger.info(`🤖 AI Request [${selectedModel}]`, {
      intention: data.intention,
      tone: data.tone,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig,
      safetySettings,
    });

    const generatedText = result.response.text();

    logger.info(`✨ AI Response [${selectedModel}]`, {
      response: generatedText,
    });

    responseCache.set(cacheKey, { text: generatedText, timestamp: Date.now() });
    await SystemUsage.increment(selectedModel);

    return generatedText;
  } catch (error) {
    logger.error("Error en AIService", { error: error.message });
    if (error.message.includes("429") || error.message.includes("quota")) {
      const quotaError = new Error("QUOTA_EXCEEDED");
      quotaError.statusCode = 429;
      throw quotaError;
    }
    throw new Error("La IA no pudo completar la solicitud.");
  }
};

const generateStream = async function* (aiConfig, data) {
  try {
    const {
      model,
      finalPrompt,
      generationConfig,
      safetySettings,
      selectedModel,
    } = prepareRequest(aiConfig, data);

    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig,
      safetySettings,
    });

    for await (const chunk of result.stream) {
      yield chunk.text();
    }
    await SystemUsage.increment(selectedModel);
  } catch (error) {
    logger.error("Error en AIService Stream", { error: error.message });
    throw error;
  }
};

const generateImage = async (aiConfig, { prompt }) => {
  try {
    const selectedModel = aiConfig.model || "imagen-3.0-generate-001";
    logger.info(`🎨 AI Image Request [${selectedModel}]`, { prompt });

    const model = genAI.getGenerativeModel({ model: selectedModel });

    const result = await model.generateContent(prompt);

    logger.info(`✨ AI Image Response [${selectedModel}]`);
    return result.response;
  } catch (error) {
    logger.error("Error en AIService Image", { error: error.message });
    throw error;
  }
};

module.exports = { generate, generateStream, generateImage };
