const express = require("express");
const router = express.Router();
const Favorite = require("../models/Favorite");
const { authenticate } = require("../middleware/auth");
const logger = require("../utils/logger");

// Obtener todos los favoritos del usuario
router.get("/", authenticate, async (req, res) => {
  try {
    const favorites = await Favorite.find({ userId: req.userId }).sort({
      timestamp: -1,
    });
    res.json(favorites);
  } catch (error) {
    logger.error("Error obteniendo favoritos", { error });
    res.status(500).json({ error: "Error al obtener favoritos" });
  }
});

// Guardar un favorito
router.post("/", authenticate, async (req, res) => {
  try {
    const { content, occasion, tone } = req.body;

    // Evitar duplicados exactos
    const existing = await Favorite.findOne({ userId: req.userId, content });
    if (existing) {
      return res
        .status(400)
        .json({ error: "Este mensaje ya está en tus favoritos" });
    }

    const favorite = new Favorite({
      userId: req.userId,
      content,
      occasion,
      tone,
    });
    await favorite.save();
    res.status(201).json(favorite);
  } catch (error) {
    logger.error("Error guardando favorito", { error });
    res.status(500).json({ error: "Error al guardar favorito" });
  }
});

// Eliminar un favorito
router.delete("/:id", authenticate, async (req, res) => {
  try {
    await Favorite.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    res.json({ message: "Favorito eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar favorito" });
  }
});

module.exports = router;
