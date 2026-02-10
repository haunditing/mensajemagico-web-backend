const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");
const GuardianService = require("../services/GuardianService");
const authenticate = require("../middleware/auth");
const logger = require("../utils/logger");

// POST /api/guardian/learn - Aprender de la edición del usuario
router.post("/learn", authenticate, async (req, res) => {
  const { contactId, originalText, editedText } = req.body;

  try {
    const contact = await Contact.findOne({ _id: contactId, userId: req.userId });
    if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

    // 1. Calcular el Delta de Sentimiento (¿El usuario lo hizo más frío o más cálido?)
    // const originalScore = await GuardianService.analyzeSentiment(originalText); // Opcional para métricas
    const editedScore = await GuardianService.analyzeSentiment(editedText);

    // 2. Extraer "Keywords de Estilo"
    const userStyle = GuardianService.extractStyle(editedText);

    // 3. Actualizar el Perfil del Contacto
    contact.guardianMetadata = {
      lastUserStyle: userStyle,
      trained: true
    };
    
    // Actualizar salud basada en lo que REALMENTE se envió
    contact.relationalHealth = Math.min(10, Math.max(1, contact.relationalHealth + editedScore));
    
    // Guardar en historial como editado
    contact.history.push({
      content: editedText,
      wasEdited: true,
      originalContent: originalText,
      date: new Date(),
      sentimentScore: editedScore
    });

    await contact.save();
    res.json({ success: true, newHealth: contact.relationalHealth });
  } catch (error) {
    logger.error("Error en Guardian Learn", { error });
    res.status(500).json({ error: "Error aprendiendo del usuario" });
  }
});

module.exports = router;