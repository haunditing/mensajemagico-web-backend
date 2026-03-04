const mongoose = require("mongoose");
const PLAN_CONFIG = require("../config/plans");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  name: { type: String },
  profilePicture: { type: String, default: "" },
  subscriptionId: { type: String }, // ID de la suscripción activa
  role: { type: String, default: "user" },
  subscriptionStatus: { type: String }, // active, cancelled, expired
  lastPaymentDate: { type: Date },
  planInterval: { type: String, enum: ["month", "year"] },
  promoEndsAt: { type: Date }, // Fecha fin de precio promocional
  password: { type: String },

  // Nivel del plan actual (mapeado a las claves del JSON: 'guest', 'freemium', 'premium_lite', 'premium')
  planLevel: {
    type: String,
    enum: ["guest", "freemium", "premium_lite", "premium"],
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
    avatarColor: { type: String, default: "blue" },
  },

  // Perfil de Esencia
  essenceProfile: {
    expressiveness: {
      type: String,
      enum: ["low", "medium", "high"],
    },
    intensity: {
      type: String,
      enum: ["soft", "balanced", "intense"],
    },
    pride: {
      type: String,
      enum: ["low", "medium", "high"],
    },
    style: {
      type: String,
      enum: ["direct", "indirect", "romantic", "firm"],
    },
  },
  essenceCompleted: { type: Boolean, default: false },

  // Control de uso
  usage: {
    lastReset: { type: Date, default: Date.now },
    generationsCount: { type: Number, default: 0 },
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  _pendingPlan: { type: String, default: null }, // Temporal: plan que se está pagando (para webhooks)

  // Sistema de Free Trial
  trialStartDate: { type: Date },
  trialEndDate: { type: Date },
  hasUsedTrial: { type: Boolean, default: false },
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

// Calcula la fecha de expiración del plan (para pagos únicos como Wompi)
UserSchema.methods.getExpirationDate = function () {
  if (!this.lastPaymentDate || !this.subscriptionId) return null;

  // Solo aplica para pagos únicos (Wompi)
  if (!this.subscriptionId.startsWith("wompi_")) return null;

  const expiration = new Date(this.lastPaymentDate);
  
  if (this.planInterval === "year") {
    expiration.setFullYear(expiration.getFullYear() + 1);
  } else {
    expiration.setMonth(expiration.getMonth() + 1);
    // Ajuste para meses con menos días
    if (expiration.getDate() !== this.lastPaymentDate.getDate()) {
      expiration.setDate(0);
    }
  }
  
  return expiration;
};

// Verifica si el plan está por vencer (retorna días restantes o null)
UserSchema.methods.getDaysUntilExpiration = function () {
  const expirationDate = this.getExpirationDate();
  if (!expirationDate) return null;

  const now = new Date();
  const diffTime = expirationDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
};

// Verifica si necesita renovación (7 días antes de vencer)
UserSchema.methods.needsRenewal = function () {
  const daysLeft = this.getDaysUntilExpiration();
  if (daysLeft === null) return false;
  
  return daysLeft <= 7 && daysLeft >= 0;
};

// === MÉTODOS DE FREE TRIAL ===

// Verifica si el usuario está actualmente en periodo de trial
UserSchema.methods.isInTrial = function () {
  if (!this.trialStartDate || !this.trialEndDate) return false;
  
  const now = new Date();
  return now >= this.trialStartDate && now <= this.trialEndDate;
};

// Retorna días restantes del trial (null si no está en trial)
UserSchema.methods.getTrialDaysRemaining = function () {
  if (!this.isInTrial()) return null;
  
  const now = new Date();
  const diffTime = this.trialEndDate - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
};

// Activa el trial de 7 días para un nuevo usuario
UserSchema.methods.activateTrial = function () {
  if (this.hasUsedTrial) return false; // No puede usar trial dos veces
  
  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + 7);
  
  this.trialStartDate = now;
  this.trialEndDate = endDate;
  this.hasUsedTrial = true;
  this.planLevel = "premium_lite"; // Durante trial tiene acceso a premium_lite
  
  return true;
};

// Obtiene el plan efectivo del usuario (considerando trial)
UserSchema.methods.getEffectivePlan = function () {
  if (this.isInTrial()) {
    return "premium_lite"; // Durante trial tiene acceso premium_lite
  }
  return this.planLevel;
};

module.exports = mongoose.model("User", UserSchema);
