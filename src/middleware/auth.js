const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ message: "No se proporcionó un token de acceso" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      console.error("❌ Error al verificar JWT:", err.message);
      return res.status(403).json({ message: "Token inválido o expirado" });
    }
    req.user = decoded;
    next();
  });
};

// NUEVA FUNCIÓN: Esto es lo que te faltaba
const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({
      message: "Acceso denegado: Se requieren permisos de administrador",
    });
  }
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id || decoded.userId;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};

// IMPORTANTE: isAdmin debe estar aquí dentro
module.exports = { authenticate, verifyToken, isAdmin };
