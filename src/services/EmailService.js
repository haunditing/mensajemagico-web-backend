const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

// Configuración del transportador
const transporterConfig = process.env.EMAIL_HOST
  ? {
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === "true", // true para 465, false para otros
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // Timeouts para evitar que la petición se quede colgada indefinidamente
      connectionTimeout: 20000, // Aumentado a 20s
      greetingTimeout: 20000,
      socketTimeout: 20000,
      // FIX: Forzar IPv4 para evitar problemas de resolución DNS en producción (ETIMEDOUT)
      family: 4,
    }
  : {
      // Reemplazamos service: 'gmail' (que usa puerto 465 por defecto) por configuración explícita puerto 587
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      // Timeouts y forzado de IPv4 también para el servicio por defecto
      connectionTimeout: 20000,
      greetingTimeout: 20000,
      socketTimeout: 20000,
      family: 4,
    };

const transporter = nodemailer.createTransport(transporterConfig);

// Verificar conexión al iniciar (Ayuda a depurar en logs de despliegue)
transporter.verify((error) => {
  if (error) {
    logger.error("Error de conexión SMTP al iniciar:", {
      message: error.message,
      code: error.code,
      host: transporterConfig.host || "service:gmail",
      port: transporterConfig.port,
    });
  } else {
    logger.info("Servidor SMTP listo para enviar correos.");
  }
});

const sendPasswordResetEmail = async (to, resetUrl) => {
  const mailOptions = {
    from: `"Soporte MensajeMágico" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Restablece tu contraseña - MensajeMágico",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #4F46E5; text-align: center;">Recuperación de Contraseña</h2>
        <p>Hola,</p>
        <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en MensajeMágico.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Restablecer Contraseña</a>
        </div>
        <p style="color: #666; font-size: 14px;">Este enlace expirará en 1 hora por seguridad.</p>
        <p style="color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">Si no solicitaste este cambio, puedes ignorar este correo tranquilamente.</p>
        <p style="font-size: 12px; color: #666; margin-top: 15px; word-break: break-all;">Si el botón no funciona, copia y pega este enlace:<br/>${resetUrl}</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email de recuperación enviado a ${to}`);
  } catch (error) {
    logger.error("Error enviando email", { 
      error,
      host: transporterConfig.host,
      port: transporterConfig.port 
    });
    // No lanzamos error para no romper el flujo del controlador, pero queda registrado
  }
};

const sendSubscriptionExpirationWarning = async (to, daysLeft, renewalDate) => {
  // Manejo de múltiples URLs en CLIENT_URL para obtener la base correcta
  const baseUrl = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',')[0] : "https://www.mensajemagico.com";

  const mailOptions = {
    from: `"Soporte MensajeMágico" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Tu suscripción Premium está por vencer - MensajeMágico",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #F59E0B; text-align: center;">Tu magia está por expirar</h2>
        <p>Hola,</p>
        <p>Te recordamos que tu suscripción Premium de MensajeMágico finalizará en <strong>${daysLeft} días</strong> (el ${renewalDate}).</p>
        <p>Para no perder acceso a tus tonos exclusivos, historial y funciones avanzadas, por favor renueva tu plan.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/pricing" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">Renovar Ahora</a>
        </div>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email de advertencia de expiración enviado a ${to}`);
  } catch (error) {
    logger.error("Error enviando email de advertencia", { error });
    // Importante: No lanzamos el error para que el cron job continúe con los siguientes usuarios
  }
};

module.exports = { sendPasswordResetEmail, sendSubscriptionExpirationWarning };