/**
 * Script para configurar un usuario real para probar renovación Wompi
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

const USER_EMAIL = process.argv[2] || 'marvinmorelo@yahoo.com';
const DAYS_UNTIL_EXPIRATION = parseInt(process.argv[3]) || 3;

async function setupUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    logger.info(`Conectado a MongoDB\n`);
    
    // Buscar usuario
    const user = await User.findOne({ email: USER_EMAIL });
    
    if (!user) {
      console.log(`❌ Usuario no encontrado: ${USER_EMAIL}`);
      console.log('Usuarios disponibles:');
      const users = await User.find({}).select('email').limit(5);
      users.forEach(u => console.log(`  - ${u.email}`));
      process.exit(1);
    }
    
    console.log('\n📊 Estado actual del usuario:\n');
    console.log(`📧 Email: ${user.email}`);
    console.log(`👤 Nombre: ${user.name || 'N/A'}`);
    console.log(`💎 Plan: ${user.planLevel}`);
    console.log(`📅 Intervalo: ${user.planInterval || 'N/A'}`);
    console.log(`🔑 Subscription ID: ${user.subscriptionId || 'N/A'}`);
    console.log(`🏦 Proveedor: ${user.subscriptionProvider || 'N/A'}`);
    console.log(`💳 Último pago: ${user.lastPaymentDate ? user.lastPaymentDate.toLocaleDateString() : 'N/A'}`);
    
    // Calcular nueva fecha de pago para simular vencimiento
    const newLastPaymentDate = new Date();
    newLastPaymentDate.setDate(newLastPaymentDate.getDate() - (30 - DAYS_UNTIL_EXPIRATION));
    
    // Actualizar usuario para simular suscripción Wompi
    const updates = {
      planLevel: user.planLevel === 'guest' || user.planLevel === 'freemium' ? 'premium_lite' : user.planLevel,
      planInterval: 'month',
      subscriptionId: user.subscriptionId?.startsWith('wompi_') ? user.subscriptionId : 'wompi_test_' + Date.now(),
      subscriptionProvider: 'wompi',
      lastPaymentDate: newLastPaymentDate,
      isActive: true
    };
    
    await User.updateOne({ email: USER_EMAIL }, { $set: updates });
    
    // Recargar usuario actualizado
    const updatedUser = await User.findOne({ email: USER_EMAIL });
    
    const actualDays = updatedUser.getDaysUntilExpiration();
    const expirationDate = updatedUser.getExpirationDate();
    const needsRenewal = updatedUser.needsRenewal();
    
    console.log('\n\n✅ Usuario configurado para testing de renovación\n');
    console.log(`📧 Email: ${updatedUser.email}`);
    console.log(`💎 Plan actualizado: ${updatedUser.planLevel} (${updatedUser.planInterval})`);
    console.log(`🔑 Subscription ID: ${updatedUser.subscriptionId}`);
    console.log(`💳 Último pago: ${updatedUser.lastPaymentDate.toLocaleDateString()}`);
    console.log(`⏰ Días hasta expiración: ${actualDays}`);
    console.log(`📆 Fecha de expiración: ${expirationDate.toLocaleDateString()}`);
    console.log(`🔔 Necesita renovación: ${needsRenewal ? 'SÍ ✅' : 'NO'}`);
    console.log(`📬 Se enviará email hoy: ${[7, 3, 1].includes(actualDays) ? 'SÍ ✅' : 'NO (solo en días 7, 3, 1)'}`);
    
    console.log('\n📱 Pasos para probar:\n');
    console.log('1. Ir a http://localhost:5174');
    console.log(`2. Iniciar sesión con: ${updatedUser.email}`);
    console.log('3. Ir a /profile y verificar el banner de renovación');
    console.log('4. Click en "Renovar Mi Plan" debería pre-seleccionar tu plan actual\n');
    
    console.log('💡 Para cambiar días de vencimiento:');
    console.log(`   node scripts/setupUserForRenewalTest.js ${USER_EMAIL} 7  (para 7 días)`);
    console.log(`   node scripts/setupUserForRenewalTest.js ${USER_EMAIL} 1  (para 1 día)\n`);
    
  } catch (error) {
    logger.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

setupUser();
