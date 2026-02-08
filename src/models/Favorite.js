const mongoose = require("mongoose");

const FavoriteSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true },
  occasion: { type: String, required: true },
  tone: { type: String },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Favorite", FavoriteSchema);
