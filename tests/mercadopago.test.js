const request = require("supertest");
const express = require("express");

// Importaciones con prefijo src/
const router = require("../src/routes/mercadopago");
const User = require("../src/models/User");
const MercadoPagoService = require("../src/services/MercadoPagoService");

// 1. MOCK DE CONFIGURACIÓN: Debe ser IDÉNTICO a la estructura de src/config/plans.js
jest.mock("../src/config/plans", () => ({
  subscription_plans: {
    premium: {
      access: {
        daily_limit: 9999,
      },
      pricing: {
        monthly: 4.99,
        yearly: 47.9,
      },
      pricing_hooks: {
        mercadopago_price_yearly: 100000,
        mercadopago_price_monthly: 10000,
        mercadopago_price_yearly_usd: 47.9,
        mercadopago_price_monthly_usd: 4.99,
      },
    },
  },
}));

// 2. MOCKS DE SERVICIOS
jest.mock("../src/models/User");
jest.mock("../src/services/MercadoPagoService");
jest.mock("../src/utils/logger");

const app = express();
app.use(express.json());
// Middleware para simular usuario autenticado si el router lo requiere
app.use((req, res, next) => {
  req.userId = "698b68fd4e01fac8e90f5a31";
  next();
});
app.use("/api/mercadopago", router);

describe("Flujo de Suscripciones Mercado Pago", () => {
  const mockUserId = "698b68fd4e01fac8e90f5a31";
  const mockUser = {
    _id: mockUserId,
    email: "test@mensajemagico.com",
    planLevel: "free",
  };

  const mockSubscriptionResponse = {
    init_point: "https://www.mercadopago.com/checkout/123",
    sandbox_init_point: "https://www.mercadopago.com/sandbox/123",
    id: "pref_123",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/mercadopago/create_preference", () => {
    it("Debe crear una preferencia de suscripción válida y devolver init_point", async () => {
      // Configuramos los mocks para que el controlador no encuentre valores nulos
      User.findById.mockResolvedValue(mockUser);
      
      // Mockeamos AMBOS métodos para cubrir tanto el flujo de suscripción como el de preferencia
      MercadoPagoService.createSubscription.mockResolvedValue(mockSubscriptionResponse);
      MercadoPagoService.createPreference.mockResolvedValue(mockSubscriptionResponse);

      const res = await request(app)
        .post("/api/mercadopago/create_preference")
        .send({
          userId: mockUserId,
          planId: "premium_monthly",
          country: "CO",
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("init_point");
    });

    it("Debe manejar errores de Mercado Pago", async () => {
      User.findById.mockResolvedValue(mockUser);
      
      const error = new Error("MP Fail");
      MercadoPagoService.createSubscription.mockRejectedValue(error);
      MercadoPagoService.createPreference.mockRejectedValue(error);

      const res = await request(app)
        .post("/api/mercadopago/create_preference")
        .send({ userId: mockUserId, planId: "premium_monthly", country: "CO" });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("error");
    });
  });
});
