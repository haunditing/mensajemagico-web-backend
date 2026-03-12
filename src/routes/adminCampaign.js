const express = require("express");
const router = express.Router();
const { authenticate, isAdmin } = require("../middleware/auth");
const { generateCampaign, suggestToneIntentionKeywords } = require("../services/social/PostGenerationService");

// POST /api/admin/social-campaigns/generate
router.post("/social-campaigns/generate", authenticate, isAdmin, async (req, res) => {
  const { platform, theme, tone, intention, contextWords } = req.body;
  if (!platform || !theme || !tone || !intention) {
    return res.status(400).json({ error: "Faltan campos obligatorios" });
  }
  try {
    const payload = {
      theme,
      tone,
      intention,
      contextWords: contextWords || [],
      userContext: {
        planLevel: "premium", // Forzamos premium para admin
        location: "admin",
        essenceProfile: null
      }
    };
    const structuredPost = await generateCampaign(platform, payload);
    res.json(structuredPost);
  } catch (error) {
    res.status(500).json({ error: error.message || "Error generando campaña" });
  }
});

// POST /api/admin/social-campaigns/suggest
router.post("/social-campaigns/suggest", authenticate, isAdmin, async (req, res) => {
  const { platform, theme } = req.body;
  if (!platform || !theme) {
    return res.status(400).json({ error: "Faltan plataforma o tema" });
  }
  try {
    const suggestion = await suggestToneIntentionKeywords({ platform, theme });
    res.json(suggestion);
  } catch (error) {
    res.status(500).json({ error: error.message || "Error generando sugerencias" });
  }
});

module.exports = router;
