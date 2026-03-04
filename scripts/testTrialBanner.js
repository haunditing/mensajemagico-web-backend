/**
 * Script para verificar que el backend retorna correctamente la info del trial
 */

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const User = require('../src/models/User');
const logger = require('../src/utils/logger');

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'banner.test@mensajemagico.com';
const TEST_PASSWORD = 'test123';

async function testTrialBanner() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('\n🧪 TESTING TRIAL BANNER EN FRONTEND\n');
    console.log('═'.repeat(60));

    // 1. Crear usuario nuevo con trial
    console.log('\n✅ Paso 1: Crear usuario con trial');
    await User.deleteOne({ email: TEST_EMAIL });
    
    const newUser = new User({
      email: TEST_EMAIL,
      name: 'Banner Test User',
      password: 'hashed_password',
      planLevel: 'freemium'
    });
    
    newUser.activateTrial();
    await newUser.save();
    
    console.log(`   ├─ Usuario creado: ${newUser._id}`);
    console.log(`   ├─ Trial activo: SÍ`);
    console.log(`   ├─ Días: ${newUser.getTrialDaysRemaining()}`);
    console.log(`   └─ Plan: ${newUser.planLevel}`);

    // 2. Simular login - generar token
    console.log('\n✅ Paso 2: Generar token de autenticación');
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });
    console.log(`   └─ Token generado: ${token.substring(0, 30)}...`);

    // 3. Llamar endpoint /me como haría el frontend
    console.log('\n✅ Paso 3: Llamar endpoint /api/auth/me');
    try {
      const response = await axios.get(`${BASE_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = response.data;
      console.log('   Response del servidor:');
      console.log(`   ├─ user._id: ${data.user._id}`);
      console.log(`   ├─ user.planLevel: ${data.user.planLevel}`);
      console.log(`   ├─ effectivePlan: ${data.effectivePlan}`);
      console.log(`   ├─ trial: ${JSON.stringify(data.trial, null, 2).replace(/\n/g, '\n   │  ')}`);
      
      if (!data.trial) {
        console.log('\n❌ ERROR: El endpoint no retorna información del trial!');
        console.log('   Verifica que los campos trial* existan en el modelo User');
      } else if (!data.trial.active) {
        console.log('\n⚠️  ADVERTENCIA: El trial no está activo');
      } else {
        console.log('\n✅ ¡El endpoint retorna correctamente la información del trial!');
      }

      // 4. Verificar estructura esperada por el frontend
      console.log('\n✅ Paso 4: Verificar estructura para el frontend');
      
      if (data.trial) {
        const requiredFields = ['active', 'daysRemaining', 'endDate'];
        const hasAllFields = requiredFields.every(field => field in data.trial);
        
        if (hasAllFields) {
          console.log('   ✅ Todos los campos requeridos están presentes:');
          requiredFields.forEach(field => {
            console.log(`      ├─ ${field}: ${data.trial[field]}`);
          });
        } else {
          console.log('   ❌ Faltan campos:');
          requiredFields.forEach(field => {
            if (!(field in data.trial)) {
              console.log(`      ├─ ❌ ${field}: FALTA`);
            }
          });
        }
      }

      // 5. Instrucciones para el frontend
      console.log('\n═'.repeat(60));
      console.log('\n📱 PRÓXIMOS PASOS EN FRONTEND:\n');
      console.log('1. Abre http://localhost:5174');
      console.log(`2. Registra un NUEVO usuario con email: ${TEST_EMAIL}`);
      console.log('3. Debería aparecer el banner púrpura automáticamente');
      console.log('4. El banner debe mostrar "Te quedan 7 días de acceso Premium Lite"');
      console.log('5. Si NO aparece:');
      console.log('   - Abre DevTools (F12)');
      console.log('   - Revisa la Console para errores');
      console.log('   - Verifica en Network que /api/auth/me retorna trial');
      console.log('   - Chequea que el estado trialInfo se está actualizado');

      console.log('\n═'.repeat(60) + '\n');

    } catch (apiError) {
      console.log(`\n❌ Error llamando al endpoint:`);
      console.log(`   ${apiError.response?.status}: ${apiError.response?.data?.error || apiError.message}`);
    }

  } catch (error) {
    logger.error('Error en testing:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB\n');
  }
}

testTrialBanner();
