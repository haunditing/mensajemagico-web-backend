const logger = require("../utils/logger");
const Contact = require("../models/Contact");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Inicializar Google AI
if (!process.env.AI_API_KEY) {
  logger.warn(
    "GuardianService: AI_API_KEY no está definida. El análisis de sentimientos no funcionará.",
  );
}

const genAI = new GoogleGenerativeAI(process.env.AI_API_KEY);
// Usamos text-embedding-004 que tiene 100 RPM según tu cuota
const embeddingModel = genAI.getGenerativeModel({
  model: "gemini-embedding-001",
});

// Cache para los polos semánticos
let anchorVectors = null;

/**
 * Genera o recupera los vectores de referencia para comparar sentimientos.
 */
const getAnchors = async () => {
  if (anchorVectors) return anchorVectors;

  // Ampliamos los conceptos para equilibrar género gramatical y matices (ej. Gratitud (F) vs Agradecimiento (M))
  const positiveConcept =
    "Amor, cariño, cercanía, gratitud, agradecimiento, celebración, intimidad, confianza, seguridad, alegría, entusiasmo, apoyo, respaldo, conexión profunda, vínculo";
  const negativeConcept =
    "Distancia, alejamiento, frialdad, indiferencia, desinterés, olvido, abandono, conflicto, problema, formalidad excesiva, rigidez, desconexión, aislamiento";

  try {
    const [posRes, negRes] = await Promise.all([
      embeddingModel.embedContent(positiveConcept),
      embeddingModel.embedContent(negativeConcept),
    ]);

    anchorVectors = {
      positive: posRes.embedding.values,
      negative: negRes.embedding.values,
    };
    return anchorVectors;
  } catch (error) {
    logger.error("Guardián: Error generando anchors de embeddings", { error });
    return null;
  }
};

/**
 * Cálculo de Similitud de Coseno para comparar vectores.
 */
const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0,
    magA = 0,
    magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
};

/**
 * Extrae el texto limpio de la respuesta de la IA para analizarlo.
 */
const extractMessageContent = (content) => {
  try {
    if (typeof content === "string" && content.trim().startsWith("{")) {
      const parsed = JSON.parse(content);
      if (
        parsed.generated_messages &&
        Array.isArray(parsed.generated_messages)
      ) {
        return parsed.generated_messages.map((m) => m.content).join(" ");
      }
    }
    return typeof content === "string" ? content : JSON.stringify(content);
  } catch (e) {
    return String(content);
  }
};

/**
 * Analiza el sentimiento de un texto usando Embeddings.
 * Devuelve un puntaje de "salud" (bonus/malus).
 */
const analyzeSentiment = async (text) => {
  const cleanText = extractMessageContent(text);
  const anchors = await getAnchors();
  let healthBonus = 0.1; // Base

  if (anchors && cleanText && cleanText.trim().length > 0) {
    try {
      const res = await embeddingModel.embedContent(cleanText);
      const msgVector = res.embedding.values;

      const posSim = cosineSimilarity(msgVector, anchors.positive);
      const negSim = cosineSimilarity(msgVector, anchors.negative);

      if (posSim > negSim) {
        healthBonus = posSim > 0.8 ? posSim * 0.5 : posSim * 0.1;
      } else {
        healthBonus = 0.05;
      }
    } catch (error) {
      logger.warn("Error en análisis de sentimiento", { error: error.message });
    }
  }
  return healthBonus;
};

const extractStyle = (text) => {
  // Por ahora, usamos el texto editado como "few-shot example" para la IA.
  // Limitamos a 200 caracteres para no saturar el contexto.
  return text ? text.substring(0, 200) : "";
};

// Cálculo de distancia de Levenshtein para medir fricción
const calculateFriction = (original, edited) => {
  if (!original || !edited) return 100;
  const a = original.trim();
  const b = edited.trim();
  const matrix = [];

  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1),
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLength = Math.max(a.length, b.length);
  return Math.round((distance / maxLength) * 100);
};

// Lista de palabras comunes (Stop Words) para no ensuciar el ADN léxico
const STOP_WORDS = new Set([
  "que",
  "qué",
  "los",
  "las",
  "una",
  "unos",
  "unas",
  "para",
  "por",
  "con",
  "del",
  "al",
  "pero",
  "mas",
  "más",
  "sin",
  "sobre",
  "este",
  "esta",
  "está",
  "estos",
  "estas",
  "todo",
  "toda",
  "todos",
  "todas",
  "como",
  "cómo",
  "cuando",
  "donde",
  "quien",
  "porque",
  "pues",
  "entonces",
  "luego",
  "bien",
  "mal",
  "asi",
  "así",
  "eso",
  "esto",
  "aquello",
  "aqui",
  "aquí",
  "alli",
  "allí",
  "alla",
  "allá",
  "ahora",
  "hoy",
  "ayer",
  "mañana",
  "siempre",
  "nunca",
  "quizas",
  "quizás",
  "tal",
  "vez",
  "ser",
  "estar",
  "haber",
  "tener",
  "hacer",
  "poder",
  "decir",
  "ir",
  "ver",
  "dar",
  "saber",
  "querer",
  "llegar",
  "pasar",
  "deber",
  "poner",
  "parecer",
  "quedar",
  "creer",
  "hablar",
  "llevar",
  "dejar",
  "seguir",
  "encontrar",
  "llamar",
  "venir",
  "pensar",
  "salir",
  "volver",
  "tomar",
  "conocer",
  "vivir",
  "sentir",
  "tratar",
  "mirar",
  "contar",
  "empezar",
  "esperar",
  "buscar",
  "existir",
  "entrar",
  "trabajar",
  "escribir",
  "perder",
  "producir",
  "ocurrir",
  "entender",
  "pedir",
  "recibir",
  "recordar",
  "terminar",
  "permitir",
  "aparecer",
  "conseguir",
  "comenzar",
  "servir",
  "sacar",
  "necesitar",
  "mantener",
  "resultar",
  "leer",
  "caer",
  "cambiar",
  "presentar",
  "crear",
  "abrir",
  "considerar",
  "oir",
  "acabar",
  "convertir",
  "ganar",
  "formar",
  "traer",
  "partir",
  "morir",
  "aceptar",
  "realizar",
  "suponer",
  "comprender",
  "lograr",
  "explicar",
  "preguntar",
  "tocar",
  "reconocer",
  "estudiar",
  "alcanzar",
  "nacer",
  "dirigir",
  "correr",
  "utilizar",
  "pagar",
  "ayudar",
  "gustar",
  "jugar",
  "escuchar",
  "cumplir",
  "ofrecer",
  "descubrir",
  "levantar",
  "intentar",
]);

// Extracción de ADN Léxico (Palabras nuevas que no estaban en el original)
const extractLexicalDNA = (original, edited) => {
  const clean = (text) => {
    if (!text) return [];
    try {
      // Tokenización avanzada: Captura palabras, números, Hashtags (#), Menciones (@) y Emojis
      // MEJORA: Regex robusta para emojis compuestos (ZWJ, Modificadores, Banderas) que los captura como unidad
      return (
        text
          .toLowerCase()
          .match(
            /([#@]?[\\p{L}\\p{N}_]+|(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|\u200D|\uFE0F)+)/gu,
          ) || []
      );
    } catch (e) {
      // Fallback para entornos antiguos
      return text
        .toLowerCase()
        .replace(/[^\w\sáéíóúñü]/gi, " ")
        .split(/\s+/);
    }
  };

  const originalSet = new Set(clean(original));
  const editedArr = clean(edited);

  // Identificar palabras que el usuario AGREGÓ (no estaban en el original)
  const newWords = editedArr.filter((w) => {
    if (originalSet.has(w)) return false;
    // Filtrar emojis (debe tener letras) y palabras muy cortas (letras solas o de 2 caracteres)
    return /[a-záéíóúñü]/i.test(w) && w.length > 2 && !STOP_WORDS.has(w);
  });

  // Identificar expresiones cortas (bigramas) que podrían ser muletillas (ej: "pues si", "ya ves")
  const bigrams = [];
  for (let i = 0; i < editedArr.length - 1; i++) {
    const bigram = `${editedArr[i]} ${editedArr[i + 1]}`;
    if (!original.toLowerCase().includes(bigram)) {
      bigrams.push(bigram);
    }
  }

  return [...new Set([...newWords, ...bigrams])];
};

// Minería de Léxico: Extrae palabras frecuentes del historial validado
const mineLexiconFromHistory = (history) => {
  const wordCounts = {};
  history.forEach((msg) => {
    if (!msg.content) return;
    // Extraer palabras significativas (más de 3 letras, no stop-words)
    const words = msg.content.toLowerCase().match(/(\p{L}+)/gu) || [];
    words.forEach((w) => {
      if (w.length > 2 && !STOP_WORDS.has(w)) {
        wordCounts[w] = (wordCounts[w] || 0) + 1;
      }
    });
  });

  // Umbral: Palabras que aparecen en al menos el 20% de los mensajes guardados
  const threshold = Math.max(2, Math.ceil(history.length * 0.2));
  return Object.entries(wordCounts)
    .filter(([_, count]) => count >= threshold)
    .map(([word]) => word);
};

/**
 * OBTIENE EL CONTEXTO: Incluye lógica de decaimiento temporal.
 * Si ha pasado mucho tiempo, la salud baja automáticamente.
 */
const getContext = async (userId, contactId) => {
  try {
    if (!contactId) return { relationalHealth: 5, snoozeCount: 0 };

    const contact = await Contact.findOne({ _id: contactId, userId });
    if (!contact) return { relationalHealth: 5, snoozeCount: 0 };

    // Lógica de Decaimiento: Perder 0.1 de salud por cada 3 días de inactividad
    const daysInactivity = Math.floor(
      (new Date() - new Date(contact.lastInteraction)) / (1000 * 60 * 60 * 24),
    );
    if (daysInactivity > 3) {
      const decay = Math.floor(daysInactivity / 3) * 0.1;
      contact.relationalHealth = Math.max(1, contact.relationalHealth - decay);
      await contact.save();
    }

    return {
      relationalHealth: Number(contact.relationalHealth.toFixed(2)),
      snoozeCount: contact.snoozeCount,
      lastInteraction: contact.lastInteraction,
      lastUserStyle: contact.guardianMetadata?.lastUserStyle,
      preferredLexicon: contact.guardianMetadata?.preferredLexicon || [],
    };
  } catch (error) {
    logger.error("Error en getContext del Guardián", { error });
    return { relationalHealth: 5, snoozeCount: 0 };
  }
};

/**
 * REGISTRA INTERACCIÓN: Analiza el mensaje con Embeddings y actualiza salud.
 */
const recordInteraction = async (
  userId,
  contactId,
  { occasion, tone, content, grammaticalGender },
) => {
  try {
    if (!contactId) return;

    const contact = await Contact.findOne({ _id: contactId, userId });
    if (!contact) return;

    const healthBonus = await analyzeSentiment(content);

    // Actualizar contacto
    // NOTA: Ya no guardamos el mensaje aquí. Solo se guarda si el usuario lo valida (markAsUsed).
    // Esto evita ensuciar el historial con generaciones descartadas o regeneradas.
    // Mantenemos la actualización de salud y fecha para reflejar la actividad.

    contact.lastInteraction = new Date();
    contact.relationalHealth = Math.min(
      10,
      contact.relationalHealth + healthBonus,
    );

    // Al generar un mensaje, el interés se renueva: reset de snooze
    contact.snoozeCount = 0;

    await contact.save();

    logger.info("Guardián: Salud actualizada mediante Embeddings", {
      contactId,
      newHealth: contact.relationalHealth,
      bonus: healthBonus,
      genderContext: grammaticalGender || "N/A",
    });
  } catch (error) {
    logger.error("Error en recordInteraction del Guardián", { error });
  }
};

/**
 * MARCA UN MENSAJE COMO USADO/EXITOSO
 * Actualiza el historial y refina el perfil del usuario.
 */
const markAsUsed = async (
  userId,
  contactId,
  content,
  { occasion, tone, originalContent },
) => {
  try {
    const contact = await Contact.findOne({ _id: contactId, userId });
    if (!contact) return;

    // 1. Actualizar Historial
    // Buscamos si ya existe (por contenido exacto o si fue el último generado)
    // FIX: Usamos originalContent si existe para buscar el mensaje original que generó la IA
    const searchContent = originalContent || content;
    let historyItem = contact.history.find((h) => h.content === searchContent);

    // FIX: Si no hay match exacto, buscamos si el contenido está dentro de un JSON guardado (caso común)
    if (!historyItem) {
      const recentHistory = contact.history.slice(-10); // Miramos los últimos 10
      const jsonItem = recentHistory.find((h) => {
        if (typeof h.content !== "string" || !h.content.trim().startsWith("{"))
          return false;

        // Intento 1: Búsqueda simple (rápida)
        if (h.content.includes(searchContent.substring(0, 20))) return true;

        // Intento 2: Parsear JSON para comparar contenido limpio (robusta)
        try {
          const parsed = JSON.parse(h.content);
          const msgs = parsed.generated_messages || [];
          // Buscamos si alguno de los mensajes generados coincide con el original
          return msgs.some((m) => m.content === searchContent);
        } catch (e) {
          return false;
        }
      });

      if (jsonItem) historyItem = jsonItem;
    }

    if (historyItem) {
      historyItem.isUsed = true;
      // Actualizamos el contenido al texto final limpio/editado para mejorar el contexto futuro
      historyItem.content = content;
      if (originalContent && originalContent !== content) {
        historyItem.wasEdited = true;
      }
      logger.info(
        `✅ [VALIDACIÓN] Mensaje existente actualizado a isUsed=true: "${content.substring(0, 20)}..."`,
      );
    } else {
      // Si no existe (ej. fue editado), lo agregamos como nuevo éxito
      // Calculamos el sentimiento aquí ya que recordInteraction no lo guardó
      const sentimentScore = await analyzeSentiment(content);
      contact.history.push({
        occasion,
        tone,
        content,
        sentimentScore,
        timestamp: new Date(),
        isUsed: true,
        wasEdited: !!originalContent && originalContent !== content,
      });
      logger.info(
        `✅ [VALIDACIÓN] Nuevo mensaje insertado con isUsed=true: "${content.substring(0, 20)}..."`,
      );
    }

    // 3. Gestión de Historial (Límite de 15 mensajes)
    // Mantenemos solo los últimos 15 para que la IA aprenda del "yo" actual
    if (contact.history.length > 15) {
      const excess = contact.history.length - 15;
      contact.history.splice(0, excess); // Eliminar los más antiguos
      logger.info(
        `Guardián: Limpieza de historial. Se eliminaron ${excess} mensajes antiguos.`,
      );
    }

    // 2. Refinamiento de Estilo (Si hubo edición)
    if (originalContent && originalContent !== content) {
      if (!contact.guardianMetadata) contact.guardianMetadata = {};
      // Guardamos la versión final como el "estilo ideal"
      contact.guardianMetadata.lastUserStyle = extractStyle(content);

      // Extraemos ADN de la diferencia
      const newDna = extractLexicalDNA(originalContent, content);
      const currentLexicon = new Set(
        contact.guardianMetadata.preferredLexicon || [],
      );
      newDna.forEach((word) => currentLexicon.add(word));
      contact.guardianMetadata.preferredLexicon =
        Array.from(currentLexicon).slice(-50);
    } else {
      // Si no hubo edición, reforzamos las palabras clave del mensaje exitoso
      const currentLexicon = new Set(
        contact.guardianMetadata?.preferredLexicon || [],
      );
      const words = extractLexicalDNA("", content); // Extraer palabras significativas del mensaje final
      words.forEach((w) => currentLexicon.add(w));
      if (!contact.guardianMetadata) contact.guardianMetadata = {};
      contact.guardianMetadata.preferredLexicon =
        Array.from(currentLexicon).slice(-50);
    }

    // 4. Minería de Datos (ADN Profundo)
    // Analizamos el historial consolidado para encontrar patrones recurrentes
    const minedWords = mineLexiconFromHistory(contact.history);

    if (minedWords.length > 0) {
      logger.info(
        `Guardián: Minería de datos. Palabras frecuentes detectadas: ${minedWords.join(", ")}`,
      );
    }

    const finalLexicon = new Set([
      ...(contact.guardianMetadata.preferredLexicon || []),
      ...minedWords,
    ]);
    // Mantenemos el léxico fresco y relevante (máx 60 palabras)
    contact.guardianMetadata.preferredLexicon =
      Array.from(finalLexicon).slice(-60);

    await contact.save();
    logger.info("Guardián: Mensaje marcado como usado/exitoso", { contactId });
  } catch (error) {
    logger.error("Error en markAsUsed", { error });
  }
};

module.exports = {
  getContext,
  recordInteraction,
  analyzeSentiment,
  extractStyle,
  calculateFriction,
  extractLexicalDNA,
  markAsUsed,
};
