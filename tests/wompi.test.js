const request = require("supertest");
const express = require("express");
const router = require("../src/routes/wompi");
const User = require("../src/models/User");
const WompiService = require("../src/services/WompiService");

// Mocks
jest.mock("../src/models/User");
jest.mock("../src/services/WompiService");
jest.mock("../src/utils/logger");
jest.mock("../src/config/plans", () => ({
  subscription_plans: {
    premium: {
      pricing_hooks: {
        wompi_price_in_cents_monthly: 1500000,
        wompi_price_in_cents_yearly: 15000000,
        mercadopago_price_monthly: 15000,
        mercadopago_price_yearly: 150000,
      },
    },
  },
}));

const app = express();
app.use(express.json());
app.use("/api", router);

describe("Wompi Integration Tests", () => {
  const mockUserId = "698b68fd4e01fac8e90f5a31";
  const mockUser = {
    _id: mockUserId,
    email: "test@wompi.com",
    planLevel: "free",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/checkout", () => {
    it("Debe generar los parámetros de checkout correctamente", async () => {
      User.findById.mockResolvedValue(mockUser);
      WompiService.generateCheckoutSignature.mockReturnValue("mock_signature_hash");
      WompiService.getPublicKey.mockReturnValue("pub_test_mock");

      const res = await request(app)
        .post("/api/checkout")
        .send({ userId: mockUserId, planId: "premium_monthly" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(expect.objectContaining({
        reference: expect.stringContaining(`TX-${mockUserId}-`),
        amountInCents: 1500000,
        currency: "COP",
        signature: "mock_signature_hash",
        publicKey: "pub_test_mock"
      }));
    });

    it("Debe devolver 404 si el usuario no existe", async () => {
      User.findById.mockResolvedValue(null);

      const res = await request(app)
        .post("/api/checkout")
        .send({ userId: mockUserId, planId: "premium_monthly" });

      expect(res.status).toBe(404);
    });

    it("Debe usar el precio de MercadoPago * 100 si el precio de Wompi no está definido (Fallback)", async () => {
      jest.resetModules(); // Limpiamos la caché de módulos para recargar la configuración

      // 1. Definimos un mock de configuración donde FALTA el precio de Wompi
      jest.doMock("../src/config/plans", () => ({
        subscription_plans: {
          premium: {
            pricing_hooks: {
              // wompi_price_in_cents_monthly: undefined, // Simular ausencia
              mercadopago_price_monthly: 20000, // 20,000 COP
            },
          },
        },
      }));

      // 2. Re-mockear dependencias necesarias (se pierden al hacer resetModules)
      jest.doMock("../src/models/User", () => ({ findById: jest.fn() }));
      jest.doMock("../src/services/WompiService", () => ({
        generateCheckoutSignature: jest.fn().mockReturnValue("fallback_signature"),
        getPublicKey: jest.fn().mockReturnValue("pub_test_fallback"),
      }));
      jest.doMock("../src/utils/logger", () => ({
        info: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
      }));

      // 3. Re-importar módulos para que usen la nueva configuración
      const express = require("express");
      const router = require("../src/routes/wompi");
      const UserMock = require("../src/models/User");
      
      const testApp = express();
      testApp.use(express.json());
      testApp.use("/api", router);

      UserMock.findById.mockResolvedValue(mockUser);

      const res = await request(testApp)
        .post("/api/checkout")
        .send({ userId: mockUserId, planId: "premium_monthly" });

      expect(res.status).toBe(200);
      expect(res.body.amountInCents).toBe(2000000); // 20000 * 100
      expect(res.body.signature).toBe("fallback_signature");
    });
  });

  describe("POST /api/webhooks/wompi", () => {
    const mockEvent = {
      event: "transaction.updated",
      data: {
        transaction: {
          id: "tr_wompi_123",
          status: "APPROVED",
          reference: `TX-${mockUserId}-123456789`,
          amount_in_cents: 1500000
        }
      },
      signature: { checksum: "valid_checksum" },
      timestamp: 1678900000
    };

    it("Debe activar el plan Premium cuando la transacción es APROBADA y la firma es válida", async () => {
      WompiService.verifyWebhookSignature.mockReturnValue(true);
      User.findByIdAndUpdate.mockResolvedValue({ ...mockUser, planLevel: "premium" });

      const res = await request(app)
        .post("/api/webhooks/wompi")
        .send(mockEvent);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      
      // Verificar que se actualizó el usuario
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({
          planLevel: "premium",
          subscriptionId: "wompi_tr_wompi_123"
        }),
        expect.any(Object) // opciones de mongoose { new: true }
      );
    });

    it("Debe rechazar el webhook (400) si la firma es inválida", async () => {
      WompiService.verifyWebhookSignature.mockReturnValue(false);

      const res = await request(app)
        .post("/api/webhooks/wompi")
        .send(mockEvent);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Firma inválida");
      expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it("Debe rechazar el webhook (400) si el payload está mal formado", async () => {
      const res = await request(app)
        .post("/api/webhooks/wompi")
        .send({}); // Payload vacío

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Payload inválido");
    });
  });
});