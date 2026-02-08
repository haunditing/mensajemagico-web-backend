const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

// Configuración del transportador
const transporter = nodemailer.createTransport({
  service: "gmail", // Para SendGrid u otros, elimina esta línea y usa host/port
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // ¡Usa una App Password de Google!
  },
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
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Email de recuperación enviado a ${to}`);
  } catch (error) {
    logger.error("Error enviando email", { error });
    // No lanzamos error para no romper el flujo del controlador, pero queda registrado
  }
};

module.exports = { sendPasswordResetEmail };