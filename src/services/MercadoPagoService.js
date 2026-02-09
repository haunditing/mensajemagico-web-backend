const { MercadoPagoConfig, Preference, Payment, PreApproval } = require("mercadopago");

// Inicializar cliente con el Access Token
// Asegúrate de tener MP_ACCESS_TOKEN en tus variables de entorno
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
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
}) => {
  const preference = new Preference(client);

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
}) => {
  const preApproval = new PreApproval(client);

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
      status: "pending",
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
};
