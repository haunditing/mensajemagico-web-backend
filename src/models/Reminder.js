// src/models/Reminder.js
const mongoose = require("mongoose");

const ReminderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  date: { type: Date, required: true }, // Fecha base del evento
  nextOccurrence: { type: Date }, // Próxima fecha de notificación (calculada)
  type: {
    type: String,
    enum: ["custom", "birthday", "anniversary", "event", "holiday"],
    default: "custom",
  },
  isRecurring: { type: Boolean, default: true }, // Si se repite cada año (ej. cumpleaños)
  notes: { type: String },
  notificationTime: { type: String, default: "09:00" }, // Hora formato HH:MM
  socialPlatform: { type: String }, // Plataforma objetivo (ej: 'WhatsApp', 'Instagram')
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Reminder", ReminderSchema);
