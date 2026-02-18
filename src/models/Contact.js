// c:\Users\marvi\OneDrive\Escritorio\Personal\mensajemagico-web-backend\src\models\Contact.js
const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: { type: String, required: true },
    relationship: { type: String, lowercase: true, trim: true }, // ej: 'pareja', 'madre', 'jefe'
    grammaticalGender: { type: String },

    // Métricas del Guardián
    relationalHealth: { type: Number, default: 5, min: 1, max: 10 }, // 1=Frío, 10=Íntimo
    snoozeCount: { type: Number, default: 0 }, // Veces que se ha pospuesto un recordatorio

    // Metadatos de aprendizaje del Guardián
    guardianMetadata: {
      lastUserStyle: { type: String }, // Última edición del usuario (ej: "Hola mi bollito...")
      preferredLexicon: [{ type: String }], // Palabras recurrentes (ADN Léxico)
      editFrictionHistory: [{ type: Number }], // Historial de % de cambios (Fricción)
      trained: { type: Boolean, default: false },
    },

    lastInteraction: { type: Date },

    // Historial de mensajes generados
    history: [
      {
        date: { type: Date, default: Date.now },
        occasion: String,
        tone: String,
        content: String,
        sentimentScore: Number,
        wasEdited: { type: Boolean, default: false },
        originalContent: String,
        isUsed: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Contact", ContactSchema);
