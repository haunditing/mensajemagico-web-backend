const crypto = require('crypto');

/**
 * Genera la firma de integridad para el Widget de Checkout.
 * Fórmula: SHA256(referencia + monto_en_centavos + moneda + secreto_integridad)
 */
const generateCheckoutSignature = (reference, amountInCents, currency) => {
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
  if (!integritySecret) throw new Error("WOMPI_INTEGRITY_SECRET no configurado");

  const chain = `${reference}${amountInCents}${currency}${integritySecret}`;
  const hash = crypto.createHash('sha256').update(chain).digest('hex');
  return hash;
};

/**
 * Valida la firma (checksum) de un evento Webhook de Wompi.
 * Fórmula: SHA256(transaction.id + transaction.status + transaction.amount_in_cents + timestamp + secreto_eventos)
 * Nota: Wompi usa el 'Events Secret' para webhooks, que puede ser distinto al de integridad.
 */
const verifyWebhookSignature = (eventData) => {
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET || process.env.WOMPI_INTEGRITY_SECRET;
  if (!eventsSecret) throw new Error("WOMPI_EVENTS_SECRET no configurado");

  const { data, signature, timestamp } = eventData;
  const { transaction } = data;
  
  // Extraer checksum recibido
  const receivedChecksum = signature.checksum;

  // Calcular checksum localmente
  // Cadena: id_transaccion + estado + monto_centavos + timestamp + secreto
  const chain = `${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${eventsSecret}`;
  const calculatedChecksum = crypto.createHash('sha256').update(chain).digest('hex');

  return receivedChecksum === calculatedChecksum;
};

const getPublicKey = () => {
  return process.env.WOMPI_PUBLIC_KEY;
};

module.exports = {
  generateCheckoutSignature,
  verifyWebhookSignature,
  getPublicKey
};