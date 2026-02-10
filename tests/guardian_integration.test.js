const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const guardianRoutes = require("../src/routes/guardian");
const Contact = require("../src/models/Contact");
const User = require("../src/models/User");

// Mock de dependencias externas
jest.mock("../src/utils/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock del middleware de autenticación para evitar validación de JWT
jest.mock("../src/middleware/auth", () => (req, res, next) => next());

// Mock de GoogleGenerativeAI para evitar llamadas reales en integración
jest.mock("@google/generative-ai", () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        embedContent: jest.fn().mockResolvedValue({
          embedding: { values: [0.1, 0.2, 0.3] },
        }),
      }),
    })),
  };
});

const app = express();
app.use(express.json());

// Middleware de autenticación simulado para pruebas de integración
app.use((req, res, next) => {
  req.userId = req.headers["x-user-id"];
  next();
});

app.use("/api/guardian", guardianRoutes);

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

describe("Integración: Guardián de Sentimientos", () => {
  it("POST /api/guardian/learn - Debe aprender del estilo del usuario y actualizar la DB", async () => {
    const userId = new mongoose.Types.ObjectId();
    const contact = await Contact.create({
      userId: userId,
      name: "Test Contact",
      relationship: "pareja",
      relationalHealth: 5,
    });

    const originalText = "Hola, espero que estés bien.";
    const editedText = "Hola mi amor, espero que estés súper bien.";

    const res = await request(app)
      .post("/api/guardian/learn")
      .set("x-user-id", userId.toString()) // Simular auth
      .send({
        contactId: contact._id,
        originalText,
        editedText,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.newHealth).toBeGreaterThan(5); // La salud debe haber mejorado

    const updatedContact = await Contact.findById(contact._id);
    
    expect(updatedContact.guardianMetadata.trained).toBe(true);
    expect(updatedContact.guardianMetadata.lastUserStyle).toBe(editedText.substring(0, 200));
    
    expect(updatedContact.guardianMetadata.preferredLexicon.length).toBeGreaterThan(0);
    
    const lastHistory = updatedContact.history[updatedContact.history.length - 1];
    expect(lastHistory.wasEdited).toBe(true);
    expect(lastHistory.content).toBe(editedText);
    expect(lastHistory.originalContent).toBe(originalText);
  });
});