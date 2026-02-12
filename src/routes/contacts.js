const express = require("express");
const router = express.Router();
const Contact = require("../models/Contact");
const { authenticate } = require("../middleware/auth");

// GET /api/contacts - Listar contactos
router.get("/", authenticate, async (req, res) => {
  try {
    const contacts = await Contact.find({ userId: req.userId }).sort({
      relationalHealth: 1,
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

    if (!name || name.trim() === "") {
      return res.status(400).json({ error: "El nombre es obligatorio." });
    }

    // 1. Validar que no exista un contacto con el mismo nombre para este usuario
    const existing = await Contact.findOne({ userId: req.userId, name });
    if (existing) {
      return res
        .status(400)
        .json({ error: "Ya tienes un contacto con ese nombre." });
    }

    const contact = new Contact({
      userId: req.userId,
      name,
      relationship,
      relationalHealth: 5, // Valor inicial neutro
      lastInteraction: new Date(),
    });
    await contact.save();
    res.status(201).json(contact);
  } catch (error) {
    res.status(500).json({ error: "Error al crear contacto" });
  }
});

// PUT /api/contacts/:id - Actualizar contacto
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { name, relationship, grammaticalGender } = req.body;
    const contact = await Contact.findOne({ _id: req.params.id, userId: req.userId });

    if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });

    if (name) contact.name = name;
    if (relationship !== undefined) contact.relationship = relationship;
    if (grammaticalGender !== undefined) contact.grammaticalGender = grammaticalGender;

    await contact.save();
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar contacto" });
  }
});

// DELETE /api/contacts/:id - Eliminar contacto
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const contact = await Contact.findOneAndDelete({ _id: req.params.id, userId: req.userId });
    if (!contact) return res.status(404).json({ error: "Contacto no encontrado" });
    res.json({ message: "Contacto eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar contacto" });
  }
});

module.exports = router;
