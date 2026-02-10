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

  const positiveConcept =
    "Amor, cercanía, gratitud, celebración, intimidad, confianza, alegría, apoyo, conexión profunda";
  const negativeConcept =
    "Distancia, frialdad, indiferencia, olvido, conflicto, formalidad excesiva, desconexión";

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
  { occasion, tone, content },
) => {
  try {
    if (!contactId) return;

    const contact = await Contact.findOne({ _id: contactId, userId });
    if (!contact) return;

    const cleanText = extractMessageContent(content);
    const anchors = await getAnchors();
    let healthBonus = 0.1; // Bonus mínimo por el intento

    // Análisis Semántico con Embeddings
    if (anchors && cleanText && cleanText.trim().length > 0) {
      const res = await embeddingModel.embedContent(cleanText);
      const msgVector = res.embedding.values;

      const posSim = cosineSimilarity(msgVector, anchors.positive);
      const negSim = cosineSimilarity(msgVector, anchors.negative);

      // Si la similitud positiva no supera un umbral alto (ej. 0.8), el bono debe ser menor.
      if (posSim > negSim) {
        // Solo dar un bono alto (> 0.3) si el mensaje es verdaderamente cálido
        healthBonus = posSim > 0.8 ? posSim * 0.5 : posSim * 0.1;
      } else {
        healthBonus = 0.05; // Mensajes neutros o fríos
      }
    }

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
    });
  } catch (error) {
    logger.error("Error en recordInteraction del Guardián", { error });
  }
};

module.exports = { getContext, recordInteraction };
