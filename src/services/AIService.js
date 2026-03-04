const { GoogleGenerativeAI } = require("@google/generative-ai");
const crypto = require("crypto");
const logger = require("../utils/logger");
const SystemUsage = require("../models/SystemUsage");

const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);

const responseCache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 60;

// Mapas de instrucciones para la Esencia (Personalidad del Usuario)
const ESSENCE_MAPS = {
  expressiveness: {
    low: "Usa un lenguaje conciso, minimalista y directo. Evita adornos innecesarios.",
    medium: "Equilibra la brevedad con el detalle. Usa estructuras de frases naturales y fluidas.",
    high: "Sé muy descriptivo, usa lenguaje emotivo, metáforas y elabora profundamente sobre los sentimientos.",
  },
  intensity: {
    soft: "Usa palabras suaves, tranquilizadoras y gentiles. Evita la dureza o la confrontación.",
    balanced: "Mantén un peso emocional estable, centrado y maduro.",
    intense: "Usa vocabulario fuerte, apasionado, dramático e impactante. No reprimas la emoción.",
  },
  pride: {
    low: "Muestra humildad, vulnerabilidad y apertura. Prioriza los sentimientos del otro sobre el ego.",
    medium: "Mantén el autorespeto y la asertividad mientras eres considerado y empático.",
    high: "Proyecta alta autoestima y dignidad. No ruegues ni suenes desesperado. Mantén la compostura.",
  },
  style: {
    direct: "Ve directo al grano. Sé claro y explícito. Evita la ambigüedad.",
    indirect: "Sé sutil y diplomático. Usa sugerencias y matices en lugar de declaraciones frontales.",
    romantic: "Usa lenguaje poético, cariñoso, soñador y lírico.",
    firm: "Sé decisivo, autoritario y establece límites claros. Sin vacilaciones.",
  },
};

const getRegionalSyntaxHint = (userLocation, planLevel, neutralMode, styleSample = "") => {
  if (planLevel !== "premium" || !userLocation || neutralMode) return "";

  const loc = String(userLocation).toLowerCase();
  const hasStyle = typeof styleSample === "string" && styleSample.trim().length > 0;
  const strictSlangGuard = hasStyle
    ? "No introduzcas verbos o jerga regional nueva; solo usa jerga si aparece literal en la muestra del usuario."
    : "Sin muestra de estilo, limítate a pronominalización y sintaxis neutra sin jerga regional.";

  if (/(argentina|buenos aires|caba|rosario|córdoba|mendoza|la plata)/.test(loc)) {
    return `Ajuste regional invisible: usa voseo natural (vos/tenes) y sintaxis rioplatense solo si coincide con la voz del usuario. ${strictSlangGuard}`;
  }
  if (/(medell[ií]n|antioquia|pereira|manizales|armenia|risaralda|caldas|quind[ií]o)/.test(loc)) {
    return `Ajuste regional invisible: asegura voseo paisa (vos) y sintaxis cercana solo si ya aparece en la voz del usuario. ${strictSlangGuard}`;
  }
  if (/(m[eé]xico|cdmx|df|guadalajara|monterrey|puebla|canc[uú]n)/.test(loc)) {
    return `Ajuste regional invisible: usa tuteo natural y registro cercano, evitando modismos forzados. ${strictSlangGuard}`;
  }
  if (/(chile|santiago|valpara[ií]so|concepci[oó]n)/.test(loc)) {
    return `Ajuste regional invisible: mantiene registro cercano y sobrio con sintaxis local neutra. ${strictSlangGuard}`;
  }
  if (/(per[uú]|lima|cusco|arequipa)/.test(loc)) {
    return `Ajuste regional invisible: prioriza cortesia y suavidad sintactica sin frases estereotipadas. ${strictSlangGuard}`;
  }
  if (/(colombia|cartagena|barranquilla|santa marta|valledupar|bogot[aá]|cundinamarca)/.test(loc)) {
    return `Ajuste regional invisible: usa sintaxis colombiana neutra y pronominalizacion consistente, sin etiquetas regionales explicitas. ${strictSlangGuard}`;
  }

  return "";
};

const buildStyleFingerprint = (styleSample) => {
  if (!styleSample || !styleSample.trim()) return null;

  const sample = styleSample.trim();

  const letters = sample.match(/\p{L}/gu) || [];
  const upper = sample.match(/\p{Lu}/gu) || [];
  const lower = sample.match(/\p{Ll}/gu) || [];

  let capitalization = "capitalización estándar";
  if (letters.length > 0) {
    if (upper.length === 0) capitalization = "todo en minúsculas (relajado)";
    else if (lower.length === 0) capitalization = "todo en mayúsculas (intenso)";
    else if (upper.length / letters.length > 0.35) capitalization = "mayúsculas frecuentes";
    else if (upper.length / letters.length < 0.1) capitalization = "mayoría en minúsculas";
  }

  const emojiMatches = Array.from(
    sample.matchAll(
      /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200D|\uFE0F)+/gu,
    ),
  );
  const emojiCount = emojiMatches.length;

  let emojiDensity = "sin emojis";
  if (emojiCount === 1) emojiDensity = "un emoji ocasional";
  else if (emojiCount <= 3) emojiDensity = "emojis moderados";
  else if (emojiCount > 3) emojiDensity = "muchos emojis";

  let emojiPlacement = "";
  if (emojiCount > 0) {
    const endsWithEmoji = /(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200D|\uFE0F)+\s*$/u.test(
      sample,
    );
    emojiPlacement = endsWithEmoji ? "suelen ir al final" : "repartidos en el texto";
  }

  const commas = (sample.match(/,/g) || []).length;
  const ellipses = (sample.match(/\.{3,}|…/g) || []).length;
  const sentenceCount = (sample.match(/[.!?]+/g) || []).length || 1;
  const wordCount = (sample.match(/\p{L}+/gu) || []).length;
  const avgWords = sentenceCount ? wordCount / sentenceCount : wordCount;

  const lengthProfile =
    avgWords <= 6
      ? "frases cortas y directas"
      : avgWords <= 12
        ? "frases medias"
        : "frases largas y elaboradas";
  const commaProfile =
    commas >= 2
      ? "usa comas con frecuencia"
      : commas === 1
        ? "usa comas ocasionalmente"
        : "casi no usa comas";
  const ellipsesProfile =
    ellipses >= 2
      ? "usa puntos suspensivos con frecuencia"
      : ellipses === 1
        ? "usa puntos suspensivos ocasionalmente"
        : "no usa puntos suspensivos";

  return [
    `- Ritmo y puntuación: ${lengthProfile}; ${commaProfile}; ${ellipsesProfile}.`,
    `- Densidad de emojis: ${emojiDensity}${emojiPlacement ? `; ${emojiPlacement}` : ""}.`,
    `- Capitalización: ${capitalization}.`,
  ].join("\n");
};

const softenForUserVoice = (text, hasUserVoice) => {
  if (!text || !hasUserVoice) return text || "";
  return text
    .replace(/\bOBLIGATORIO\b/g, "SUGERIDO")
    .replace(/\bDEBE\b/g, "conviene")
    .replace(/\bPROHIBIDO\b/g, "evita")
    .replace(/\bMÁXIMA PRIORIDAD\b/g, "prioridad contextual");
};

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
    essenceProfile,
    styleSample,
  } = data;

  // 1. CONTEXTO REGIONAL (INVISIBLE: SOLO SINTAXIS/REGISTRO)
  const regionalSyntaxHint = getRegionalSyntaxHint(
    userLocation,
    planLevel,
    neutralMode,
    styleSample,
  );

  // 2. INTENCIÓN DEL GUARDIÁN (OBJETIVO PSICOLÓGICO)
  let intentionInstruction = "";
  const intentionMap = {
    low_effort:
      "OBJETIVO: BAJO ESFUERZO. Mantén cercanía con carga mínima; evita preguntas complejas.",
    inquiry:
      "OBJETIVO: CONECTAR. Muestra curiosidad genuina y favorece continuidad conversacional.",
    resolutive:
      "OBJETIVO: RESOLVER. Sé directo y propone opciones claras, sin ambigüedad.",
    action:
      "OBJETIVO: IMPULSAR. Usa llamada a la acción suave, persuasiva y concreta.",
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

    energyInstruction = `\n### ADAPTACIÓN DE ENERGÍA (ESPEJO)\nEl mensaje recibido tiene ${receivedLength} caracteres. Ajusta la respuesta a una longitud **${responseLength}** para mantener el mismo ritmo.`;
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

  // 5. COHERENCIA DE TONO (VERSIÓN COMPACTA)
  let toneInstruction = "";
  const toneCompactMap = {
    "sarcástico":
      "Humor inteligente y ligero; evita ataques personales. Búrlate de la situación, no de la persona. Usa emojis con moderación.",
    coqueto:
      "Coqueteo sutil y respetuoso; sugiere más de lo que afirma. Evita lenguaje vulgar o explícito. Mantén elegancia natural.",
    divertido:
      "Humor contextual y fresco; evita chistes gastados. Suena espontáneo, no prefabricado. Prioriza naturalidad conversacional.",
    sincero:
      "Habla con verdad simple y directa. Evita melodrama o victimismo. Debe sentirse sereno y humano.",
    formal:
      "Registro correcto y respetuoso, sin rigidez burocrática. Prioriza claridad por encima de protocolo. Sonido profesional pero cercano.",
    profundo:
      "Profundidad clara, sin palabras rebuscadas. Conecta idea y emoción de forma concreta. Evita abstracción vacía.",
    sutil:
      "Sugiere sin forzar, dejando espacio de interpretación. La intención debe entenderse entre líneas. Mantén suavidad natural.",
    atrasado:
      "Reconoce el retraso brevemente y pasa a los buenos deseos. Evita excusas largas. Tono honesto y ligero.",
    "desesperado-light":
      "Muestra vulnerabilidad con dignidad. Expresa interés sin suplicar. Breve, emocional y con autocontrol.",
    corto:
      "Máxima brevedad y alto impacto. Evita relleno y rodeos. Idealmente 1 a 2 oraciones.",
    orgulloso:
      "Enfatiza reconocimiento, mérito y validación genuina. Si hay nombre disponible, úsalo para personalizar. Debe sonar celebratorio y cercano.",
    entusiasta:
      "Energía alta y optimista con ritmo ágil. Celebra y proyecta impulso positivo. Evita exageración artificial.",
  };

  if (isDirect) {
    toneInstruction =
      "Ve al punto desde la primera frase. Ancla el mensaje al contexto real y evita metáforas o adornos innecesarios. Mantén un tono práctico.";
  } else if (tone === "romántico") {
    const isLigue =
      relationship &&
      (relationship.toLowerCase().includes("ligue") ||
        relationship.toLowerCase().includes("crush"));
    toneInstruction = isLigue
      ? "Romántico suave y auténtico, sin promesas extremas ni intensidad desmedida. Enfócate en detalle emocional concreto y cercanía natural."
      : "Romántico auténtico, evitando clichés de tarjeta. Habla desde sensaciones concretas y calidez real. Mantén equilibrio, sin empalago.";
  } else if (toneCompactMap[tone]) {
    toneInstruction = toneCompactMap[tone];
  }

  // 6. REGLA DE APERTURA PARA CELEBRACIONES (VERSIÓN COMPACTA)
  let celebrationInstruction = "";
  const celebrationMap = {
    birthday: "Abre con saludo de cumpleaños natural (ej. 'Feliz cumpleaños').",
    anniversary: "Abre con saludo de aniversario natural (ej. 'Feliz aniversario').",
    mothers_day: "Abre con saludo de Día de la Madre natural y cálido.",
    fathers_day: "Abre con saludo de Día del Padre natural y cálido.",
    christmas: "Abre con saludo navideño natural.",
    valentines: "Abre con saludo de San Valentín natural.",
    new_year: "Abre con saludo de Año Nuevo natural.",
    woman_day: "Abre con saludo de Día de la Mujer natural y respetuoso.",
    felicitacion: "Abre con felicitación directa y cercana.",
  };

  if (celebrationMap[occasion]) {
    celebrationInstruction = `\n### REGLA DE APERTURA Y ENFOQUE (CELEBRACIÓN)\n${celebrationMap[occasion]}\nEnfoca el contenido en celebrar sin desviarte con temas aleatorios.`;
  }

  // 7. PERFIL DE ESENCIA (PREMIUM - IDENTIDAD DE USUARIO)
  let essenceInstruction = "";
  if (essenceProfile) {
    const instructions = [];
    if (essenceProfile.expressiveness && ESSENCE_MAPS.expressiveness[essenceProfile.expressiveness]) {
      instructions.push(`- Expresividad: ${ESSENCE_MAPS.expressiveness[essenceProfile.expressiveness]}`);
    }
    if (essenceProfile.intensity && ESSENCE_MAPS.intensity[essenceProfile.intensity]) {
      instructions.push(`- Intensidad: ${ESSENCE_MAPS.intensity[essenceProfile.intensity]}`);
    }
    if (essenceProfile.pride && ESSENCE_MAPS.pride[essenceProfile.pride]) {
      instructions.push(`- Orgullo: ${ESSENCE_MAPS.pride[essenceProfile.pride]}`);
    }
    if (essenceProfile.style && ESSENCE_MAPS.style[essenceProfile.style]) {
      instructions.push(`- Estilo: ${ESSENCE_MAPS.style[essenceProfile.style]}`);
    }

    if (instructions.length > 0) {
      essenceInstruction = `\nAdapta tu redacción a este perfil de personalidad:\n${instructions.join("\n")}`;
    }
  }

  // 7.1 HUELLA DE ESTILO (FINGERPRINT)
  const styleFingerprint = buildStyleFingerprint(styleSample);
  const hasUserVoice = Boolean(styleFingerprint || lastUserStyle);
  const styleFingerprintInstruction = styleFingerprint
    ? `\n### HUELLA DE ESTILO (FINGERPRINT)\n${styleFingerprint}\nRegla: imita la estructura visual (pausas, emojis, capitalización) sin copiar texto literal.`
    : "";

  const lexicalInstruction = preferredLexicon?.length > 0
    ? hasUserVoice
      ? `Integra el léxico preferido solo cuando fluya con la voz detectada: ${preferredLexicon.join(", ")}.`
      : isDirect
        ? `Puedes usar parte de este léxico si encaja con brevedad: ${preferredLexicon.join(", ")}.`
        : `Puedes usar este léxico cuando suene natural: ${preferredLexicon.join(", ")}.`
    : "Usa lenguaje natural.";

  const toneInstructionFinal = softenForUserVoice(toneInstruction, hasUserVoice);
  const styleInstructionsFinal = softenForUserVoice(styleInstructions, hasUserVoice);
  const celebrationInstructionFinal = softenForUserVoice(
    celebrationInstruction,
    hasUserVoice,
  );

  // 7. CONSTRUCCIÓN DEL SYSTEM INSTRUCTION (JERARQUÍA LIMPIA)
  const systemInstructionText = `
### ROLE
Eres el "Guardián de Sentimiento". Escribes EN NOMBRE DEL USUARIO para su CONTACTO en lenguaje real de chat.
${intentionInstruction}

### PRIORIDAD ESTRICTA
1. VOZ DEL USUARIO (muestra/fingerprint) domina sobre cualquier otra regla.
2. CONTEXTO REAL (relación, ocasión, mensaje recibido).
3. INTENCIÓN CONVERSACIONAL.
4. TONO BASE.
5. AJUSTE REGIONAL INVISIBLE (solo sintaxis/registro).

### REGLAS BASE
0. Si no hay historial previo, no inventes recuerdos.
1. Evita frases de folleto, poesía genérica o saludos robóticos.
2. ADN LÉXICO: ${lexicalInstruction}
${avoidTopics ? `3. TEMAS A EVITAR: no menciones ${avoidTopics}.` : ""}
${isDirect ? `4. Si el tono es DIRECTO, prioriza frases simples y accionables, sin metáforas.` : ""}

### LÓGICA DE APRENDIZAJE (IMITA SIN COPIAR)
1. **Voz del usuario:** ${lastUserStyle ? `Imita el ritmo, la longitud aproximada y la puntuación de este ejemplo del usuario: "${lastUserStyle}".` : "No hay ejemplo del usuario. Usa un estilo conversacional natural."}
2. **Estructura visual:** prioriza pausas, puntuación, emojis y capitalización del usuario.
3. **Evita copia literal:** no repitas frases completas del ejemplo; replica el patrón, no el texto.
${styleFingerprintInstruction}

${regionalSyntaxHint ? `### REGIONALIZACIÓN INVISIBLE\n${regionalSyntaxHint}` : ""}

### JERARQUÍA DE ESTILO (ORDEN DE IMPORTANCIA)
${styleInstructionsFinal ? `1. GUIA DE CONTEXTO (GUARDIÁN): ${styleInstructionsFinal}` : ""}
${essenceInstruction ? `2. IDENTIDAD DE USUARIO (ESENCIA): ${essenceInstruction}` : ""}
${toneInstructionFinal ? `3. TONO BASE: ${toneInstructionFinal}` : ""}
${celebrationInstructionFinal ? `4. CELEBRACIÓN (SUAVE): ${celebrationInstructionFinal}` : ""}

### CONTEXTO DINÁMICO
- Salud Relacional: ${relationalHealth}/10. ${relationalHealth > 8 ? "Confianza alta/Humor." : "Cuidado/Vulnerabilidad."}
- Género Gramatical: ${grammaticalGender || "neutral"}.
${energyInstruction}
${timeInstruction}
${occasion === "perdoname" ? `\n### PERDÓN: El usuario pide disculpas. FOCO: "Lo siento", "Me equivoqué". ${apologyReason ? `Motivo: ${apologyReason}` : ""}` : ""}
`.trim();

  // 8. FORMATO DE SALIDA (SEPARADO DE REDACCIÓN)
  const outputContract = formatInstruction
    ? `\n### CONTRATO DE FORMATO (NO ALTERA LA VOZ)
Redacta primero un mensaje humano y natural según las reglas anteriores.
Después adapta esa salida al formato solicitado a continuación, sin cambiar el estilo de voz:\n${formatInstruction}`
    : "";

  // 9. PROMPT DE USUARIO (DATOS PUROS)
  const promptText = `
### INPUT DATA
- Relationship: ${relationship} | Occasion: ${occasion}
- Context: ${contextWords || "N/A"}
- Received: "${receivedText || "N/A"}"
- RegionalSyntax: ${regionalSyntaxHint || "N/A"}
${outputContract}
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
