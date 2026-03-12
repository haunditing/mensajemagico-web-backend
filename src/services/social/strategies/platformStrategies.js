// Estrategias de plataformas soportadas
const InstagramStrategy = require("./InstagramStrategy");
const FacebookStrategy = require("./FacebookStrategy");
const LinkedInStrategy = require("./LinkedInStrategy");
const TwitterStrategy = require("./TwitterStrategy");
const WhatsAppStrategy = require("./WhatsAppStrategy");
const TelegramStrategy = require("./TelegramStrategy");

function getPlatformStrategy(platform) {
  switch ((platform || "").toLowerCase()) {
    case "instagram":
      return InstagramStrategy;
    case "facebook":
      return FacebookStrategy;
    case "linkedin":
      return LinkedInStrategy;
    case "twitter":
      return TwitterStrategy;
    case "whatsapp":
      return WhatsAppStrategy;
    case "telegram":
      return TelegramStrategy;
    default:
      return null;
  }
}

module.exports = { getPlatformStrategy };
