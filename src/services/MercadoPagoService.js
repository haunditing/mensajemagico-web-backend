const {
  MercadoPagoConfig,
  Preference,
  Payment,
  PreApproval,
} = require("mercadopago");

// 1. Inicializar cliente con Timeout configurado
// Aumentamos a 30 segundos (30000ms) para dar margen a las suscripciones
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
  options: {
    timeout: 30000, // Solución al error de Timeout
  },
});

const createPreference = async ({
  title,
  price,
  quantity = 1,
  payerEmail,
  externalReference,
  successUrl,
  failureUrl,
  currency_id,
  deviceId,
  idempotencyKey,
}) => {
  if (!title) throw new Error("El título es obligatorio para crear la preferencia.");
  if (!price || Number(price) <= 0) throw new Error("El precio es inválido.");
  if (!payerEmail) throw new Error("El email del pagador es obligatorio.");

  const preference = new Preference(client);

  const requestOptions = { idempotencyKey };
  if (deviceId) requestOptions.customHeaders = { 'X-meli-session-id': deviceId };

  return await preference.create({
    body: {
      items: [
        {
          title: title,
          quantity: quantity,
          unit_price: Number(price),
          currency_id: currency_id,
        },
      ],
      payer: {
        email: payerEmail,
      },
      external_reference: externalReference,
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: failureUrl,
      },
      auto_return: "approved",
    },
    requestOptions,
  });
};

const getPayment = async (id) => {
  const payment = new Payment(client);
  return await payment.get({ id });
};

const getPreApproval = async (id) => {
  const preApproval = new PreApproval(client);
  return await preApproval.get({ id });
};

const searchPayment = async (options) => {
  const payment = new Payment(client);
  return await payment.search({ options });
};

const cancelPreApproval = async (id) => {
  const preApproval = new PreApproval(client);
  return await preApproval.update({ id, body: { status: "cancelled" } });
};

const createSubscription = async ({
  title,
  price,
  payerEmail,
  externalReference,
  backUrl,
  frequency = 1,
  frequencyType = "months",
  currency_id,
  deviceId,
  idempotencyKey,
}) => {
  if (!title) throw new Error("El título (reason) es obligatorio para la suscripción.");
  if (!price || Number(price) <= 0) throw new Error("El precio es inválido.");
  if (!payerEmail) throw new Error("El email del pagador es obligatorio.");
  if (!backUrl) throw new Error("La URL de retorno (back_url) es obligatoria.");

  const preApproval = new PreApproval(client);

  const requestOptions = { idempotencyKey };
  if (deviceId) requestOptions.customHeaders = { 'X-meli-session-id': deviceId };

  // Las suscripciones (PreApproval) suelen tardar más en procesarse en los servidores de MP
  return await preApproval.create({
    body: {
      reason: title,
      auto_recurring: {
        frequency,
        frequency_type: frequencyType,
        transaction_amount: Number(price),
        currency_id,
      },
      back_url: backUrl,
      payer_email: payerEmail,
      external_reference: externalReference,
      status: "pending", // Corregido: Debe ir dentro del body y ser 'pending' para nuevos links
    },
    requestOptions,
  });
};

const updateSubscription = async (id, price) => {
  if (!id) throw new Error("ID de suscripción requerido");
  if (!price || Number(price) <= 0) throw new Error("Precio inválido");

  const preApproval = new PreApproval(client);
  return await preApproval.update({
    id,
    body: {
      auto_recurring: {
        transaction_amount: Number(price),
      },
    },
  });
};

module.exports = {
  createPreference,
  getPayment,
  getPreApproval,
  searchPayment,
  cancelPreApproval,
  createSubscription,
  updateSubscription,
};
