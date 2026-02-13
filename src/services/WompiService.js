const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Genera la firma de integridad para el Widget de Checkout.
 * Fórmula: SHA256(referencia + monto_en_centavos + moneda + secreto_integridad)
 * Nota: Aunque el widget acepte 'expiration-time', este NO se incluye en la firma.
 */
const generateCheckoutSignature = (reference, amountInCents, currency) => {
  // Aseguramos que el secreto no tenga espacios extra (causa común de error 403)
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  if (!integritySecret)
    throw new Error("WOMPI_INTEGRITY_SECRET no configurado");

  const chain = `${reference}${amountInCents}${currency}${integritySecret}`;
  
  // Log de depuración para verificar qué se está firmando (útil para error 403)
  logger.info(`Generando firma Wompi para: ${reference} | ${amountInCents} | ${currency}`);
  
  const hash = crypto.createHash("sha256").update(chain).digest("hex");
  return hash;
};

/**
 * Valida la firma (checksum) de un evento Webhook de Wompi.
 * Usa las propiedades indicadas en el evento para reconstruir la cadena.
 */
const verifyWebhookSignature = (eventData) => {
  const eventsSecret =
    (process.env.WOMPI_EVENTS_SECRET || process.env.WOMPI_INTEGRITY_SECRET)?.trim();
  if (!eventsSecret) throw new Error("WOMPI_EVENTS_SECRET no configurado");

  const { data, signature, timestamp } = eventData;
  const { checksum, properties } = signature;

  let chain = "";

  // Wompi indica qué propiedades usar para el checksum en el array 'properties'
  // Ejemplo: ["transaction.id", "transaction.status", "transaction.amount_in_cents"]
  if (Array.isArray(properties)) {
    properties.forEach((prop) => {
      // Optimización: Navegación segura y concisa por el objeto
      const value = prop
        .split(".")
        .reduce(
          (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
          data,
        );
      chain += value;
    });
  } else {
    // Fallback por si no viene properties (aunque Wompi siempre lo envía)
    const { transaction } = data;
    chain = `${transaction.id}${transaction.status}${transaction.amount_in_cents}`;
  }

  chain += timestamp;
  chain += eventsSecret;

  const calculatedChecksum = crypto
    .createHash("sha256")
    .update(chain)
    .digest("hex");

  return checksum === calculatedChecksum;
};

const getPublicKey = () => {
  return process.env.WOMPI_PUBLIC_KEY;
};

module.exports = {
  generateCheckoutSignature,
  verifyWebhookSignature,
  getPublicKey,
};
