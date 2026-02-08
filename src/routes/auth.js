const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const PlanService = require("../services/PlanService");
const logger = require("../utils/logger");
const rateLimiter = require("../middleware/rateLimiter");
const EmailService = require("../services/EmailService");

// Middleware de autenticación local (verifica el JWT)
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1]; // Bearer <token>
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

// Limitador de velocidad para autenticación (10 intentos cada 15 minutos)
const authLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Demasiados intentos. Por favor, inténtalo de nuevo en 15 minutos."
});

// 1. Registro (Signup)
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña requeridos" });
    }

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    // Hashear password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Crear usuario (Plan por defecto: freemium)
    const newUser = new User({
      email,
      password: hashedPassword, // Asegúrate de que esta línea esté presente
      planLevel: "freemium",
    });

    await newUser.save();

    // Generar token
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no definido en variables de entorno");
    }
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    logger.info(`Nuevo usuario registrado: ${email}`);

    res.status(201).json({
      message: "Usuario creado exitosamente",
      token,
      userId: newUser._id,
      planLevel: newUser.planLevel,
    });
  } catch (error) {
    logger.error("Error en signup", { message: error.message, stack: error.stack });
    res.status(500).json({ error: "Error al registrar usuario" });
  }
});

// 2. Login
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email y contraseña requeridos" });
    }

    // Buscar usuario
    const user = await User.findOne({ email });
    if (!user || !user.password) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    // Verificar password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Credenciales inválidas" });
    }

    // Generar token
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no definido en variables de entorno");
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login exitoso",
      token,
      userId: user._id,
      planLevel: user.planLevel,
    });
  } catch (error) {
    logger.error("Error en login", { message: error.message, stack: error.stack });
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

// 3. Perfil (Get Me)
router.get("/me", authenticate, async (req, res) => {
  try {
    // Buscar usuario excluyendo el password
    const user = await User.findById(req.userId).select("-password");
    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Verificar reset diario para tener el conteo actualizado
    user.checkDailyReset();
    await user.save();

    // Calcular créditos restantes
    const planMetadata = PlanService.getPlanMetadata(user.planLevel);
    const remainingCredits = Math.max(
      0,
      planMetadata.access.daily_limit - user.usage.generationsCount
    );

    res.json({
      user,
      remainingCredits,
      plan: planMetadata,
    });
  } catch (error) {
    logger.error("Error en /me", { message: error.message, stack: error.stack });
    res.status(500).json({ error: "Error al obtener perfil" });
  }
});

// 4. Solicitar recuperación de contraseña (Forgot Password)
router.post("/forgot-password", authLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Por seguridad, no revelamos si el usuario existe o no
      return res.json({ message: "Si el correo existe, se ha enviado un enlace de recuperación." });
    }

    // Generar token aleatorio
    const resetToken = crypto.randomBytes(20).toString('hex');
    
    // Guardar token y expiración (1 hora)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
    await user.save();

    // URL de recuperación (Ajusta la URL base según tu entorno)
    // Preferimos usar una variable de entorno para la URL del cliente si existe
    const clientUrl = process.env.CLIENT_URL || req.headers.origin
    
    // Enviar email real
    await EmailService.sendPasswordResetEmail(email, resetUrl);

    res.json({ message: "Si el correo existe, se ha enviado un enlace de recuperación." });
  } catch (error) {
    logger.error("Error en forgot-password", { message: error.message, stack: error.stack });
    res.status(500).json({ error: "Error al procesar la solicitud" });
  }
});

// 5. Restablecer contraseña (Reset Password)
router.post("/reset-password/:token", authLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() } // Verificar que no haya expirado
    });

    if (!user) {
      return res.status(400).json({ error: "El enlace es inválido o ha expirado" });
    }

    // Hashear nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Contraseña actualizada exitosamente" });
  } catch (error) {
    logger.error("Error en reset-password", { message: error.message, stack: error.stack });
    res.status(500).json({ error: "Error al restablecer la contraseña" });
  }
});

module.exports = router;
