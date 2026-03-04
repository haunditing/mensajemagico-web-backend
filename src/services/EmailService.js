const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

// Configuración del transportador
const transporterConfig = process.env.EMAIL_HOST
  ? {
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === "true", // true para 465, false para otros
      requireTLS: process.env.EMAIL_REQUIRE_TLS === "true", // Fuerza el uso de TLS
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
      requireTLS: true, // Fuerza el uso de TLS
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
      port: transporterConfig.port,
    });
    // No lanzamos error para no romper el flujo del controlador, pero queda registrado
  }
};

const sendSubscriptionExpirationWarning = async (to, daysLeft, renewalDate, planLevel = "premium") => {
  // Manejo de múltiples URLs en CLIENT_URL para obtener la base correcta
  const baseUrl = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",")[0]
    : "https://www.mensajemagico.com";

  const planName = planLevel === "premium_lite" ? "Premium Lite" : "Premium Pro";

  const mailOptions = {
    from: `"Soporte MensajeMágico" <${process.env.EMAIL_USER}>`,
    to,
    subject: `Tu suscripción ${planName} está por vencer - MensajeMágico`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #F59E0B; text-align: center;">⏰ Tu magia está por expirar</h2>
        <p>Hola,</p>
        <p>Te recordamos que tu suscripción <strong>${planName}</strong> de MensajeMágico finalizará en <strong>${daysLeft} día${daysLeft > 1 ? 's' : ''}</strong> (el ${renewalDate}).</p>
        <p>Para no perder acceso a tus tonos exclusivos, historial y funciones avanzadas, por favor renueva tu plan.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/pricing" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">🔄 Renovar Ahora</a>
        </div>
        <p style="font-size: 12px; color: #666; margin-top: 30px; text-align: center;">
          Este es un recordatorio automático. No responder a este correo.
        </p>
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

// Email de bienvenida con trial de 7 días
const sendTrialWelcomeEmail = async (to, userName, trialEndDate) => {
  const baseUrl = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",")[0]
    : "https://www.mensajemagico.com";

  const endDateFormatted = new Date(trialEndDate).toLocaleDateString('es-ES', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const mailOptions = {
    from: `"MensajeMágico 🎁" <${process.env.EMAIL_USER}>`,
    to,
    subject: "¡Bienvenido a MensajeMágico! 🎉 7 días de Premium Lite GRATIS",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
        <div style="text-align: center; padding: 20px 0;">
          <h1 style="margin: 0; font-size: 32px;">🎉 ¡Bienvenido ${userName}!</h1>
        </div>
        
        <div style="background: white; color: #333; padding: 30px; border-radius: 8px; margin: 20px 0;">
          <h2 style="color: #667eea; margin-top: 0;">¡Tu prueba gratis de 7 días ya comenzó!</h2>
          
          <p>Estamos emocionados de tenerte con nosotros. Como regalo de bienvenida, activamos automáticamente tu <strong>prueba gratis de 7 días de Premium Lite</strong>.</p>
          
          <div style="background: #f8f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
            <h3 style="margin-top: 0; color: #667eea;">✨ Qué puedes hacer durante tu trial:</h3>
            <ul style="line-height: 1.8;">
              <li><strong>20 mensajes por día</strong> 🚀</li>
              <li>Todos los tonos y estilos disponibles 🎨</li>
              <li>Mensajes ilimitados guardados ❤️</li>
              <li>Acceso completo sin restricciones 🎁</li>
            </ul>
          </div>

          <p>Tu periodo de prueba termina el <strong>${endDateFormatted}</strong>. No te preocupes, te recordaremos antes de que expire.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${baseUrl}" style="background-color: #667eea; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
              🎨 Crear Mi Primer Mensaje
            </a>
          </div>

          <p style="color: #666; font-size: 14px; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
            <strong>💡 Tip:</strong> Completa tu perfil de esencia para mensajes aún más personalizados.
          </p>
        </div>

        <p style="font-size: 12px; text-align: center; color: rgba(255,255,255,0.8); margin-top: 20px;">
          ¿Preguntas? Responde a este email, estamos aquí para ayudarte.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email de bienvenida de trial enviado a ${to}`);
  } catch (error) {
    logger.error("Error enviando email de bienvenida de trial", { error });
    throw error; // Lanzamos el error para que el caller pueda manejarlo
  }
};

// Email recordatorio de trial (2 días antes de expirar)
const sendTrialExpiringEmail = async (to, userName, daysLeft, trialEndDate) => {
  const baseUrl = process.env.CLIENT_URL
    ? process.env.CLIENT_URL.split(",")[0]
    : "https://www.mensajemagico.com";

  const endDateFormatted = new Date(trialEndDate).toLocaleDateString('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long'
  });

  const mailOptions = {
    from: `"MensajeMágico ⏰" <${process.env.EMAIL_USER}>`,
    to,
    subject: `⏰ Tu prueba gratis termina en ${daysLeft} día${daysLeft > 1 ? 's' : ''}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #F59E0B; text-align: center;">⏰ Tu prueba gratis está por terminar</h2>
        
        <p>Hola ${userName},</p>
        
        <p>Tu prueba gratis de <strong>7 días de Premium Lite</strong> termina en <strong style="color: #F59E0B; font-size: 20px;">${daysLeft} día${daysLeft > 1 ? 's' : ''}</strong> (el ${endDateFormatted}).</p>
        
        <div style="background: #FEF3C7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #F59E0B;">
          <p style="margin: 0; font-weight: bold; color: #92400E;">🎯 ¿Te gustó la experiencia Premium?</p>
          <p style="margin: 10px 0 0 0; color: #92400E;">Continúa disfrutando de mensajes ilimitados y todos los tonos desde solo <strong>$2.49 USD/mes</strong>.</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${baseUrl}/pricing" style="background-color: #4F46E5; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            💎 Ver Planes Premium
          </a>
        </div>

        <p style="color: #666; font-size: 13px;">Si no actualizas tu plan, volverás automáticamente al plan gratuito con 5 mensajes diarios.</p>

        <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center; border-top: 1px solid #eee; padding-top: 15px;">
          No deseas recibir más emails? Puedes ajustar tus preferencias en tu perfil.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email de recordatorio de trial enviado a ${to} (${daysLeft} días restantes)`);
  } catch (error) {
    logger.error("Error enviando email de recordatorio de trial", { error });
    // No lanzamos el error para que el cron job continúe
  }
};

module.exports = { 
  sendPasswordResetEmail, 
  sendSubscriptionExpirationWarning,
  sendTrialWelcomeEmail,
  sendTrialExpiringEmail
};
