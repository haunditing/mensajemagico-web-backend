const GuardianService = require("../src/services/GuardianService");
const Contact = require("../src/models/Contact");

// Mock de dependencias
jest.mock("../src/models/Contact");
jest.mock("../src/utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock de GoogleGenerativeAI para evitar llamadas reales
jest.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        embedContent: jest.fn().mockResolvedValue({
          embedding: { values: [0.1, 0.2, 0.3] }, // Vector simulado
        }),
      }),
    })),
  };
});

describe("GuardianService", () => {
  const mockUserId = "user123";
  const mockContactId = "contact123";

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("analyzeSentiment", () => {
    it("Debe devolver un puntaje de salud positivo para mensajes cálidos", async () => {
      
      const score = await GuardianService.analyzeSentiment("Te quiero mucho, gracias por todo");
      expect(score).toBeGreaterThan(0);
    });
  });

  describe("extractStyle", () => {
    it("Debe extraer los primeros 200 caracteres como estilo", () => {
      const longText = "A".repeat(300);
      const style = GuardianService.extractStyle(longText);
      expect(style.length).toBe(200);
    });
  });

  describe("calculateFriction", () => {
    it("Debe devolver 0% si no hay cambios", () => {
      const friction = GuardianService.calculateFriction("Hola mundo", "Hola mundo");
      expect(friction).toBe(0);
    });

    it("Debe devolver 100% si el texto es totalmente diferente", () => {
      const friction = GuardianService.calculateFriction("Hola", "Adiós");
      // La distancia de Levenshtein entre Hola y Adiós es 5 (max length 5) -> 100%
      expect(friction).toBe(100);
    });

    it("Debe calcular un porcentaje intermedio para cambios parciales", () => {
      const friction = GuardianService.calculateFriction("Hola mundo", "Hola amigo");
      // "mundo" (5) vs "amigo" (5). Distancia aprox 4. Longitud 10. 4/10 = 40%
      expect(friction).toBeGreaterThan(0);
      expect(friction).toBeLessThan(100);
    });
  });

  describe("extractLexicalDNA", () => {
    it("Debe extraer palabras nuevas significativas", () => {
      const original = "Hola, espero que estés bien";
      const edited = "Hola mi bollito, espero que estés bien";
      
      const dna = GuardianService.extractLexicalDNA(original, edited);
      expect(dna).toContain("bollito");
      expect(dna).not.toContain("hola"); // Ya estaba
      expect(dna).not.toContain("mi"); // Muy corta (< 3 chars)
    });
  });

  describe("recordInteraction", () => {
    it("Debe actualizar el historial y la salud del contacto", async () => {
      const mockContact = {
        _id: mockContactId,
        userId: mockUserId,
        relationalHealth: 5,
        snoozeCount: 2,
        history: [],
        save: jest.fn(),
      };

      Contact.findOne.mockResolvedValue(mockContact);

      await GuardianService.recordInteraction(mockUserId, mockContactId, {
        occasion: "saludo",
        tone: "romantico",
        content: "Hola amor",
      });

      expect(Contact.findOne).toHaveBeenCalledWith({ _id: mockContactId, userId: mockUserId });
      expect(mockContact.history).toHaveLength(1);
      expect(mockContact.history[0]).toMatchObject({
        occasion: "saludo",
        tone: "romantico",
        content: "Hola amor",
      });
      
      // La salud debe haber aumentado
      expect(mockContact.relationalHealth).toBeGreaterThan(5);
      
      // El snoozeCount debe haberse reseteado
      expect(mockContact.snoozeCount).toBe(0);
      
      expect(mockContact.save).toHaveBeenCalled();
    });

    it("No debe hacer nada si no encuentra el contacto", async () => {
      Contact.findOne.mockResolvedValue(null);
      await GuardianService.recordInteraction(mockUserId, "invalidId", {});
      // No debería lanzar error, simplemente terminar
    });
  });
});