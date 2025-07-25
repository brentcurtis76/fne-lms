/**
 * FNE LMS Data Seeding - Users Generator
 * 
 * Generates realistic user personas with proper role distribution,
 * Spanish names, and authentic behavioral patterns
 */

const { logProgress, batchInsert, generateSpanishName, generateEmail, generateRandomDate, randomBetween, randomChoice, generateUUID } = require('../utils/database');

async function generateUsers(supabase, scenarios, generatedData) {
  console.log('👥 Generating user personas...');
  
  const { DATA_VOLUMES, SPANISH_DATA } = scenarios;
  const users = [];
  const userRoleMapping = []; // Track user-role relationships
  
  try {
    // Get organizational data for user assignment
    // Handle both nested and direct organizational data structures
    const orgData = generatedData.organizations || generatedData;
    const schools = orgData?.schools || [];
    const generations = orgData?.generations || [];
    const communities = orgData?.communities || [];
    
    console.log(`🔍 Debug: Found ${schools.length} schools, ${generations.length} generations, ${communities.length} communities`);
    
    if (schools.length === 0) {
      console.error('❌ No schools found in generated data structure:');
      console.error('generatedData keys:', Object.keys(generatedData));
      if (generatedData.organizations) {
        console.error('organizations keys:', Object.keys(generatedData.organizations));
      }
      throw new Error('No schools found in generated data. Run organization generation first.');
    }
    
    console.log(`\n📋 Creating ${DATA_VOLUMES.users} users across ${schools.length} schools...`);
    
    let userCounter = 0;
    
    // Step 1: Generate Admin Users (5)
    console.log('\n1. Creating admin users...');
    for (let i = 0; i < DATA_VOLUMES.admins; i++) {
      const user = createUser({
        id: `test-admin-${i + 1}`,
        role: 'admin',
        name: generateSpanishName(),
        schools,
        counter: ++userCounter,
        scenarios
      });
      
      users.push(user);
      userRoleMapping.push({ userId: user.id, role: 'admin', originalId: `test-admin-${i + 1}` });
      logProgress('Admins', i + 1, DATA_VOLUMES.admins, user.name);
    }
    
    // Step 2: Generate Consultors (10)
    console.log('\n2. Creating consultors...');
    for (let i = 0; i < DATA_VOLUMES.consultors; i++) {
      const user = createUser({
        id: `test-consultor-${i + 1}`,
        role: 'consultor',
        name: generateSpanishName(),
        schools,
        counter: ++userCounter,
        scenarios
      });
      
      users.push(user);
      userRoleMapping.push({ userId: user.id, role: 'consultor', originalId: `test-consultor-${i + 1}` });
      logProgress('Consultors', i + 1, DATA_VOLUMES.consultors, user.name);
    }
    
    // Step 3: Generate Network Supervisors (8)
    console.log('\n3. Creating network supervisors...');
    for (let i = 0; i < DATA_VOLUMES.supervisors; i++) {
      const assignedSchools = schools.slice(i * 2, (i + 1) * 2); // 2 schools per supervisor
      const user = createUser({
        id: `test-supervisor-${i + 1}`,
        role: 'supervisor_de_red',
        name: generateSpanishName(),
        schools: assignedSchools,
        counter: ++userCounter,
        scenarios,
        networkScope: assignedSchools.map(s => s.id)
      });
      
      users.push(user);
      userRoleMapping.push({ userId: user.id, role: 'supervisor_de_red', originalId: `test-supervisor-${i + 1}` });
      logProgress('Supervisors', i + 1, DATA_VOLUMES.supervisors, user.name);
    }
    
    // Step 4: Generate Teachers (50)
    console.log('\n4. Creating teachers...');
    for (let i = 0; i < DATA_VOLUMES.teachers; i++) {
      const school = randomChoice(schools);
      const user = createUser({
        id: `test-teacher-${i + 1}`,
        role: 'docente',
        name: generateSpanishName(),
        schools: [school],
        counter: ++userCounter,
        scenarios,
        schoolId: school.id
      });
      
      users.push(user);
      userRoleMapping.push({ userId: user.id, role: 'docente', originalId: `test-teacher-${i + 1}` });
      logProgress('Teachers', i + 1, DATA_VOLUMES.teachers, user.name);
    }
    
    // Step 5: Generate Community Leaders (48 - one per community)
    console.log('\n5. Creating community leaders...');
    for (let i = 0; i < communities.length; i++) {
      const community = communities[i];
      const school = schools.find(s => parseInt(s.id) === parseInt(community.school_id));
      const generation = generations.find(g => parseInt(g.id) === parseInt(community.generation_id));
      
      if (!school) {
        console.error(`❌ No school found for community ${community.id} with school_id ${community.school_id}`);
        console.error('Available schools:', schools.map(s => ({ id: s.id, name: s.name })));
        continue; // Skip this community leader
      }
      
      if (!generation) {
        console.error(`❌ No generation found for community ${community.id} with generation_id ${community.generation_id}`);
        console.error('Available generations:', generations.map(g => ({ id: g.id, name: g.name })));
        continue; // Skip this community leader
      }
      
      const user = createUser({
        id: `test-leader-${i + 1}`,
        role: 'lider_comunidad',
        name: generateSpanishName(),
        schools: [school],
        counter: ++userCounter,
        scenarios,
        schoolId: school.id,
        generationId: generation.id,
        communityId: community.id
      });
      
      users.push(user);
      userRoleMapping.push({ userId: user.id, role: 'lider_comunidad', originalId: `test-leader-${i + 1}` });
      logProgress('Community Leaders', i + 1, communities.length, user.name);
      
      // Update community with leader_id
      community.leader_id = user.id;
    }
    
    // Step 6: Generate Students (remaining users)
    const remainingUsers = DATA_VOLUMES.users - users.length;
    console.log(`\n6. Creating ${remainingUsers} students...`);
    
    for (let i = 0; i < remainingUsers; i++) {
      const school = randomChoice(schools);
      const schoolGenerations = generations.filter(g => g.school_id === school.id);
      const generation = randomChoice(schoolGenerations);
      const communityOptions = communities.filter(c => c.generation_id === generation.id);
      const community = randomChoice(communityOptions);
      
      const user = createUser({
        id: `test-student-${i + 1}`,
        role: 'estudiante',
        name: generateSpanishName(),
        schools: [school],
        counter: ++userCounter,
        scenarios,
        schoolId: school.id,
        generationId: generation.id,
        communityId: community.id
      });
      
      users.push(user);
      userRoleMapping.push({ userId: user.id, role: 'estudiante', originalId: `test-student-${i + 1}` });
      
      if ((i + 1) % 50 === 0 || i === remainingUsers - 1) {
        logProgress('Students', i + 1, remainingUsers, user.name);
      }
    }
    
    // Step 7: Insert all users
    console.log('\n📥 Inserting users into database...');
    const userResults = await batchInsert(supabase, 'profiles', users);
    
    // Step 8: Create user roles (roles are stored separately from profiles)
    console.log('\n🎭 Assigning user roles...');
    const userRoles = [];
    
    for (const mapping of userRoleMapping) {
      const user = users.find(u => u.id === mapping.userId);
      
      // Handle organizational scope based on role requirements
      let scopeFields = {};
      
      if (mapping.role === 'supervisor_de_red') {
        // supervisor_de_red requires red_id and nulls for other scope fields
        scopeFields = {
          school_id: null,
          generation_id: null,
          community_id: null,
          red_id: generateUUID() // Create a test red_id
        };
      } else {
        // Other roles need at least one scope field (school_id works for all)
        scopeFields = {
          school_id: user.school_id || null,
          generation_id: null, // Schema mismatch - expects UUID
          community_id: null, // Schema mismatch - expects UUID  
          red_id: null
        };
      }
      
      userRoles.push({
        user_id: mapping.userId,
        role_type: mapping.role, // Correct column name
        assigned_at: user.created_at,
        assigned_by: null, // NULL for system-assigned during data seeding
        is_active: true,
        ...scopeFields
      });
    }
    
    console.log('⏳ Temporarily skipping roles to validate core user-community relationships');
    // const roleResults = await batchInsert(supabase, 'user_roles', userRoles);
    
    // Step 9: Update communities with leader assignments
    console.log('\n👑 Assigning community leaders...');
    for (const community of communities) {
      if (community.leader_id) {
        const { error } = await supabase
          .from('communities')
          .update({ leader_id: community.leader_id })
          .eq('id', community.id);
        
        if (error) {
          console.warn(`⚠️  Failed to assign leader to community ${community.id}:`, error.message);
        }
      }
    }
    
    // Generate summary report
    console.log('\n📊 User Generation Summary:');
    const roleCounts = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`   • Total Users: ${users.length}`);
    console.log(`   • Role Distribution: ${JSON.stringify(roleCounts, null, 4)}`);
    console.log(`   • Schools Covered: ${schools.length}`);
    console.log(`   • Communities with Leaders: ${communities.filter(c => c.leader_id).length}/${communities.length}`);
    
    // Engagement pattern distribution
    const engagementLevels = users.reduce((acc, user) => {
      const level = user.metadata.engagement_level;
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, {});
    
    console.log(`   • Engagement Levels: ${JSON.stringify(engagementLevels)}`);
    
    return userResults;
  } catch (error) {
    console.error('❌ User generation failed:', error.message);
    throw error;
  }
}

// Helper function to create a user with realistic attributes
function createUser({ id, role, name, schools, counter, scenarios, schoolId, generationId, communityId, networkScope }) {
  const email = generateEmail(name);
  const engagementLevel = getEngagementLevelForRole(role);
  const activityPattern = getActivityPatternForRole(role);
  
  const user = {
    id: generateUUID(), // Generate proper UUID for profiles table
    email,
    name: name, // Changed from full_name to name
    description: generateBio(role, name), // Changed from bio to description
    school_id: schoolId || (() => {
      const selectedSchool = randomChoice(schools);
      if (!selectedSchool || !selectedSchool.id) {
        console.error('❌ Selected school is invalid:', selectedSchool);
        console.error('Available schools:', schools.map(s => ({ id: s.id, name: s.name })));
        throw new Error('Selected school has no id property');
      }
      return selectedSchool.id;
    })(),
    generation_id: generationId || null, // FIXED: profiles table accepts INTEGER values
    community_id: communityId || null, // FIXED: profiles table accepts INTEGER values
    avatar_url: `https://avatar.vercel.sh/${encodeURIComponent(name)}`,
    approval_status: 'approved', // Set approved status for test data
    must_change_password: false,
    created_at: generateRandomDate('2023-01-01', '2024-02-01'),
    last_active_at: generateRandomDate('2024-01-01', '2024-07-24'),
    learning_preferences: {
      language: 'es',
      notifications: Math.random() > 0.2, // 80% enable notifications
      email_updates: Math.random() > 0.3, // 70% enable email updates
      theme: randomChoice(['light', 'dark', 'auto'])
    },
    notification_preferences: {
      progress_reminders: Math.random() > 0.3,
      assignment_notifications: Math.random() > 0.2,
      completion_notifications: Math.random() > 0.1
    }
  };
  
  return user;
}

// Helper functions for realistic user generation
function getEngagementLevelForRole(role) {
  const engagementMap = {
    'admin': randomChoice(['muy_alto', 'alto']),
    'consultor': randomChoice(['alto', 'muy_alto']),
    'supervisor_de_red': randomChoice(['alto', 'medio']),
    'docente': randomChoice(['alto', 'medio', 'bajo']),
    'lider_comunidad': randomChoice(['alto', 'medio']),
    'estudiante': randomChoice(['alto', 'medio', 'bajo', 'muy_bajo'])
  };
  
  return engagementMap[role] || 'medio';
}

function getActivityPatternForRole(role) {
  const patternMap = {
    'admin': 'business_hours', // 9-17 primary activity
    'consultor': 'flexible', // Varied hours
    'supervisor_de_red': 'business_hours',
    'docente': 'education_focused', // 8-16, some evening
    'lider_comunidad': 'evening_focused', // After school hours
    'estudiante': 'after_school' // 15-22 primary activity
  };
  
  return patternMap[role] || 'standard';
}

function generateBio(role, name) {
  const firstName = name.split(' ')[0];
  
  const bioTemplates = {
    'admin': [
      `${firstName} es administrador del sistema FNE LMS con experiencia en gestión educativa.`,
      `Profesional dedicado a la mejora continua de los procesos educativos en línea.`,
      `${firstName} supervisa la implementación de tecnologías educativas innovadoras.`
    ],
    'consultor': [
      `${firstName} es consultor pedagógico especializado en metodologías de aprendizaje colaborativo.`,
      `Experto en transformación educativa y desarrollo de comunidades de aprendizaje.`,
      `${firstName} acompaña procesos de innovación educativa en instituciones de la red FNE.`
    ],
    'supervisor_de_red': [
      `${firstName} supervisa múltiples establecimientos educacionales de la red FNE.`,
      `Profesional con amplia experiencia en gestión escolar y liderazgo educativo.`,
      `${firstName} coordina estrategias de mejoramiento educativo a nivel de red.`
    ],
    'docente': [
      `${firstName} es docente comprometido con la innovación educativa y el aprendizaje colaborativo.`,
      `Profesional de la educación enfocado en el desarrollo integral de sus estudiantes.`,
      `${firstName} integra tecnologías digitales para enriquecer la experiencia de aprendizaje.`
    ],
    'lider_comunidad': [
      `${firstName} lidera una comunidad de crecimiento, promoviendo la colaboración entre pares.`,
      `Estudiante líder comprometido con el desarrollo personal y comunitario.`,
      `${firstName} facilita espacios de aprendizaje colaborativo y apoyo mutuo.`
    ],
    'estudiante': [
      `${firstName} es estudiante activo en su comunidad de aprendizaje.`,
      `Joven comprometido con su desarrollo académico y personal.`,
      `${firstName} participa activamente en iniciativas colaborativas de su institución.`
    ]
  };
  
  const templates = bioTemplates[role] || bioTemplates['estudiante'];
  return randomChoice(templates);
}

function getJoiningScenario() {
  return randomChoice([
    'early_adopter', // Joined in first wave
    'gradual_adopter', // Joined after seeing peers
    'mandatory_migration', // Required by institution
    'peer_referred', // Invited by colleague/friend
    'institutional_rollout' // Part of school-wide implementation
  ]);
}

function getLoginFrequency(engagementLevel) {
  const frequencyMap = {
    'muy_alto': randomBetween(5, 7), // Days per week
    'alto': randomBetween(3, 5),
    'medio': randomBetween(2, 4),
    'bajo': randomBetween(1, 3),
    'muy_bajo': randomBetween(0, 2)
  };
  
  return frequencyMap[engagementLevel] || 2;
}

function getAgeGroupForRole(role) {
  const ageMap = {
    'admin': randomChoice(['30-40', '40-50', '50-60']),
    'consultor': randomChoice(['35-45', '45-55', '55-65']),
    'supervisor_de_red': randomChoice(['40-50', '50-60']),
    'docente': randomChoice(['25-35', '35-45', '45-55']),
    'lider_comunidad': randomChoice(['16-18', '18-20']),
    'estudiante': randomChoice(['14-16', '16-18', '18-20'])
  };
  
  return ageMap[role] || '18-25';
}

module.exports = { generateUsers };