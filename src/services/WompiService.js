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
 * Usa las propiedades indicadas en el evento para reconstruir la cadena.
 */
const verifyWebhookSignature = (eventData) => {
  const eventsSecret = process.env.WOMPI_EVENTS_SECRET || process.env.WOMPI_INTEGRITY_SECRET;
  if (!eventsSecret) throw new Error("WOMPI_EVENTS_SECRET no configurado");

  const { data, signature, timestamp } = eventData;
  const { checksum, properties } = signature;

  let chain = "";
  
  // Wompi indica qué propiedades usar para el checksum en el array 'properties'
  // Ejemplo: ["transaction.id", "transaction.status", "transaction.amount_in_cents"]
  if (Array.isArray(properties)) {
    properties.forEach(prop => {
      const keys = prop.split('.');
      let value = data;
      // Navegar el objeto data para encontrar el valor (ej. data.transaction.id)
      for (const key of keys) {
        if (value) value = value[key];
      }
      chain += value;
    });
  } else {
    // Fallback por si no viene properties (aunque Wompi siempre lo envía)
    const { transaction } = data;
    chain = `${transaction.id}${transaction.status}${transaction.amount_in_cents}`;
  }

  chain += timestamp;
  chain += eventsSecret;

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