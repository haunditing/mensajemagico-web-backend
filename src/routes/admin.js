const express = require("express");
const router = express.Router();
const adminController = require("../controller/adminController");
const { verifyToken } = require("../middleware/auth");

// Middleware específico para verificar rol admin
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    return next();
  }
  return res.status(403).json({ message: "Requiere rol de Administrador" });
};

// Ruta de Login (Pública)
router.post("/login", adminController.loginAdmin);

// Esta será la URL: midominio.com/api/admin/logs
router.get("/logs", verifyToken, isAdmin, adminController.getStreamLogs);
module.exports = router;
