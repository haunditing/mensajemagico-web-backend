#!/usr/bin/env node

/**
 * Script para debuguear el flujo del trial
 * Simula el signup y luego llama a /me para ver qué está retornando
 */

const mongoose = require("mongoose");
const User = require("../src/models/User");
const bcrypt = require("bcrypt");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mensajemagico";

async function main() {
  try {
    // Conectar a BD
    await mongoose.connect(MONGODB_URI);
    console.log("📦 Conectado a MongoDB");

    // Crear usuario de prueba
    const testEmail = `debug-trial-${Date.now()}@test.com`;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash("test123", salt);

    const newUser = new User({
      name: "Debug Trial User",
      email: testEmail,
      password: hashedPassword,
      planLevel: "freemium",
    });

    console.log("\n🔍 Estado ANTES de activateTrial():");
    console.log("  trialStartDate:", newUser.trialStartDate);
    console.log("  trialEndDate:", newUser.trialEndDate);
    console.log("  hasUsedTrial:", newUser.hasUsedTrial);
    console.log("  isInTrial():", newUser.isInTrial());

    // Activar trial
    const activated = newUser.activateTrial();
    console.log("\n✅ activateTrial() retornó:", activated);

    console.log("\n🔍 Estado DESPUÉS de activateTrial():");
    console.log("  trialStartDate:", newUser.trialStartDate);
    console.log("  trialEndDate:", newUser.trialEndDate);
    console.log("  hasUsedTrial:", newUser.hasUsedTrial);
    console.log("  isInTrial():", newUser.isInTrial());
    console.log("  getTrialDaysRemaining():", newUser.getTrialDaysRemaining());

    // Guardar
    await newUser.save();
    console.log("\n✅ Usuario guardado en BD");

    // Recuperar del DB
    const savedUser = await User.findById(newUser._id);
    console.log("\n🔍 Estado DESPUÉS de guardar y recuperar de BD:");
    console.log("  trialStartDate:", savedUser.trialStartDate);
    console.log("  trialEndDate:", savedUser.trialEndDate);
    console.log("  hasUsedTrial:", savedUser.hasUsedTrial);
    console.log("  isInTrial():", savedUser.isInTrial());
    console.log("  getTrialDaysRemaining():", savedUser.getTrialDaysRemaining());
    console.log("  planLevel:", savedUser.planLevel);

    // Simular respuesta de /api/auth/me
    console.log("\n🔍 Simulando respuesta de /api/auth/me:");
    const trialInfo = savedUser.isInTrial() ? {
      active: true,
      daysRemaining: savedUser.getTrialDaysRemaining(),
      endDate: savedUser.trialEndDate
    } : null;

    console.log("  trialInfo:", trialInfo);

    if (trialInfo === null) {
      console.log(
        "\n⚠️ PROBLEMA: trial es null porque isInTrial() retorna false"
      );
      console.log("  Verificar:");
      console.log("    • ¿trialStartDate fue guardado?", !!savedUser.trialStartDate);
      console.log("    • ¿trialEndDate fue guardado?", !!savedUser.trialEndDate);
      const now = new Date();
      console.log("    • ¿Hora actual >= trialStartDate?", now >= (savedUser.trialStartDate || new Date(0)));
      console.log("    • ¿Hora actual <= trialEndDate?", now <= (savedUser.trialEndDate || new Date(0)));
    } else {
      console.log("\n✅ Trial info muestra correctamente");
    }

    // Limpiar
    await User.deleteOne({ _id: newUser._id });
    console.log("\n🧹 Usuario de prueba eliminado");

  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("✅ Desconectado de MongoDB\n");
  }
}

main();
