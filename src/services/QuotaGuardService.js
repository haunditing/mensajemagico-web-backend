const User = require("../models/User");
const SystemUsage = require("../models/SystemUsage");
const QuotaAlert = require("../models/QuotaAlert");
const EmailService = require("./EmailService");
const logger = require("../utils/logger");

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getToday = () => new Date().toISOString().split("T")[0];

const getSettings = () => ({
  enabled: (process.env.SIGNUP_QUOTA_GUARD_ENABLED || "true") === "true",
  warningRatio: toNumber(process.env.SIGNUP_WARNING_RATIO, 0.8),
  blockRatio: toNumber(process.env.SIGNUP_BLOCK_RATIO, 1),
  maxDailyAiRequests: toNumber(process.env.SIGNUP_MAX_DAILY_AI_REQUESTS, 1200),
  maxDailyActiveUsers: toNumber(process.env.SIGNUP_MAX_DAILY_ACTIVE_USERS, 300),
  blockNewUsers: (process.env.SIGNUP_BLOCK_NEW_USERS || "false") === "true",
});

const buildMetrics = async () => {
  const today = getToday();
  const startOfDay = new Date(`${today}T00:00:00.000Z`);

  const [usageByModel, activeUsers] = await Promise.all([
    SystemUsage.aggregate([
      { $match: { date: today } },
      { $group: { _id: null, total: { $sum: "$count" } } },
    ]),
    User.countDocuments({
      "usage.lastReset": { $gte: startOfDay },
      "usage.generationsCount": { $gt: 0 },
    }),
  ]);

  const aiRequestsToday = usageByModel[0]?.total || 0;

  return {
    today,
    aiRequestsToday,
    activeUsersToday: activeUsers,
  };
};

const maybeSendAlert = async (level, metrics, settings) => {
  try {
    const existing = await QuotaAlert.findOne({ date: metrics.today, level });
    if (existing) return;

    await QuotaAlert.create({
      date: metrics.today,
      level,
      payload: {
        aiRequestsToday: metrics.aiRequestsToday,
        activeUsersToday: metrics.activeUsersToday,
      },
    });

    const adminEmail = process.env.ADMIN_ALERT_EMAIL || process.env.EMAIL_USER;
    if (!adminEmail) return;

    await EmailService.sendQuotaAlertEmail(adminEmail, {
      level,
      aiRequestsToday: metrics.aiRequestsToday,
      activeUsersToday: metrics.activeUsersToday,
      maxDailyAiRequests: settings.maxDailyAiRequests,
      maxDailyActiveUsers: settings.maxDailyActiveUsers,
      warningRatio: settings.warningRatio,
      blockRatio: settings.blockRatio,
      date: metrics.today,
    });
  } catch (error) {
    logger.error("Error enviando alerta de cuota", {
      message: error.message,
      stack: error.stack,
    });
  }
};

const evaluateSignupAvailability = async () => {
  const settings = getSettings();

  if (!settings.enabled) {
    return {
      allowSignup: true,
      status: "guard-disabled",
      metrics: null,
      settings,
    };
  }

  let metrics;
  try {
    metrics = await buildMetrics();
  } catch (error) {
    logger.error("QuotaGuard: fallo leyendo métricas, fail-open", {
      message: error.message,
    });
    return {
      allowSignup: true,
      status: "metrics-error-fail-open",
      metrics: null,
      settings,
    };
  }

  const requestsRatio = settings.maxDailyAiRequests > 0
    ? metrics.aiRequestsToday / settings.maxDailyAiRequests
    : 0;
  const activeUsersRatio = settings.maxDailyActiveUsers > 0
    ? metrics.activeUsersToday / settings.maxDailyActiveUsers
    : 0;
  const pressureRatio = Math.max(requestsRatio, activeUsersRatio);

  if (pressureRatio >= settings.warningRatio) {
    const level = pressureRatio >= settings.blockRatio ? "critical" : "warning";
    void maybeSendAlert(level, metrics, settings);
  }

  if (settings.blockNewUsers && pressureRatio >= settings.blockRatio) {
    return {
      allowSignup: false,
      status: "blocked",
      reason: "capacity-limit",
      metrics: {
        ...metrics,
        pressureRatio,
      },
      settings,
    };
  }

  return {
    allowSignup: true,
    status: pressureRatio >= settings.warningRatio ? "warning" : "ok",
    metrics: {
      ...metrics,
      pressureRatio,
    },
    settings,
  };
};

module.exports = {
  evaluateSignupAvailability,
};
