// test-models.js
const axios = require("axios"); // Asegúrate de tener axios instalado: npm install axios
require("dotenv").config();

const API_KEY = process.env.AI_API_KEY;

async function checkMyModels() {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const response = await axios.get(url);

    response.data.models.forEach((model) => {
      // Limpiamos el nombre para que sea solo el ID
      const modelId = model.name.replace("models/", "");
    });
  } catch (error) {
    console.error(
      "Error consultando la API:",
      error.response?.data || error.message,
    );
  }
}

checkMyModels();
