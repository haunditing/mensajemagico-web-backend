const { MercadoPagoConfig, Preference } = require('mercadopago');

// Inicializar cliente con el Access Token
// Asegúrate de tener MP_ACCESS_TOKEN en tus variables de entorno
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

const createPreference = async ({ title, price, quantity = 1, payerEmail, externalReference, successUrl, failureUrl }) => {
  const preference = new Preference(client);

  return await preference.create({
    body: {
      items: [
        {
          title: title,
          quantity: quantity,
          unit_price: Number(price),
          currency_id: 'COP', // Ajustar según la moneda deseada o pasar como parámetro
        }
      ],
      payer: {
        email: payerEmail
      },
      external_reference: externalReference,
      back_urls: {
        success: successUrl,
        failure: failureUrl,
        pending: failureUrl
      },
      auto_return: 'approved',
    }
  });
};

module.exports = {
  createPreference
};