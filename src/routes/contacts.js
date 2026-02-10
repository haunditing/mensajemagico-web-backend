const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");
const authenticate = require("../middleware/auth");

// GET /api/contacts - Listar contactos
router.get("/", authenticate, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.userId }).sort({
      lastInteraction: -1,
    });
    res.json(contacts);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener contactos" });
  }
});

// GET /api/contacts/:id - Detalle de contacto
router.get("/:id", authenticate, async (req, res) => {
  try {
    const contact = await Contact.findOne({
      _id: req.params.id,
      userId: req.userId,
    });
    if (!contact)
      return res.status(404).json({ error: "Contacto no encontrado" });
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener contacto" });
  }
});

// POST /api/contacts - Crear contacto (Manual)
router.post("/", authenticate, async (req, res) => {
  try {
    const { name, relationship } = req.body;
    const contact = new Contact({
      userId: req.userId,
      name,
      relationship,
      relationalHealth: 5, // Valor inicial neutro
    });
    await contact.save();
    res.status(201).json(contact);
  } catch (error) {
    res.status(500).json({ error: "Error al crear contacto" });
  }
});

module.exports = router;
