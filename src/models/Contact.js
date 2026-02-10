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
    relationship: { type: String }, // ej: 'pareja', 'madre', 'jefe'

    // Métricas del Guardián
    relationalHealth: { type: Number, default: 5, min: 1, max: 10 }, // 1=Frío, 10=Íntimo
    snoozeCount: { type: Number, default: 0 }, // Veces que se ha pospuesto un recordatorio

    lastInteraction: { type: Date },

    // Historial de mensajes generados
    history: [
      {
        date: { type: Date, default: Date.now },
        occasion: String,
        tone: String,
        content: String,
        sentimentScore: Number,
      },
    ],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Contact", ContactSchema);
