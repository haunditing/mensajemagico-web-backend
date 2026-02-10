const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

// Mock de dependencias externas
jest.mock("../src/utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Definir mocks con prefijo 'mock' para que Jest permita usarlos dentro de jest.mock
const mockGenerateContent = jest.fn().mockResolvedValue({
  response: { text: () => "Mensaje generado con léxico" },
});

const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
  embedContent: jest.fn().mockResolvedValue({
    embedding: { values: [0.1, 0.2, 0.3] },
  }),
});

jest.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    })),
  };
});

// Importar rutas y modelos DESPUÉS de definir los mocks para evitar ReferenceError
const magicRoutes = require("../src/routes/magic");
const Contact = require("../src/models/Contact");
const User = require("../src/models/User");

const app = express();
app.use(express.json());
app.use("/api/magic", magicRoutes);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await Contact.deleteMany({});
  await User.deleteMany({});
  jest.clearAllMocks();
});

describe("Integración: Inyección de ADN Léxico", () => {
  it("Debe incluir el preferredLexicon en el prompt enviado a la IA", async () => {
    // 1. Crear Usuario y Contacto con Léxico
    const user = await User.create({
      email: "test@lexicon.com",
      planLevel: "premium",
    });

    const lexicon = ["chiquis", "consentido", "amorzote"];
    const contact = await Contact.create({
      userId: user._id,
      name: "Pareja Test",
      relationship: "pareja",
      relationalHealth: 8,
      guardianMetadata: {
        preferredLexicon: lexicon,
        trained: true,
      },
    });

    // 2. Llamar al endpoint de generación
    const res = await request(app).post("/api/magic/generate").send({
      userId: user._id.toString(),
      contactId: contact._id.toString(),
      occasion: "amor",
      tone: "romantico",
    });

    // 3. Validar respuesta HTTP
    expect(res.status).toBe(200);

    // 4. Validar que el prompt contenía el léxico
    // Verificamos la llamada a getGenerativeModel para ver si se pasó systemInstruction
    // Nota: La primera llamada suele ser para el modelo de embeddings. Buscamos la última o la que tenga systemInstruction.
    const calls = mockGetGenerativeModel.mock.calls;
    const generationCallArgs =
      calls.find((args) => args[0].systemInstruction) ||
      calls[calls.length - 1];
    const modelConfig = generationCallArgs[0];

    let promptToCheck = "";
    if (modelConfig && modelConfig.systemInstruction) {
      promptToCheck = modelConfig.systemInstruction;
    } else {
      // Fallback si fuera Gemma (aunque por defecto es Gemini)
      promptToCheck =
        mockGenerateContent.mock.calls[0][0].contents[0].parts[0].text;
    }

    lexicon.forEach((word) => {
      expect(promptToCheck).toContain(word);
    });
    // En un nuevo it()
    expect(promptToCheck).toContain("PROHIBICIÓN GEOGRÁFICA");
    expect(promptToCheck).toContain("NO menciones Murallas");
  });
});
