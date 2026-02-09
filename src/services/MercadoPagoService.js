const { MercadoPagoConfig, Preference, Payment } = require("mercadopago");

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

module.exports = {
  createPreference,
  getPayment,
};
