/**
 * FNE LMS Data Seeding - Activity Generator
 * 
 * Generates realistic collaborative workspace activity with temporal patterns,
 * community-specific behaviors, and authentic interaction patterns
 */

const { logProgress, batchInsert, generateRandomDate, randomBetween, randomChoice } = require('../utils/database');

async function generateActivity(supabase, scenarios, generatedData) {
  console.log('💬 Generating collaborative activity...');
  
  const { DATA_VOLUMES, ACTIVITY_TYPES, TEMPORAL_PATTERNS } = scenarios;
  const users = generatedData.users || [];
  const communities = generatedData.organizations?.communities || [];
  const courses = generatedData.courses?.courses || [];
  
  if (users.length === 0 || communities.length === 0) {
    throw new Error('Users and communities must be generated first');
  }
  
  const activities = [];
  const activityParticipants = [];
  
  try {
    console.log(`\n📊 Creating ${DATA_VOLUMES.activities} activities over 6 months...`);
    
    // Generate activities across 6-month timespan
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 6);
    
    // Pre-calculate community members for efficiency
    const communityMembers = new Map();
    for (const community of communities) {
      const members = users.filter(u => u.community_id === community.id);
      communityMembers.set(community.id, members);
    }
    
    // Generate activities in chronological order for realistic patterns
    for (let i = 0; i < DATA_VOLUMES.activities; i++) {
      // Select random timestamp within 6-month range
      const activityDate = generateRandomDate(startDate.toISOString(), endDate.toISOString());
      
      // Apply temporal patterns (seasonal, weekly, daily)
      const intensityMultiplier = scenarios.getActivityIntensity(activityDate);
      if (Math.random() > intensityMultiplier && Math.random() > 0.3) {
        continue; // Skip this activity based on temporal patterns
      }
      
      // Select community based on health score (healthier communities have more activity)
      const community = selectCommunityByHealth(communities);
      const members = communityMembers.get(community.id);
      
      if (!members || members.length === 0) {
        continue; // Skip if no members
      }
      
      // Get scenario configuration for this community
      const scenarioName = community.metadata.scenario;
      const scenarioConfig = scenarios.SCENARIOS[scenarioName] || scenarios.SCENARIOS.average;
      
      // Select activity type based on scenario behavior patterns
      const activityType = selectActivityType(scenarioConfig, ACTIVITY_TYPES);
      const primaryUser = randomChoice(members);
      
      // Generate activity based on type
      const activity = await generateActivityByType({
        id: `test-activity-${activities.length + 1}`,
        type: activityType,
        primaryUser,
        community,
        members,
        courses,
        activityDate,
        scenarioConfig,
        scenarios
      });
      
      if (activity) {
        activities.push(activity);
        
        // Generate participants for collaborative activities
        if (activity.participant_count > 1) {
          const participants = generateActivityParticipants(
            activity.id,
            primaryUser,
            members,
            activity.participant_count
          );
          activityParticipants.push(...participants);
        }
      }
      
      // Progress logging every 250 activities
      if ((activities.length % 250) === 0 || i === DATA_VOLUMES.activities - 1) {
        logProgress('Activities', activities.length, DATA_VOLUMES.activities, 
          `${activityType} in ${community.name}`);
      }
    }
    
    console.log(`\n📥 Generated ${activities.length} activities, inserting to database...`);
    
    // Insert activities in batches
    const activityResults = await batchInsert(supabase, 'activity_feed', activities, 200);
    
    // Insert activity participants
    if (activityParticipants.length > 0) {
      console.log(`\n👥 Inserting ${activityParticipants.length} activity participants...`);
      await batchInsert(supabase, 'activity_participants', activityParticipants, 300);
    }
    
    // Generate summary report
    console.log('\n📊 Activity Generation Summary:');
    console.log(`   • Total Activities: ${activities.length}`);
    console.log(`   • Activity Participants: ${activityParticipants.length}`);
    
    // Activity type distribution
    const typeDistribution = activities.reduce((acc, activity) => {
      acc[activity.activity_type] = (acc[activity.activity_type] || 0) + 1;
      return acc;
    }, {});
    console.log(`   • Type Distribution: ${JSON.stringify(typeDistribution)}`);
    
    // Community activity distribution
    const communityDistribution = activities.reduce((acc, activity) => {
      const communityName = activity.metadata.community_name;
      acc[communityName] = (acc[communityName] || 0) + 1;
      return acc;
    }, {});
    
    const topCommunities = Object.entries(communityDistribution)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    console.log(`   • Top 5 Active Communities:`);
    topCommunities.forEach(([name, count]) => {
      console.log(`     - ${name}: ${count} activities`);
    });
    
    // Temporal distribution
    const monthlyDistribution = activities.reduce((acc, activity) => {
      const month = new Date(activity.created_at).toISOString().substring(0, 7);
      acc[month] = (acc[month] || 0) + 1;
      return acc;
    }, {});
    console.log(`   • Monthly Distribution: ${JSON.stringify(monthlyDistribution)}`);
    
    return {
      activities: activityResults,
      participants: activityParticipants.length
    };
  } catch (error) {
    console.error('❌ Activity generation failed:', error.message);
    throw error;
  }
}

// Select community weighted by health score (healthier = more active)
function selectCommunityByHealth(communities) {
  const weights = communities.map(c => ({
    community: c,
    weight: Math.max(1, c.health_score / 20) // Min weight 1, max weight 5
  }));
  
  const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { community, weight } of weights) {
    random -= weight;
    if (random <= 0) {
      return community;
    }
  }
  
  return communities[0]; // Fallback
}

// Select activity type based on scenario behavior patterns
function selectActivityType(scenarioConfig, activityTypes) {
  const behaviorWeights = {
    message: scenarioConfig.userBehaviors.messageFrequency === 'high' ? 1.5 : 
             scenarioConfig.userBehaviors.messageFrequency === 'moderate' ? 1.0 : 0.5,
    document_share: scenarioConfig.userBehaviors.documentSharing === 'frequent' ? 1.3 : 
                   scenarioConfig.userBehaviors.documentSharing === 'occasional' ? 1.0 : 0.3,
    meeting: scenarioConfig.userBehaviors.meetingAttendance === 'excellent' ? 1.4 : 
             scenarioConfig.userBehaviors.meetingAttendance === 'good' ? 1.0 : 0.4,
    mention: 1.0, // Base weight for mentions
    collaboration: scenarioConfig.userBehaviors.peerMentoring === 'active' ? 1.6 : 
                  scenarioConfig.userBehaviors.peerMentoring === 'limited' ? 1.0 : 0.2
  };
  
  const weightedTypes = Object.entries(activityTypes).map(([type, config]) => ({
    type,
    weight: config.weight * (behaviorWeights[type] || 1.0)
  }));
  
  const totalWeight = weightedTypes.reduce((sum, t) => sum + t.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const { type, weight } of weightedTypes) {
    random -= weight;
    if (random <= 0) {
      return type;
    }
  }
  
  return 'message'; // Fallback
}

// Generate specific activity based on type
async function generateActivityByType({ id, type, primaryUser, community, members, courses, activityDate, scenarioConfig, scenarios }) {
  const baseActivity = {
    id,
    user_id: primaryUser.id,
    workspace_id: community.id,
    activity_type: type,
    created_at: activityDate,
    metadata: {
      test_data: 'true',
      community_name: community.name,
      scenario: community.metadata.scenario,
      user_role: primaryUser.role,
      engagement_level: primaryUser.metadata.engagement_level
    }
  };
  
  switch (type) {
    case 'message':
      return {
        ...baseActivity,
        title: generateMessageTitle(),
        description: generateMessageContent(community.metadata.scenario),
        content: generateDetailedMessageContent(primaryUser, community),
        participant_count: 1 + (Math.random() > 0.7 ? randomBetween(1, 3) : 0), // 30% get responses
        metadata: {
          ...baseActivity.metadata,
          message_type: randomChoice(['question', 'sharing', 'support', 'announcement']),
          urgency: randomChoice(['low', 'medium', 'high']),
          response_rate: scenarioConfig.characteristics.collaborationIndex.min / 100
        }
      };
      
    case 'document_share':
      return {
        ...baseActivity,
        title: generateDocumentTitle(),
        description: generateDocumentDescription(),
        content: generateDocumentDetails(),
        participant_count: randomBetween(1, Math.min(8, members.length)),
        metadata: {
          ...baseActivity.metadata,
          document_type: randomChoice(['presentation', 'worksheet', 'research', 'template']),
          file_format: randomChoice(['pdf', 'docx', 'pptx', 'xlsx']),
          download_count: randomBetween(0, members.length),
          collaboration_level: randomChoice(['individual', 'small_group', 'community_wide'])
        }
      };
      
    case 'meeting':
      return {
        ...baseActivity,
        title: generateMeetingTitle(),
        description: generateMeetingDescription(),
        content: generateMeetingContent(community),
        participant_count: randomBetween(3, Math.min(15, members.length)),
        metadata: {
          ...baseActivity.metadata,
          meeting_type: randomChoice(['study_group', 'project_work', 'discussion', 'presentation']),
          duration_minutes: randomBetween(30, 120),
          attendance_rate: scenarioConfig.userBehaviors.meetingAttendance === 'excellent' ? randomBetween(80, 100) : 
                          scenarioConfig.userBehaviors.meetingAttendance === 'good' ? randomBetween(60, 85) : randomBetween(30, 65),
          recording_available: Math.random() > 0.4 // 60% recorded
        }
      };
      
    case 'mention':
      const mentionedUser = randomChoice(members.filter(m => m.id !== primaryUser.id));
      return {
        ...baseActivity,
        title: `${primaryUser.full_name} mencionó a ${mentionedUser.full_name}`,
        description: generateMentionDescription(primaryUser, mentionedUser),
        content: generateMentionContent(),
        participant_count: 2,
        metadata: {
          ...baseActivity.metadata,
          mentioned_user_id: mentionedUser.id,
          mention_type: randomChoice(['recognition', 'question', 'collaboration', 'support']),
          context: randomChoice(['course_work', 'community_discussion', 'project', 'general'])
        }
      };
      
    case 'collaboration':
      return {
        ...baseActivity,
        title: generateCollaborationTitle(),
        description: generateCollaborationDescription(),
        content: generateCollaborationContent(courses),
        participant_count: randomBetween(2, Math.min(6, members.length)),
        metadata: {
          ...baseActivity.metadata,
          collaboration_type: randomChoice(['project', 'study_group', 'peer_review', 'mentoring']),
          project_status: randomChoice(['planning', 'in_progress', 'completed']),
          cross_community: Math.random() > 0.8, // 20% cross-community
          skills_shared: generateSkillsShared()
        }
      };
      
    default:
      return baseActivity;
  }
}

// Generate activity participants
function generateActivityParticipants(activityId, primaryUser, communityMembers, participantCount) {
  const participants = [{ // Primary user is always a participant
    id: `test-participant-${activityId}-1`,
    activity_id: activityId,
    user_id: primaryUser.id,
    role: 'organizer',
    joined_at: new Date().toISOString(),
    metadata: { test_data: 'true' }
  }];
  
  // Add additional participants
  const otherMembers = communityMembers.filter(m => m.id !== primaryUser.id);
  const selectedMembers = [];
  
  for (let i = 1; i < participantCount && selectedMembers.length < otherMembers.length; i++) {
    let member;
    do {
      member = randomChoice(otherMembers);
    } while (selectedMembers.includes(member.id));
    
    selectedMembers.push(member.id);
    
    participants.push({
      id: `test-participant-${activityId}-${i + 1}`,
      activity_id: activityId,
      user_id: member.id,
      role: randomChoice(['participant', 'contributor', 'observer']),
      joined_at: new Date(Date.now() + (i * 60000)).toISOString(), // Stagger join times
      metadata: { test_data: 'true' }
    });
  }
  
  return participants;
}

// Content generation functions
function generateMessageTitle() {
  const titles = [
    'Consulta sobre el proyecto',
    'Compartiendo recursos útiles',
    'Dudas sobre la tarea',
    'Propuesta de trabajo colaborativo',
    'Reflexión sobre el tema de hoy',
    'Solicitud de ayuda',
    'Compartiendo experiencia'
  ];
  return randomChoice(titles);
}

function generateMessageContent(scenario) {
  const templates = {
    highPerformance: [
      'Compartiendo estrategias avanzadas para optimizar nuestro proyecto colaborativo.',
      'Propongo crear un grupo de estudio para profundizar en los temas más desafiantes.',
      'He encontrado recursos adicionales que pueden enriquecer nuestro aprendizaje.'
    ],
    average: [
      'Tengo algunas dudas sobre la tarea, ¿alguien me puede ayudar?',
      'Compartiendo lo que aprendí en la clase de hoy.',
      '¿Alguien quiere formar un grupo de estudio?'
    ],
    struggling: [
      'Estoy teniendo dificultades con este tema, ¿pueden ayudarme?',
      'No entendí bien la explicación, ¿alguien me puede explicar?',
      'Necesito ayuda para organizar mi tiempo de estudio.'
    ],
    inactive: [
      '¿Hay alguien activo en este grupo?',
      'Estoy intentando ponerme al día con las tareas.',
      '¿Qué temas estamos viendo actualmente?'
    ]
  };
  
  const options = templates[scenario] || templates.average;
  return randomChoice(options);
}

function generateDetailedMessageContent(user, community) {
  return `Mensaje de ${user.full_name} en ${community.name}: Contenido detallado del mensaje con contexto educativo específico.`;
}

function generateDocumentTitle() {
  const titles = [
    'Apuntes de la clase magistral',
    'Presentación del proyecto grupal',
    'Recursos complementarios',
    'Plantilla para el ensayo',
    'Resumen del capítulo estudiado',
    'Guía de estudio para el examen',
    'Material de apoyo pedagógico'
  ];
  return randomChoice(titles);
}

function generateDocumentDescription() {
  return 'Documento compartido con la comunidad para apoyo en actividades académicas y colaboración educativa.';
}

function generateDocumentDetails() {
  return 'Detalles del documento incluyendo objetivos de aprendizaje, contenido principal y sugerencias de uso.';
}

function generateMeetingTitle() {
  const titles = [
    'Sesión de estudio grupal',
    'Revisión del proyecto colaborativo',
    'Discusión sobre lecturas asignadas',
    'Preparación para evaluación',
    'Sesión de tutorías entre pares',
    'Presentación de avances',
    'Círculo de reflexión pedagógica'
  ];
  return randomChoice(titles);
}

function generateMeetingDescription() {
  return 'Encuentro virtual para colaboración académica, intercambio de ideas y apoyo mutuo en el proceso de aprendizaje.';
}

function generateMeetingContent(community) {
  return `Reunión de ${community.name} con agenda educativa enfocada en objetivos de aprendizaje colaborativo.`;
}

function generateMentionDescription(fromUser, toUser) {
  const contexts = [
    'reconocimiento por contribución valiosa',
    'solicitud de opinión especializada',
    'invitación a colaborar en proyecto',
    'agradecimiento por apoyo brindado',
    'consulta sobre expertise específico'
  ];
  
  return `${fromUser.full_name} mencionó a ${toUser.full_name} en contexto de ${randomChoice(contexts)}.`;
}

function generateMentionContent() {
  return 'Contenido de la mención con contexto específico de la interacción entre usuarios.';
}

function generateCollaborationTitle() {
  const titles = [
    'Proyecto de investigación grupal',
    'Iniciativa de mejoramiento educativo',
    'Desarrollo de recursos didácticos',
    'Programa de mentorías peer-to-peer',
    'Creación de contenido colaborativo',
    'Grupo de trabajo temático',
    'Red de apoyo académico'
  ];
  return randomChoice(titles);
}

function generateCollaborationDescription() {
  return 'Iniciativa colaborativa para el desarrollo de competencias y logro de objetivos de aprendizaje compartidos.';
}

function generateCollaborationContent(courses) {
  const course = randomChoice(courses);
  return `Colaboración académica relacionada con ${course.title} y objetivos de aprendizaje específicos.`;
}

function generateSkillsShared() {
  const skills = [
    'investigación académica',
    'presentación oral',
    'redacción académica',
    'análisis crítico',
    'trabajo en equipo',
    'liderazgo educativo',
    'competencias digitales',
    'pensamiento creativo'
  ];
  
  return skills.slice(0, randomBetween(1, 3));
}

module.exports = { generateActivity };