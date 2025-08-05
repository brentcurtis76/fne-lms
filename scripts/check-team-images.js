#!/usr/bin/env node

/**
 * Team Images Availability Checker
 * 
 * This script tests all team member image URLs from equipo.tsx
 * to identify which images are available and which are missing.
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Team members data extracted from equipo.tsx
const teamMembers = {
  // Equipo FNE
  'arnoldo-cisternas': {
    name: 'Arnoldo Cisternas',
    role: 'Psicólogo y Fundador',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Arnoldo%20Cisternas.png'
  },
  'joan-quintana': {
    name: 'Joan Quintana',
    role: 'Psicólogo y Director Instituto Relacional',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Joan%20Quintana.png'
  },
  'mora-del-fresno': {
    name: 'Mora Del Fresno',
    role: 'Máster en Neuroeducación',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Mora%20Del%20Fresno.png'
  },
  'gabriela-naranjo': {
    name: 'Gabriela Naranjo',
    role: 'Directora FNE Chile',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Gabriela%20Naranjo.png'
  },
  'brent-curtis': {
    name: 'Brent Curtis',
    role: 'Teólogo y Vinculación Institucional',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Brent%20Curtis.png'
  },
  
  // Equipo Internacional
  'coral-regi': {
    name: 'Coral Regí',
    role: 'Ex-Directora Escola Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Coral%20Regi.png'
  },
  'anna-comas': {
    name: 'Anna Comas',
    role: 'Ex-Directora La Maquinista',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Anna%20Comas.png'
  },
  'sandra-entrena': {
    name: 'Sandra Entrena',
    role: 'Directora Escola Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Sandra%20Entrena.png'
  },
  'boris-mir': {
    name: 'Boris Mir',
    role: 'Profesor y Director Instituto Angelta Ferrer',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Boris%20Mir.png'
  },
  'pepe-menendez': {
    name: 'Pepe Menéndez',
    role: 'Ex-Director Adjunto Jesuitas Educació',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Pepe%20Menendez.png'
  },
  'sergi-del-moral': {
    name: 'Sergi Del Moral',
    role: 'Ex-Director Adjunto Jesuitas Educació',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Sergi%20Del%20Moral.png'
  },
  'betlem-cuesta': {
    name: 'Betlem Cuesta',
    role: 'Coordinadora Institut Escola Les Vinyes',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Betlem%20Cuesta.png'
  },

  // Asesores Técnicos
  'carlo-de-britos': {
    name: 'Carlo de Britos',
    role: 'Profesora Primaria Escola Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Carlo%20de%20Britos.png'
  },
  'marta-cardenas': {
    name: 'Marta Cárdenas',
    role: 'Coordinadora Educación Infantil Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Marta%20Cardenas.png'
  },
  'maite-pino': {
    name: 'Maite Pino',
    role: 'Coordinadora Escola Virolai Reina Elisenda',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Maite%20Pino.png'
  },
  'claudia-lopez': {
    name: 'Claudia López de Lamadrid',
    role: 'Coordinadora Virolai Petit',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Claudia%20Lopez.png'
  },
  'enrique-vergara': {
    name: 'Enrique Vergara',
    role: 'Coordinador Pedagógico Escola Virolai',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Enrique%20Vergara.png'
  },
  'jordi-mussons': {
    name: 'Jordi Mussons',
    role: 'Director Escuela Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Jordi%20Mussons.png'
  },
  'marta-segura': {
    name: 'Marta Segura',
    role: 'Profesora Escuela Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Marta%20Segura.png'
  },
  'laia-garces': {
    name: 'Laia Garcés',
    role: 'Coordinadora Primaria Escuela Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Laia%20Garces.png'
  },
  'marta-ortega': {
    name: 'Marta Ortega',
    role: 'Coordinadora Primaria Escuela Sadako',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Marta%20Ortega.png'
  },
  'cristina-montes': {
    name: 'Cristina Montes',
    role: 'Profesora Escuela La Maquinista',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Cristina%20Montes.png'
  },
  'elena-guillen': {
    name: 'Elena Guillén',
    role: 'Directora Escola Octavio Paz',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Elena%20Guillen.png'
  },
  'estefania-del-ramon': {
    name: 'Estefanía del Ramón',
    role: 'Profesora Escola Octavio Paz',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Estefania%20del%20Ramon.png'
  },
  'gemma-pariente': {
    name: 'Gemma Pariente',
    role: 'Profesora Escola Octavio Paz',
    image: 'https://sxlogxqzmarhqsblxmtj.supabase.co/storage/v1/object/public/resources/Equipo/Gemma%20Pariente.png'
  }
};

/**
 * Test if an image URL is accessible
 * @param {string} url - The image URL to test
 * @returns {Promise<{status: string, statusCode?: number, error?: string}>}
 */
function testImageUrl(url) {
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;
      
      const request = client.request(url, { method: 'HEAD' }, (response) => {
        const { statusCode } = response;
        
        if (statusCode >= 200 && statusCode < 300) {
          resolve({ status: 'available', statusCode });
        } else if (statusCode >= 300 && statusCode < 400) {
          resolve({ status: 'redirect', statusCode });
        } else {
          resolve({ status: 'error', statusCode });
        }
      });
      
      request.on('error', (error) => {
        resolve({ status: 'error', error: error.message });
      });
      
      request.setTimeout(10000, () => {
        request.destroy();
        resolve({ status: 'timeout' });
      });
      
      request.end();
    } catch (error) {
      resolve({ status: 'invalid_url', error: error.message });
    }
  });
}

/**
 * Main function to check all team member images
 */
async function checkTeamImages() {
  console.log('🔍 Checking Team Member Images Availability...\n');
  console.log('=' .repeat(80));
  
  const results = {
    available: [],
    missing: [],
    errors: []
  };
  
  const teams = {
    'Equipo FNE': ['arnoldo-cisternas', 'joan-quintana', 'mora-del-fresno', 'gabriela-naranjo', 'brent-curtis'],
    'Equipo Internacional': ['coral-regi', 'anna-comas', 'sandra-entrena', 'boris-mir', 'pepe-menendez', 'sergi-del-moral', 'betlem-cuesta'],
    'Asesores Técnicos': ['carlo-de-britos', 'marta-cardenas', 'maite-pino', 'claudia-lopez', 'enrique-vergara', 'jordi-mussons', 'marta-segura', 'laia-garces', 'marta-ortega', 'cristina-montes', 'elena-guillen', 'estefania-del-ramon', 'gemma-pariente']
  };
  
  for (const [teamName, memberKeys] of Object.entries(teams)) {
    console.log(`\n📋 ${teamName.toUpperCase()}`);
    console.log('-'.repeat(50));
    
    for (const memberKey of memberKeys) {
      const member = teamMembers[memberKey];
      if (!member) {
        console.log(`❌ ${memberKey}: Member not found in data`);
        continue;
      }
      
      const result = await testImageUrl(member.image);
      const filename = member.image.split('/').pop();
      
      switch (result.status) {
        case 'available':
          console.log(`✅ ${member.name}: Image available (${result.statusCode})`);
          results.available.push({
            name: member.name,
            filename: decodeURIComponent(filename),
            url: member.image,
            team: teamName
          });
          break;
          
        case 'error':
          console.log(`❌ ${member.name}: Image missing (${result.statusCode || 'Network Error'})`);
          results.missing.push({
            name: member.name,
            filename: decodeURIComponent(filename),
            url: member.image,
            team: teamName,
            error: result.statusCode || result.error
          });
          break;
          
        case 'timeout':
          console.log(`⏱️  ${member.name}: Request timeout`);
          results.errors.push({
            name: member.name,
            filename: decodeURIComponent(filename),
            url: member.image,
            team: teamName,
            error: 'Timeout'
          });
          break;
          
        default:
          console.log(`⚠️  ${member.name}: ${result.status} (${result.statusCode || result.error})`);
          results.errors.push({
            name: member.name,
            filename: decodeURIComponent(filename), 
            url: member.image,
            team: teamName,
            error: result.status
          });
          break;
      }
      
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  // Summary Report
  console.log('\n' + '=' .repeat(80));
  console.log('📊 SUMMARY REPORT');
  console.log('=' .repeat(80));
  
  console.log(`\n✅ Available Images: ${results.available.length}`);
  console.log(`❌ Missing Images: ${results.missing.length}`);
  console.log(`⚠️  Errors/Issues: ${results.errors.length}`);
  console.log(`📊 Total Team Members: ${Object.keys(teamMembers).length}`);
  
  // Missing Images Details
  if (results.missing.length > 0) {
    console.log('\n❌ MISSING IMAGES TO UPLOAD:');
    console.log('-'.repeat(50));
    results.missing.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} (${item.team})`);
      console.log(`   📁 Expected filename: ${item.filename}`);
    });
  }
  
  // Available Images List
  if (results.available.length > 0) {
    console.log('\n✅ AVAILABLE IMAGES:');
    console.log('-'.repeat(50));
    results.available.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name} (${item.team})`);
    });
  }
  
  // Errors and Issues
  if (results.errors.length > 0) {
    console.log('\n⚠️  ERRORS AND ISSUES:');
    console.log('-'.repeat(50));
    results.errors.forEach((item, index) => {
      console.log(`${index + 1}. ${item.name}: ${item.error}`);
    });
  }
  
  // Recommendations
  console.log('\n💡 RECOMMENDATIONS:');
  console.log('-'.repeat(50));
  
  if (results.missing.length > 0) {
    console.log('1. Upload missing team member photos to Supabase storage:');
    console.log('   Path: resources/Equipo/');
    console.log('   Format: PNG files with exact names as shown above');
    console.log('');
    console.log('2. Verify filename encoding for special characters:');
    results.missing.forEach(item => {
      if (item.filename.includes('ñ') || item.filename.includes('é') || item.filename.includes('í')) {
        console.log(`   - ${item.filename} (contains special characters)`);
      }
    });
  }
  
  if (results.available.length < Object.keys(teamMembers).length) {
    console.log('\n3. Consider adding fallback placeholder images for missing photos');
    console.log('4. Implement error handling in the UI to show default avatars');
  }
  
  console.log('\n🔧 NEXT STEPS:');
  console.log('1. Upload missing images to Supabase storage');
  console.log('2. Test the equipo.tsx page after uploads');
  console.log('3. Consider implementing fallback placeholder system');
  
  return results;
}

// Run the check
if (require.main === module) {
  checkTeamImages()
    .then(() => {
      console.log('\n✨ Team images check completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Error running team images check:', error);
      process.exit(1);
    });
}

module.exports = { checkTeamImages, teamMembers };