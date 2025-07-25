/**
 * FNE LMS Data Seeding - Organizations Generator
 * 
 * Generates realistic organizational structure (schools, generations, communities)
 * with proper hierarchical relationships and regional distribution
 */

const { logProgress, batchInsert, generateRandomDate, randomBetween, randomChoice } = require('../utils/database');

async function generateOrganizations(supabase, scenarios) {
  console.log('🏫 Generating organizational structure...');
  
  const { DATA_VOLUMES, SPANISH_DATA } = scenarios;
  const generatedData = {
    schools: [],
    generations: [],
    communities: []
  };
  
  try {
    // Step 1: Generate Schools with explicit IDs for INTEGER compatibility
    console.log('\n1. Creating schools...');
    const schools = [];
    
    // Start with a high ID to avoid conflicts with existing data
    const startingId = 10000 + Math.floor(Math.random() * 10000);
    
    for (let i = 0; i < DATA_VOLUMES.schools; i++) {
      const school = {
        id: startingId + i, // Explicit INTEGER ID
        name: `${SPANISH_DATA.schools[i % SPANISH_DATA.schools.length]} (Test)`,
        has_generations: true // All test schools have generations
      };
      
      schools.push(school);
      logProgress('Schools', i + 1, DATA_VOLUMES.schools, school.name);
    }
    
    const schoolResults = await batchInsert(supabase, 'schools', schools);
    generatedData.schools = schoolResults;
    
    // Step 2: Generate Generations (2 per school) with INTEGER school_id
    console.log('\n2. Creating generations...');
    const generations = [];
    
    for (let schoolIndex = 0; schoolIndex < schoolResults.length; schoolIndex++) {
      const school = schoolResults[schoolIndex]; // Use the results from the database insert
      
      // Create 2 generations per school
      for (let genIndex = 0; genIndex < 2; genIndex++) {
        const generation = {
          school_id: parseInt(school.id), // Ensure INTEGER type
          name: `Generación ${2023 + genIndex}`,
          grade_range: `${7 + genIndex}-${10 + genIndex}`, // Realistic grade range
          created_at: generateRandomDate('2023-01-01', '2024-01-01')
        };
        
        generations.push(generation);
      }
      
      logProgress('Generations', (schoolIndex + 1) * 2, DATA_VOLUMES.generations, `${school.name} - 2 generations`);
    }
    
    const generationResults = await batchInsert(supabase, 'generations', generations);
    generatedData.generations = generationResults;
    
    // Step 3: Generate Communities (4 per school) with INTEGER school_id
    console.log('\n3. Creating communities...');
    const communities = [];
    
    // Create communities linked to the generated schools
    for (let schoolIndex = 0; schoolIndex < schoolResults.length; schoolIndex++) {
      const school = schoolResults[schoolIndex];
      
      console.log(`🔍 Debug school ${schoolIndex}:`, { id: school.id, name: school.name });
      
      // Create 4 communities per school 
      for (let commIndex = 0; commIndex < 4; commIndex++) {
        // Find the corresponding generation for this community
        const generationIndex = Math.floor(commIndex / 2); // 2 communities per generation
        const correspondingGeneration = generationResults[schoolIndex * 2 + generationIndex];
        
        console.log(`🔍 Debug generation for community ${commIndex}:`, correspondingGeneration ? { id: correspondingGeneration.id, name: correspondingGeneration.name } : 'null');
        
        const community = {
          name: `Comunidad ${['Alpha', 'Beta', 'Gamma', 'Delta'][commIndex % 4]} - ${school.name || 'Unknown School'}`,
          description: `Comunidad de crecimiento para estudiantes`,
          school_id: school.id ? parseInt(school.id) : null, // Ensure INTEGER type
          generation_id: correspondingGeneration && correspondingGeneration.id ? parseInt(correspondingGeneration.id) : null,
          created_by: null, // Will be assigned when creating users
          is_active: true,
          created_at: generateRandomDate('2023-03-01', '2024-01-01')
        };
        
        console.log(`🔍 Debug community ${commIndex}:`, { name: community.name, school_id: community.school_id, generation_id: community.generation_id });
        
        communities.push(community);
      }
      
      logProgress('Communities', (schoolIndex + 1) * 4, DATA_VOLUMES.communities, 
        `${school.name} - 4 communities`);
    }
    
    const communityResults = await batchInsert(supabase, 'communities', communities);
    generatedData.communities = communityResults;
    
    // Generate summary report
    console.log('\n📊 Organizational Structure Summary:');
    console.log(`   • Schools: ${schools.length}`);
    console.log(`   • Generations: ${generations.length}`);
    console.log(`   • Communities: ${communities.length}`);
    console.log(`   • Test Data: All records marked for easy cleanup`);
    
    return generatedData;
  } catch (error) {
    console.error('❌ Organization generation failed:', error.message);
    throw error;
  }
}

// Helper functions
function getRegionForCity(city) {
  const regionMap = {
    'Santiago': 'Región Metropolitana',
    'Valparaíso': 'Región de Valparaíso',
    'Concepción': 'Región del Biobío',
    'Temuco': 'Región de la Araucanía',
    'Antofagasta': 'Región de Antofagasta',
    'Iquique': 'Región de Tarapacá',
    'La Serena': 'Región de Coquimbo',
    'Rancagua': 'Región del Libertador Bernardo O\'Higgins',
    'Talca': 'Región del Maule',
    'Chillán': 'Región de Ñuble',
    'Puerto Montt': 'Región de Los Lagos',
    'Punta Arenas': 'Región de Magallanes'
  };
  
  return regionMap[city] || 'Región Metropolitana';
}

function getActivityLevelFromHealth(healthScore) {
  if (healthScore >= 80) return 'muy_alto';
  if (healthScore >= 60) return 'alto';
  if (healthScore >= 40) return 'medio';
  if (healthScore >= 20) return 'bajo';
  return 'muy_bajo';
}

function getPerformanceCategory(healthScore) {
  if (healthScore >= 90) return 'excelente';
  if (healthScore >= 70) return 'bueno';
  if (healthScore >= 50) return 'regular';
  if (healthScore >= 30) return 'bajo';
  return 'crítico';
}

module.exports = { generateOrganizations };