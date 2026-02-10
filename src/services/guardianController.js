// guardianController.js
const learnFromUserEdit = async (req, res) => {
  const { contactId, originalText, editedText, userId } = req.body;

  // 1. Calcular el Delta de Sentimiento (¿El usuario lo hizo más frío o más cálido?)
  const originalScore = await GuardianService.analyzeSentiment(originalText);
  const editedScore = await GuardianService.analyzeSentiment(editedText);

  // 2. Extraer "Keywords de Estilo" (Palabras que el usuario añadió)
  const userStyle = GuardianService.extractStyle(editedText);

  // 3. Actualizar el Perfil del Contacto
  await Contact.findByIdAndUpdate(contactId, {
    $set: {
      "guardianMetadata.lastUserStyle": userStyle,
      relationalHealth: editedScore.totalHealth, // La salud ahora se basa en lo que REALMENTE se envió
    },
    $push: {
      interactionHistory: {
        content: editedText,
        wasEdited: true,
        originalContent: originalText,
      },
    },
  });

  res.status(200).json({ success: true, newHealth: editedScore.totalHealth });
};
