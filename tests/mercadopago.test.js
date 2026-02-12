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

  beforeAll(() => {
    // Mock de fetch para la TRM (evita llamadas reales a la API de datos.gov.co)
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ valor: "4000" }]),
      })
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/mercadopago/create_preference", () => {
    it("Debe crear una preferencia con deviceId e idempotencyKey", async () => {
      User.findById.mockResolvedValue(mockUser);
      MercadoPagoService.createSubscription.mockResolvedValue(mockSubscriptionResponse);

      const res = await request(app)
        .post("/api/mercadopago/create_preference")
        .send({
          userId: mockUserId,
          planId: "premium_monthly",
          country: "CO",
          deviceId: "device_test_123"
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("init_point");
      
      // Verificar que se pasaron los parámetros de seguridad correctos al servicio
      expect(MercadoPagoService.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
        payerEmail: mockUser.email,
        deviceId: "device_test_123",
        idempotencyKey: expect.any(String), // Verificar que se generó un UUID
        price: 10000 // Precio mensual CO según el mock de plans.js
      }));
    });

    it("Debe manejar errores del servicio correctamente", async () => {
      User.findById.mockResolvedValue(mockUser);
      MercadoPagoService.createSubscription.mockRejectedValue(new Error("Error MP"));

      const res = await request(app)
        .post("/api/mercadopago/create_preference")
        .send({ userId: mockUserId, planId: "premium_monthly", country: "CO" });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty("details", "Error MP");
    });
  });

  describe("POST /api/mercadopago/webhook", () => {
    it("Debe activar Premium cuando una suscripción es autorizada", async () => {
      const payload = { type: "subscription_preapproval", data: { id: "sub_123" } };
      
      MercadoPagoService.getPreApproval.mockResolvedValue({
        id: "sub_123",
        status: "authorized",
        external_reference: mockUserId
      });

      User.findByIdAndUpdate.mockResolvedValue(true);

      const res = await request(app).post("/api/mercadopago/webhook").send(payload);

      expect(res.status).toBe(200);
      // Verificar que se actualizó el usuario
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(mockUserId, expect.objectContaining({
        planLevel: "premium",
        subscriptionStatus: "active"
      }));
    });
  });
});
