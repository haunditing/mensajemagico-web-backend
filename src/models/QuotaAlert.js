const mongoose = require("mongoose");

const QuotaAlertSchema = new mongoose.Schema({
  date: { type: String, required: true }, // YYYY-MM-DD
  level: {
    type: String,
    enum: ["warning", "critical"],
    required: true,
  },
  payload: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now },
});

QuotaAlertSchema.index({ date: 1, level: 1 }, { unique: true });

module.exports = mongoose.model("QuotaAlert", QuotaAlertSchema);
