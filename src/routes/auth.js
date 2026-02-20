const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const User = require("../models/User");
const Contact = require("../models/Contact");
const Favorite = require("../models/Favorite");
const Reminder = require("../models/Reminder");
const PlanService = require("../services/PlanService");
const logger = require("../utils/logger");
const rateLimiter = require("../middleware/rateLimiter");
const EmailService = require("../services/EmailService");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

// Configuración de Multer para subir imágenes
const uploadDir = path.join(__dirname, "../../uploads/profiles");

// Asegurar que el directorio exista
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Límite de 5MB
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|webp/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Solo se permiten imágenes (jpeg, jpg, png, webp)"));
  },
});

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
  message: "Demasiados intentos. Por favor, inténtalo de nuevo en 15 minutos.",
});

// Limitador específico para actualizaciones de perfil (Mitigación DoS en subida de archivos)
const uploadLimiter = rateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // Máximo 10 actualizaciones por hora por IP
  message: "Has excedido el límite de actualizaciones de perfil. Intenta más tarde.",
});

// 1. Registro (Signup)
router.post("/signup", authLimiter, async (req, res) => {
  try {
    const { email, password, name } = req.body;

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
      name,
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
      name: newUser.name,
    });
  } catch (error) {
    logger.error("Error en signup", {
      message: error.message,
      stack: error.stack,
    });
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
      name: user.name,
    });
  } catch (error) {
    logger.error("Error en login", {
      message: error.message,
      stack: error.stack,
    });
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
      planMetadata.access.daily_limit - user.usage.generationsCount,
    );

    res.json({
      user,
      remainingCredits,
      plan: planMetadata,
    });
  } catch (error) {
    logger.error("Error en /me", {
      message: error.message,
      stack: error.stack,
    });
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
      return res.json({
        message:
          "Si el correo existe, se ha enviado un enlace de recuperación.",
      });
    }

    // Generar token aleatorio
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Guardar token y expiración (1 hora)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
    await user.save();

    // URL de recuperación (Ajusta la URL base según tu entorno)
    // Preferimos usar una variable de entorno para la URL del cliente si existe
    let clientUrl = process.env.CLIENT_URL;
    if (clientUrl && clientUrl.includes(",")) {
      clientUrl = clientUrl.split(",")[0].trim();
    }
    clientUrl = clientUrl || req.headers.origin;
    const resetUrl = `${clientUrl}/reset-password/${resetToken}`;

    // Enviar email real
    await EmailService.sendPasswordResetEmail(email, resetUrl);

    res.json({
      message: "Si el correo existe, se ha enviado un enlace de recuperación.",
    });
  } catch (error) {
    logger.error("Error en forgot-password", {
      message: error.message,
      stack: error.stack,
    });
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
      resetPasswordExpires: { $gt: Date.now() }, // Verificar que no haya expirado
    });

    if (!user) {
      return res
        .status(400)
        .json({ error: "El enlace es inválido o ha expirado" });
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
    logger.error("Error en reset-password", {
      message: error.message,
      stack: error.stack,
    });
    res.status(500).json({ error: "Error al restablecer la contraseña" });
  }
});

// 6. Actualizar Perfil (Ubicación manual)
router.put("/profile", authenticate, uploadLimiter, upload.single("profilePicture"), async (req, res) => {
  try {
    // Nota: Con multer, req.body tendrá los campos de texto y req.file el archivo
    const { name, location, neutralMode, notificationsEnabled, grammaticalGender } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    // Si se subió una imagen, actualizamos el campo en la BD
    if (req.file) {
      // Validación de seguridad: Verificar Magic Numbers (Firma del archivo)
      const header = req.file.buffer.subarray(0, 12).toString("hex").toUpperCase();
      const isJpeg = header.startsWith("FFD8FF");
      const isPng = header.startsWith("89504E470D0A1A0A");
      const isWebp = header.startsWith("52494646") && header.slice(16, 24) === "57454250"; // RIFF...WEBP

      if (!isJpeg && !isPng && !isWebp) {
        return res.status(400).json({ error: "El archivo no es una imagen válida o está corrupto." });
      }

      // Procesar imagen con Sharp (Resize 500x500 + WebP)
      const filename = `${req.userId}-${Date.now()}.webp`;
      const filePath = path.join(uploadDir, filename);

      await sharp(req.file.buffer)
        .resize(500, 500, { fit: "cover" }) // Recorta para llenar el cuadrado sin deformar
        .webp({ quality: 80 }) // Convierte a WebP con 80% de calidad
        .toFile(filePath);

      // Borrar imagen anterior si existe y es local
      if (user.profilePicture && user.profilePicture.startsWith("/uploads")) {
        const oldPath = path.join(__dirname, "../../", user.profilePicture);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch (err) {
            logger.warn(`No se pudo eliminar la imagen anterior: ${oldPath}`);
          }
        }
      }
      // Guardamos la ruta relativa para servirla estáticamente luego
      user.profilePicture = `/uploads/profiles/${filename}`;
    }

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length === 0) {
        return res.status(400).json({ error: "El nombre no puede estar vacío." });
      }
      user.name = name.trim();
    }

    // Permitir borrar la ubicación enviando string vacío o null
    if (location !== undefined) {
      if (location) {
        if (typeof location !== "string" || location.length > 50) {
          return res.status(400).json({
            error: "La ubicación debe ser texto y no exceder los 50 caracteres.",
          });
        }
        // Validación de caracteres permitidos (Letras, espacios, comas, puntos, guiones)
        const validLocationRegex = /^[a-zA-Z0-9\s,.\-áéíóúÁÉÍÓÚñÑüÜ]+$/;
        if (!validLocationRegex.test(location)) {
          return res.status(400).json({ error: "La ubicación contiene caracteres no válidos." });
        }
      }
      user.location = location;
    }

    // Actualizar preferencia de Modo Neutro
    if (neutralMode !== undefined) {
      if (!user.preferences) user.preferences = {};
      user.preferences.neutralMode = neutralMode;
    }

    // Actualizar preferencia de Notificaciones
    if (notificationsEnabled !== undefined) {
      if (!user.preferences) user.preferences = {};
      user.preferences.notificationsEnabled = notificationsEnabled;
    }

    // Actualizar preferencia de Género Gramatical
    if (grammaticalGender && ["male", "female", "neutral"].includes(grammaticalGender)) {
      if (!user.preferences) user.preferences = {};
      user.preferences.grammaticalGender = grammaticalGender;
    }

    await user.save();
    res.json({ message: "Perfil actualizado", user });
  } catch (error) {
    logger.error("Error actualizando perfil", { error });
    res.status(500).json({ error: "Error al actualizar perfil" });
  }
});

// 7. Cambiar contraseña (autenticado)
router.put("/change-password", authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.userId);

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Verificar contraseña actual
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "La contraseña actual es incorrecta" });
    }

    // Hashear nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Contraseña actualizada exitosamente" });
  } catch (error) {
    logger.error("Error cambiando contraseña", { error });
    res.status(500).json({ error: "Error al cambiar la contraseña" });
  }
});

// 8. Eliminar cuenta permanentemente
router.delete("/delete-account", authenticate, async (req, res) => {
  try {
    const userId = req.userId;

    // 1. Eliminar datos asociados para mantener la DB limpia
    await Promise.all([
      Contact.deleteMany({ userId }),
      Favorite.deleteMany({ userId }),
      Reminder.deleteMany({ userId }),
    ]);

    // 2. Eliminar el usuario
    await User.findByIdAndDelete(userId);

    res.json({ message: "Cuenta eliminada permanentemente" });
  } catch (error) {
    logger.error("Error eliminando cuenta", { error });
    res.status(500).json({ error: "Error al eliminar la cuenta" });
  }
});

// 9. Verificar disponibilidad de correo (Validación asíncrona)
router.post("/check-email", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email requerido" });

    const user = await User.findOne({ email });
    res.json({ exists: !!user });
  } catch (error) {
    logger.error("Error verificando email", { error });
    res.status(500).json({ error: "Error al verificar email" });
  }
});

module.exports = router;
