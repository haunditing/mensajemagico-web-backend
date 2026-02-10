// src/models/SystemUsage.js
const mongoose = require("mongoose");

const SystemUsageSchema = new mongoose.Schema({
  date: { type: String, required: true }, // Formato YYYY-MM-DD
  model: { type: String, required: true },
  count: { type: Number, default: 0 },
});

// Índice único para asegurar una sola entrada por modelo/día
SystemUsageSchema.index({ date: 1, model: 1 }, { unique: true });

// Método estático para incrementar uso de forma atómica
SystemUsageSchema.statics.increment = async function (modelName) {
  const today = new Date().toISOString().split("T")[0];
  return this.findOneAndUpdate(
    { date: today, model: modelName },
    { $inc: { count: 1 } },
    { upsert: true, new: true },
  );
};

// Método para obtener uso actual
SystemUsageSchema.statics.getCount = async function (modelName) {
  const today = new Date().toISOString().split("T")[0];
  const usage = await this.findOne({ date: today, model: modelName });
  return usage ? usage.count : 0;
};

module.exports = mongoose.model("SystemUsage", SystemUsageSchema);
