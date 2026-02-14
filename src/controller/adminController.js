const fs = require("fs");
const path = require("path");
const readline = require("readline");
const User = require("../models/User"); // Tu modelo de usuario
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

exports.getStreamLogs = async (req, res) => {
  try {
    const date = new Date().toISOString().split("T")[0];
    // VERIFICA: ¿Tu archivo empieza con 'application' o con 'transacciones'?
    const logPath = path.join(
      __dirname,
      `../../logs/transacciones-${date}.log`,
    );

    if (!fs.existsSync(logPath)) return res.json([]);

    const fileStream = fs.createReadStream(logPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let logs = [];
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line);
        // Solo enviamos lo que tiene 'peticion' o 'respuesta' (lo que te sirve)
        if (
          parsed.peticion ||
          parsed.respuesta ||
          parsed.message?.includes("Transacción")
        ) {
          logs.push(parsed);
        }
      } catch (e) {
        // Ignora líneas que no son JSON (basura vieja) para que no bloqueen la web
        continue;
      }
    }
    res.json(logs.reverse().slice(0, 100));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
exports.loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Credenciales inválidas" }); // Si falta el return/res, se queda colgado
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    if (user.role !== "admin") {
      return res.status(403).json({ message: "No eres admin" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
    );

    // Si el código llega aquí y no hay un res.json, el botón se queda "Entrando..."
    return res.json({ token });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Error interno" });
  }
};
