const request = require("supertest");
const express = require("express");
const router = require("../src/routes/mercadopago");
const User = require("../src/models/User");
const MercadoPagoService = require("../src/services/MercadoPagoService");

const app = express();
app.use(express.json());
app.use("/api/mercadopago", router);

// Mocks de dependencias
jest.mock("../src/models/User");
jest.mock("../src/services/MercadoPagoService");
jest.mock("../src/utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));
jest.mock("../src/config/plans", () => ({
  subscription_plans: {
    premium: {
      pricing_hooks: {
        mercadopago_price_yearly: 100000,
        mercadopago_price_monthly: 10000,
        mercadopago_price_yearly_usd: 47.9,
        mercadopago_price_monthly_usd: 4.99,
      },
    },
  },
}));

describe("Flujo de Suscripciones Mercado Pago", () => {
  const mockUserId = "698b68fd4e01fac8e90f5a31";

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it("Debe crear una preferencia válida", async () => {
    User.findById.mockResolvedValue({
      _id: mockUserId,
      email: "test@test.com",
    });
    MercadoPagoService.createSubscription.mockResolvedValue({
      init_point: "https://www.mercadopago.com/checkout/123",
    });

    const res = await request(app)
      .post("/api/mercadopago/create_preference")
      .send({ userId: mockUserId, planId: "premium_monthly", country: "CO" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("init_point");
  });

  it("Debe activar Premium cuando llega el webhook de suscripción autorizada", async () => {
    const mockSub = {
      id: "sub_12345",
      status: "authorized",
      external_reference: mockUserId,
    };

    MercadoPagoService.getPreApproval.mockResolvedValue(mockSub);
    User.findById.mockResolvedValue({ _id: mockUserId, planLevel: "free" });
    User.findByIdAndUpdate.mockResolvedValue({ planLevel: "premium" });

    const res = await request(app)
      .post("/api/mercadopago/webhook")
      .send({
        type: "subscription_preapproval",
        data: { id: "sub_12345" },
      });

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalled();
  });

  // AHORA DENTRO DEL DESCRIBE
  it("Debe ignorar el pago si el estado es 'rejected'", async () => {
    const mockPayment = {
      id: "pay_rejected_123",
      status: "rejected",
      external_reference: mockUserId,
    };

    MercadoPagoService.getPayment.mockResolvedValue(mockPayment);
    // Definimos que no encuentre problemas con el usuario pero no haga nada
    User.findById.mockResolvedValue({ _id: mockUserId, planLevel: "free" });

    const res = await request(app)
      .post("/api/mercadopago/webhook")
      .send({
        type: "payment",
        data: { id: "pay_rejected_123" },
      });

    expect(res.status).toBe(200);
    // Como el beforeEach limpió todo, esto ahora será 0
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });
  it("Debe ignorar el pago si el estado es 'pending' (no activar premium)", async () => {
    // 1. Definimos un pago con estado pendiente
    const mockPaymentPending = {
      id: "pay_pending_999",
      status: "pending", // <--- Estado clave
      external_reference: mockUserId,
    };

    // 2. Configuramos el servicio para que devuelva este pago
    MercadoPagoService.getPayment.mockResolvedValue(mockPaymentPending);

    // 3. Mock del usuario (está en nivel 'free')
    User.findById.mockResolvedValue({ _id: mockUserId, planLevel: "free" });

    // 4. Ejecutamos el webhook
    const res = await request(app)
      .post("/api/mercadopago/webhook")
      .send({
        type: "payment",
        data: { id: "pay_pending_999" },
      });

    // 5. Validaciones
    expect(res.status).toBe(200); // Siempre responder 200 a MP

    // VERIFICACIÓN CRUCIAL: No debe haberse llamado a la actualización
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();

    // Opcional: Verificar que el logger registró algo si así lo tienes configurado
    // expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("Pago aprobado"));
  });
  it("Debe degradar a 'free' cuando la suscripción es cancelada", async () => {
    const mockSubCancelled = {
      id: "sub_12345",
      status: "cancelled", // <--- Estado de cancelación
      external_reference: mockUserId,
    };

    MercadoPagoService.getPreApproval.mockResolvedValue(mockSubCancelled);
    User.findById.mockResolvedValue({ _id: mockUserId, planLevel: "premium" });

    const res = await request(app)
      .post("/api/mercadopago/webhook")
      .send({
        type: "subscription_preapproval",
        data: { id: "sub_12345" },
      });

    expect(res.status).toBe(200);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      mockUserId,
      expect.objectContaining({ planLevel: "free" }),
    );
  });
});
