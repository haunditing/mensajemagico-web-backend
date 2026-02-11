const AIOrchestrator = require("../src/services/AIOrchestrator");
const { MODELS } = require("../src/services/AIOrchestrator");

// 1. MOCK DEL MODELO DE BASE DE DATOS (Añade esto)
jest.mock("../src/models/SystemUsage", () => ({
  getCount: jest.fn().mockResolvedValue(0), // Simula que el uso es 0
}));

// Mock del logger para evitar ensuciar la consola durante los tests
jest.mock("../src/utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

describe("AIOrchestrator Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("executeWithFallback", () => {
    it("debe ejecutar la función generadora y devolver el resultado exitoso al primer intento", async () => {
      const mockResult = "Texto generado exitosamente";
      // Simulamos una función generadora que tiene éxito inmediatamente
      const mockGenerator = jest.fn().mockResolvedValue(mockResult);

      const planLevel = "premium";
      const relationalHealth = 8;

      const result = await AIOrchestrator.executeWithFallback(
        planLevel,
        relationalHealth,
        mockGenerator,
      );

      expect(result).toBe(mockResult);
      expect(mockGenerator).toHaveBeenCalledTimes(1);
      // Verifica que el orquestador le pasó un modelo (string) a la función
      expect(mockGenerator).toHaveBeenCalledWith(expect.any(String));
    });

    it("debe activar el mecanismo de fallback y reintentar si el primer intento falla", async () => {
      const successResult = "Texto generado en el segundo intento (fallback)";

      // Simulamos que falla la primera vez (ej. timeout o sobrecarga) y tiene éxito la segunda
      const mockGenerator = jest
        .fn()
        .mockRejectedValueOnce(
          new Error("Error simulado de IA (503 Service Unavailable)"),
        )
        .mockResolvedValue(successResult);

      const planLevel = "free";
      const relationalHealth = 5;

      const result = await AIOrchestrator.executeWithFallback(
        planLevel,
        relationalHealth,
        mockGenerator,
      );

      expect(result).toBe(successResult);
      // Debería haberse llamado al menos 2 veces (intento original + fallback)
      expect(mockGenerator.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it("debe lanzar un error si todos los intentos (incluidos los fallbacks) fallan", async () => {
      // Simulamos que siempre falla
      const mockGenerator = jest
        .fn()
        .mockRejectedValue(new Error("Fallo total de la API"));

      await expect(
        AIOrchestrator.executeWithFallback("guest", 5, mockGenerator),
      ).rejects.toThrow("Fallo total de la API");

      // Debería haber intentado varias veces antes de rendirse
      expect(mockGenerator.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    it("debe saltar al modelo Premium Efficient si todos los modelos Gemini superan la cuota", async () => {
      // Simulamos que todos los modelos Gemini tienen uso > 20
      const SystemUsage = require("../src/models/SystemUsage");
      SystemUsage.getCount.mockResolvedValue(50);

      const mockGenerator = jest.fn().mockResolvedValue("Resultado");

      await AIOrchestrator.executeWithFallback("premium", 9, mockGenerator);

      // Verificamos que al final usó el modelo eficiente por defecto
      // (MODELS.PREMIUM_EFFICIENT suele ser gemma-3-27b-it según tu config)
      expect(mockGenerator).toHaveBeenCalledWith(MODELS.PREMIUM_EFFICIENT);
    });
  });
});
