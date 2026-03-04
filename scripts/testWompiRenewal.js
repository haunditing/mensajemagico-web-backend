/**
 * Script de testing para el sistema de renovación Wompi
 * 
 * Este script:
 * 1. Crea un usuario de prueba con suscripción Wompi próxima a vencer
 * 2. Verifica los métodos del modelo User (getExpirationDate, getDaysUntilExpiration, needsRenewal)
 * 3. Ejecuta manualmente el cron job de recordatorios
 * 4. Muestra el estado de renovación del usuario
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const EmailService = require('../src/services/EmailService');
const logger = require('../src/utils/logger');

const TEST_USER_EMAIL = 'test.wompi.renewal@mensajemagico.com';

async function createTestUser() {
  logger.info('=== Creando usuario de prueba ===');
  
  // Eliminar usuario de prueba si ya existe
  await User.deleteOne({ email: TEST_USER_EMAIL });
  
  // Calcular fecha de pago que resulta en expiración en 3 días
  const lastPaymentDate = new Date();
  lastPaymentDate.setDate(lastPaymentDate.getDate() - 27); // Hace 27 días (30-27=3 días restantes)
  
  const testUser = new User({
    email: TEST_USER_EMAIL,
    name: 'Usuario Test Wompi',
    planLevel: 'premium_lite',
    planInterval: 'month',
    subscriptionId: 'wompi_test_12345',
    subscriptionProvider: 'wompi',
    lastPaymentDate: lastPaymentDate,
    isActive: true
  });
  
  await testUser.save();
  logger.info(`✓ Usuario creado: ${testUser._id}`);
  logger.info(`  - Plan: ${testUser.planLevel} (${testUser.planInterval})`);
  logger.info(`  - Último pago: ${testUser.lastPaymentDate.toLocaleDateString()}`);
  
  return testUser;
}

async function verifyUserMethods(userId) {
  logger.info('\n=== Verificando métodos del modelo User ===');
  
  const user = await User.findById(userId);
  
  const expirationDate = user.getExpirationDate();
  const daysUntilExpiration = user.getDaysUntilExpiration();
  const needsRenewal = user.needsRenewal();
  
  logger.info(`✓ getExpirationDate(): ${expirationDate ? expirationDate.toLocaleDateString() : 'null'}`);
  logger.info(`✓ getDaysUntilExpiration(): ${daysUntilExpiration}`);
  logger.info(`✓ needsRenewal(): ${needsRenewal}`);
  
  if (needsRenewal && daysUntilExpiration >= 1 && daysUntilExpiration <= 7) {
    logger.info('✓ Usuario cumple condiciones para mostrar banner de renovación');
  } else {
    logger.warn('⚠ Usuario NO cumple condiciones esperadas para renovación');
  }
  
  return { expirationDate, daysUntilExpiration, needsRenewal };
}

async function testEmailNotification(user, daysLeft) {
  logger.info('\n=== Probando envío de email de recordatorio ===');
  
  try {
    const expirationDate = user.getExpirationDate();
    await EmailService.sendSubscriptionExpirationWarning(
      user.email,
      daysLeft,
      expirationDate.toLocaleDateString(),
      user.planLevel
    );
    logger.info(`✓ Email enviado correctamente a ${user.email}`);
  } catch (error) {
    logger.error('✗ Error enviando email:', error.message);
  }
}

async function simulateRenewalEndpoint(userId) {
  logger.info('\n=== Simulando llamada a endpoint /api/payments/renewal-status ===');
  
  const user = await User.findById(userId);
  
  const response = {
    needsRenewal: user.needsRenewal(),
    daysUntilExpiration: user.getDaysUntilExpiration(),
    expirationDate: user.getExpirationDate(),
    provider: user.subscriptionProvider,
    planLevel: user.planLevel,
    planInterval: user.planInterval
  };
  
  logger.info('Response del endpoint:');
  logger.info(JSON.stringify(response, null, 2));
  
  return response;
}

async function runTest() {
  try {
    // Conectar a MongoDB
    logger.info('Conectando a MongoDB...');
    await mongoose.connect(process.env.MONGO_URI);
    logger.info('✓ Conectado a MongoDB\n');
    
    // 1. Crear usuario de prueba
    const testUser = await createTestUser();
    
    // 2. Verificar métodos del modelo
    const methods = await verifyUserMethods(testUser._id);
    
    // 3. Simular endpoint de renovación
    await simulateRenewalEndpoint(testUser._id);
    
    // 4. Probar envío de email (solo si es día de recordatorio: 7, 3 o 1)
    if ([7, 3, 1].includes(methods.daysUntilExpiration)) {
      await testEmailNotification(testUser, methods.daysUntilExpiration);
    } else {
      logger.info(`\n⚠ No se envía email porque faltan ${methods.daysUntilExpiration} días (solo se envía en días 7, 3, 1)`);
    }
    
    // 5. Instrucciones para testing manual
    logger.info('\n=== Instrucciones para testing manual ===');
    logger.info(`1. Abre el frontend: http://localhost:5174`);
    logger.info(`2. Inicia sesión con el email: ${TEST_USER_EMAIL}`);
    logger.info(`3. Ve a tu perfil: http://localhost:5174/profile`);
    logger.info(`4. Deberías ver el banner de renovación animado con el countdown`);
    logger.info(`5. Click en "Renovar Mi Plan" debería llevarte a /pricing con tu plan pre-seleccionado`);
    
    logger.info('\n=== Para probar diferentes días de vencimiento ===');
    logger.info('Ejecuta en la consola de MongoDB:');
    logger.info(`\ndb.users.updateOne(
  { email: "${TEST_USER_EMAIL}" },
  { $set: { lastPaymentDate: new Date(new Date().setDate(new Date().getDate() - 23)) } }
)`);
    logger.info('Esto pondrá la expiración en 7 días (30-23=7)');
    
    logger.info('\n✓ Testing completado exitosamente');
    
  } catch (error) {
    logger.error('Error en testing:', error);
  } finally {
    await mongoose.disconnect();
    logger.info('\n✓ Desconectado de MongoDB');
  }
}

// Ejecutar test
runTest();
