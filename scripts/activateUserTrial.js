#!/usr/bin/env node

const mongoose = require("mongoose");
const User = require("../src/models/User");
require("dotenv").config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/mensajemagico";

async function main() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("📦 Conectado a MongoDB");

    // REEMPLAZA ESTO CON TU EMAIL
    const email = "morelotapiamarvin@gmail.com";

    const user = await User.findOne({ email });
    if (!user) {
      console.log(`❌ Usuario ${email} no encontrado`);
      process.exit(1);
    }

    console.log(`\n🔍 Usuario encontrado: ${user.email}`);
    console.log(`  Estado actual:
    - Plan: ${user.planLevel}
    - hasUsedTrial: ${user.hasUsedTrial}
    - trialStartDate: ${user.trialStartDate || 'NO'}`);

    // Activar trial
    const activated = user.activateTrial();
    
    if (!activated) {
      console.log("  ⚠️ No se pudo activar (posiblemente ya usó el trial antes)");
      // Forzar si es necesario
      if (user.hasUsedTrial) {
        console.log("  🔧 Forzando reset de trial...");
        user.hasUsedTrial = false;
        user.activateTrial();
      }
    }

    await user.save();

    console.log(`\n✅ Trial activado correctamente!
    - Plan: ${user.planLevel}
    - Desde: ${user.trialStartDate.toLocaleDateString()}
    - Hasta: ${user.trialEndDate.toLocaleDateString()}
    - Días: ${user.getTrialDaysRemaining()}`);

    await mongoose.disconnect();
    console.log("\n✅ Listo para probar en el frontend");
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
