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

// Extracción de ADN Léxico (Palabras nuevas que no estaban en el original)
const extractLexicalDNA = (original, edited) => {
  const clean = (text) => {
    if (!text) return [];
    try {
      // Tokenización avanzada: Captura palabras (\p{L}), números (\p{N}) y Emojis (\p{Extended_Pictographic})
      // Esto permite que el Guardián aprenda si usas emojis específicos.
      return text.toLowerCase().match(/(\p{L}+|\p{N}+|\p{Extended_Pictographic}+)/gu) || [];
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
    // Si es un emoji (no tiene letras), lo incluimos siempre. Si es palabra, filtramos las muy cortas.
    return !/[a-záéíóúñü]/i.test(w) || w.length > 2;
  });

  // Identificar expresiones cortas (bigramas) que podrían ser muletillas (ej: "pues si", "ya ves")
  const bigrams = [];
  for (let i = 0; i < editedArr.length - 1; i++) {
    const bigram = `${editedArr[i]} ${editedArr[i+1]}`;
    if (!original.toLowerCase().includes(bigram)) {
      bigrams.push(bigram);
    }
  }

  return [...new Set([...newWords, ...bigrams])];
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
    contact.history.push({
      occasion,
      tone,
      content: typeof content === "string" ? content : JSON.stringify(content),
      sentimentScore: healthBonus,
    });

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

module.exports = {
  getContext,
  recordInteraction,
  analyzeSentiment,
  extractStyle,
  calculateFriction,
  extractLexicalDNA,
};
