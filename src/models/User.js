const mongoose = require("mongoose");
const PLAN_CONFIG = require("../config/plans");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  profilePicture: { type: String, default: "" },
  stripeCustomerId: { type: String },
  subscriptionId: { type: String }, // ID de la suscripción activa en Stripe
  role: { type: String, default: "user" },
  subscriptionStatus: { type: String }, // active, cancelled, expired
  lastPaymentDate: { type: Date },
  planInterval: { type: String, enum: ["month", "year"] },
  promoEndsAt: { type: Date }, // Fecha fin de precio promocional
  password: { type: String },

  // Nivel del plan actual (mapeado a las claves del JSON: 'guest', 'freemium', 'premium')
  planLevel: {
    type: String,
    enum: ["guest", "freemium", "premium"],
    default: "freemium", // Asumimos freemium si se registra
  },

  // Ubicación y Preferencias
  location: { type: String },
  preferences: {
    neutralMode: { type: Boolean, default: false },
    notificationsEnabled: { type: Boolean, default: true },
    grammaticalGender: {
      type: String,
      enum: ["male", "female", "neutral"],
      default: "neutral",
    },
  },

  // Control de uso
  usage: {
    lastReset: { type: Date, default: Date.now },
    generationsCount: { type: Number, default: 0 },
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
});

// Método para verificar y resetear el límite diario si ha pasado un día
UserSchema.methods.checkDailyReset = function () {
  const now = new Date();
  const last = new Date(this.usage.lastReset);

  // Normalizar fechas a medianoche para comparar días
  const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDate = new Date(
    last.getFullYear(),
    last.getMonth(),
    last.getDate(),
  );

  if (nowDate > lastDate) {
    this.usage.generationsCount = 0;
    this.usage.lastReset = now;
    return true; // Se reseteó
  }
  return false;
};

// Verifica si el usuario tiene permiso para generar basado en su plan
UserSchema.methods.canGenerate = function () {
  this.checkDailyReset();
  const plan = PLAN_CONFIG.subscription_plans[this.planLevel];
  if (!plan) return false;

  return this.usage.generationsCount < plan.access.daily_limit;
};

// Incrementa el contador de uso
UserSchema.methods.incrementUsage = async function () {
  this.usage.generationsCount += 1;
  return this.save();
};

module.exports = mongoose.model("User", UserSchema);
