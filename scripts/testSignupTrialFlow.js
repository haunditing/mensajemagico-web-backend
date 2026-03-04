/**
 * Script para testing completo del flujo de signup y trial
 * Simula: Registro → Login → /profile con banner de trial
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

const TEST_EMAIL = `banner-test-${Date.now()}@mensajemagico.com`;
const TEST_PASSWORD = 'test123';

async function testSignupFlow() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('\n🧪 TESTING FLUJO COMPLETO: SIGNUP → TRIAL BANNER\n');
    console.log('═'.repeat(70));

    // 1. Simular signup (como lo hace el endpoint POST /signup)
    console.log('\n✅ PASO 1: SIMULACIÓN DEL SIGNUP');
    console.log(`   Email: ${TEST_EMAIL}`);
    console.log(`   Contraseña: ${TEST_PASSWORD}`);
    
    // Verificar que el usuario no existe
    let existingUser = await User.findOne({ email: TEST_EMAIL });
    if (existingUser) {
      await User.deleteOne({ email: TEST_EMAIL });
      console.log('   ├─ Usuario anterior eliminado');
    }

    // Hash password como hace el backend
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(TEST_PASSWORD, salt);

    // Crear usuario
    const newUser = new User({
      name: 'Banner Test',
      email: TEST_EMAIL,
      password: hashedPassword,
      planLevel: 'freemium'
    });

    // Activar trial como en signup
    const trialActivated = newUser.activateTrial();
    await newUser.save();

    console.log(`   ├─ Usuario creado: ${newUser._id}`);
    console.log(`   ├─ Trial activado: ${trialActivated ? '✅ SÍ' : '❌ NO'}`);
    console.log(`   ├─ Plan: ${newUser.planLevel}`);
    console.log(`   └─ Días trial: ${newUser.getTrialDaysRemaining()}`);

    // 2. Generar token (como hace el endpoint)
    console.log('\n✅ PASO 2: GENERAR TOKEN DE LOGIN');
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });
    console.log(`   └─ Token: ${token.substring(0, 40)}...`);

    // 3. Simular el fetch del /me después del login (como hace AuthContext.fetchUser)
    console.log('\n✅ PASO 3: CARGAR USUARIO CON /api/auth/me (AuthContext)');
    const userFromDb = await User.findById(newUser._id).select('-password');
    
    // Simular lo que hace /me
    const effectivePlan = userFromDb.getEffectivePlan();
    const trialInfo = userFromDb.isInTrial() ? {
      active: true,
      daysRemaining: userFromDb.getTrialDaysRemaining(),
      endDate: userFromDb.trialEndDate
    } : null;

    // Esto es lo que AuthContext guarda
    const userInAuth = {
      ...userFromDb.toObject(),
      trial: trialInfo
    };

    console.log(`   ├─ user._id: ${userInAuth._id}`);
    console.log(`   ├─ user.planLevel: ${userInAuth.planLevel}`);
    console.log(`   ├─ effectivePlan: ${effectivePlan}`);
    console.log(`   ├─ trial.active: ${trialInfo?.active}`);
    console.log(`   ├─ trial.daysRemaining: ${trialInfo?.daysRemaining}`);
    console.log(`   └─ trial.endDate: ${trialInfo?.endDate}`);

    // 4. Verificar que ProfilePage pueda acceder a la info
    console.log('\n✅ PASO 4: VERIFICACIÓN EN ProfilePage');
    
    const userTrialInfo = userInAuth.trial;
    console.log(`   ├─ (user as any).trial: ${JSON.stringify(userTrialInfo, null, 0)}`);
    
    if (userTrialInfo) {
      console.log(`   ├─ Condición banner: trialInfo && trialInfo.active = ${userTrialInfo && userTrialInfo.active}`);
      if (userTrialInfo && userTrialInfo.active) {
        console.log(`   ├─ 🎉 BANNER DEBERÍA APARECER`);
        console.log(`   ├─ Mensaje: "Te quedan ${userTrialInfo.daysRemaining} días de acceso Premium Lite"`);
        console.log(`   └─ Botón: Ver Planes Premium → /pricing`);
      }
    } else {
      console.log(`   ❌ ERROR: trial es null o undefined`);
    }

    // 5. Resumen y próximos pasos
    console.log('\n═'.repeat(70));
    console.log('\n📱 VERIFICACIÓN DEL FLUJO:\n');
    
    const flowOK = (
      trialActivated &&
      userInAuth.planLevel === 'premium_lite' &&
      userTrialInfo &&
      userTrialInfo.active &&
      userTrialInfo.daysRemaining === 7
    );

    if (flowOK) {
      console.log('✅ TODO EL FLUJO FUNCIONA CORRECTAMENTE');
      console.log('\nEL BANNER DEBE APARECER CUANDO:');
      console.log('1. Usuario se registra en /signup');
      console.log('2. Se navega a / (home)');
      console.log('3. Se va a /profile');
      console.log('4. El banner púrpura debería ser visible en la sección de suscripción\n');
      
      console.log('📋 CREDENCIALES PARA TESTING MANUAL:\n');
      console.log(`EMAIL: ${TEST_EMAIL}`);
      console.log(`PASS: ${TEST_PASSWORD}\n`);
      
      console.log('🚀 PASOS PARA PROBAR EN NAVEGADOR:\n');
      console.log('1. Ve a http://localhost:5174');
      console.log('2. Cierra sesión si ya estabas logueado');
      console.log('3. Click en "Regístrate"');
      console.log(`4. Ingresa: ${TEST_EMAIL} / ${TEST_PASSWORD}`);
      console.log('5. Deberías ir a / con la sesión iniciada');
      console.log('6. Click en tu avatar (arriba a la derecha) → Perfil');
      console.log('7. Desplázate hasta la sección "Mi Suscripción"');
      console.log('8. ¡VES EL BANNER PÚRPURA DE TRIAL! 🎉\n');
      
    } else {
      console.log('❌ PROBLEMA DETECTADO:');
      if (!trialActivated) console.log('   - Trial no se activó al registrarse');
      if (userInAuth.planLevel !== 'premium_lite') console.log('   - Plan no es premium_lite');
      if (!userTrialInfo) console.log('   - trial info es null/undefined');
      if (userTrialInfo && !userTrialInfo.active) console.log('   - trial.active es false');
      if (userTrialInfo?.daysRemaining !== 7) console.log('   - Días de trial incorrecto');
    }

    console.log('\n═'.repeat(70) + '\n');

  } catch (error) {
    logger.error('Error en testing:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testSignupFlow();
