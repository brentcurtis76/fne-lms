/**
 * Genera Data Seeding - Test Scenarios Configuration
 * 
 * Defines realistic test scenarios, data volumes, and patterns for comprehensive
 * dashboard validation across all user personas and community health states
 */

// Core data volumes for test generation
const DATA_VOLUMES = {
  users: 500,
  schools: 12,
  generations: 24, // 2 per school
  communities: 48, // 2 per generation
  courses: 75,
  activities: 2500,
  timespan: '6 months', // Historical data range
  
  // Role distribution
  admins: 5,
  consultors: 10,
  supervisors: 8,
  teachers: 50,
  community_leaders: 48, // 1 per community
  students: 379 // Remaining users
};

// Community health scenarios with specific characteristics
const SCENARIOS = {
  // Scenario 1: High-Performance Community (20% of communities)
  highPerformance: {
    weight: 0.20,
    characteristics: {
      completionRate: { min: 85, max: 95 },
      dailyActivity: { min: 15, max: 25 }, // interactions per day
      collaborationIndex: { min: 80, max: 95 },
      healthScore: { min: 90, max: 100 },
      userEngagement: { min: 85, max: 95 },
      crossCommunityActivity: { min: 60, max: 80 }
    },
    activityPatterns: {
      peakHours: [9, 10, 14, 15, 20], // Hours with highest activity
      weekendActivity: 0.3, // 30% of weekday activity
      seasonality: {
        summer: 0.6, // 40% reduction in summer
        term: 1.2, // 20% increase during active terms
        holidays: 0.2 // Major activity drop during holidays
      }
    },
    userBehaviors: {
      messageFrequency: 'high',
      documentSharing: 'frequent',
      meetingAttendance: 'excellent',
      peerMentoring: 'active'
    }
  },

  // Scenario 2: Average Performance Community (60% of communities)
  average: {
    weight: 0.60,
    characteristics: {
      completionRate: { min: 60, max: 80 },
      dailyActivity: { min: 8, max: 15 },
      collaborationIndex: { min: 50, max: 75 },
      healthScore: { min: 65, max: 85 },
      userEngagement: { min: 60, max: 80 },
      crossCommunityActivity: { min: 30, max: 60 }
    },
    activityPatterns: {
      peakHours: [10, 15, 19], 
      weekendActivity: 0.15,
      seasonality: {
        summer: 0.4,
        term: 1.1,
        holidays: 0.1
      }
    },
    userBehaviors: {
      messageFrequency: 'moderate',
      documentSharing: 'occasional',
      meetingAttendance: 'good',
      peerMentoring: 'limited'
    }
  },

  // Scenario 3: Struggling Community (15% of communities)
  struggling: {
    weight: 0.15,
    characteristics: {
      completionRate: { min: 20, max: 45 },
      dailyActivity: { min: 2, max: 8 },
      collaborationIndex: { min: 15, max: 40 },
      healthScore: { min: 25, max: 50 },
      userEngagement: { min: 25, max: 50 },
      crossCommunityActivity: { min: 5, max: 25 }
    },
    activityPatterns: {
      peakHours: [15], // Very limited peak activity
      weekendActivity: 0.05,
      seasonality: {
        summer: 0.2,
        term: 0.9,
        holidays: 0.05
      }
    },
    userBehaviors: {
      messageFrequency: 'low',
      documentSharing: 'rare',
      meetingAttendance: 'poor',
      peerMentoring: 'minimal'
    }
  },

  // Scenario 4: Inactive/Dormant Community (5% of communities)
  inactive: {
    weight: 0.05,
    characteristics: {
      completionRate: { min: 0, max: 20 },
      dailyActivity: { min: 0, max: 3 },
      collaborationIndex: { min: 0, max: 15 },
      healthScore: { min: 0, max: 25 },
      userEngagement: { min: 0, max: 25 },
      crossCommunityActivity: { min: 0, max: 10 }
    },
    activityPatterns: {
      peakHours: [], // No consistent peak hours
      weekendActivity: 0.02,
      seasonality: {
        summer: 0.1,
        term: 0.5,
        holidays: 0.01
      }
    },
    userBehaviors: {
      messageFrequency: 'minimal',
      documentSharing: 'none',
      meetingAttendance: 'absent',
      peerMentoring: 'none'
    }
  }
};

// Activity type definitions for realistic simulation
const ACTIVITY_TYPES = {
  message: {
    weight: 0.35,
    description: 'Community discussions and peer support',
    avgLength: 150, // characters
    responseRate: 0.3 // 30% of messages get responses
  },
  document_share: {
    weight: 0.25,
    description: 'Resource exchanges and collaboration',
    avgSize: '2MB',
    downloadRate: 0.6 // 60% of shared docs are downloaded
  },
  meeting: {
    weight: 0.15,
    description: 'Virtual sessions with attendance tracking',
    avgDuration: 45, // minutes
    attendanceRate: 0.7 // 70% average attendance
  },
  mention: {
    weight: 0.15,
    description: 'User interactions and recognition',
    responseRate: 0.8 // 80% of mentions get acknowledged
  },
  collaboration: {
    weight: 0.10,
    description: 'Cross-community project work',
    avgParticipants: 4,
    completionRate: 0.75 // 75% of collaborative projects complete
  }
};

// Spanish names and locations for realistic test data
const SPANISH_DATA = {
  schools: [
    'Colegio San Miguel', 'Instituto La Esperanza', 'Escuela Nuestra Señora de Fátima',
    'Colegio San José', 'Instituto Santa María', 'Escuela San Francisco',
    'Colegio La Inmaculada', 'Instituto San Antonio', 'Escuela Santa Teresa',
    'Colegio San Rafael', 'Instituto San Juan', 'Escuela San Pedro'
  ],
  
  cities: [
    'Santiago', 'Valparaíso', 'Concepción', 'Temuco', 'Antofagasta', 'Iquique',
    'La Serena', 'Rancagua', 'Talca', 'Chillán', 'Puerto Montt', 'Punta Arenas'
  ],
  
  firstNames: [
    'María', 'Ana', 'Carmen', 'Francisca', 'Javiera', 'José', 'Carlos', 'Luis',
    'Miguel', 'Juan', 'Pedro', 'Diego', 'Sebastián', 'Matías', 'Nicolás',
    'Valentina', 'Sofía', 'Isidora', 'Constanza', 'Fernanda', 'Martina'
  ],
  
  lastNames: [
    'González', 'Rodríguez', 'Muñoz', 'López', 'García', 'Martínez', 'Sánchez',
    'Rojas', 'Díaz', 'Pérez', 'Contreras', 'Silva', 'Sepúlveda', 'Morales',
    'Espinoza', 'Araya', 'Herrera', 'Castillo', 'Vargas', 'Tapia'
  ],
  
  courses: [
    'Matemáticas Aplicadas', 'Lengua y Literatura', 'Historia de Chile',
    'Ciencias Naturales', 'Física Moderna', 'Química Orgánica',
    'Biología Celular', 'Educación Cívica', 'Filosofía Contemporánea',
    'Arte y Cultura', 'Música y Expresión', 'Educación Física'
  ]
};

// Time-based patterns for realistic activity generation
const TEMPORAL_PATTERNS = {
  schoolYear: {
    // Chilean school year pattern
    activePeriods: [
      { start: '2024-03-01', end: '2024-07-15', intensity: 1.0 },
      { start: '2024-08-01', end: '2024-12-15', intensity: 1.0 }
    ],
    vacationPeriods: [
      { start: '2024-01-01', end: '2024-02-28', intensity: 0.1 },
      { start: '2024-07-16', end: '2024-07-31', intensity: 0.3 },
      { start: '2024-12-16', end: '2024-12-31', intensity: 0.1 }
    ]
  },
  
  weeklyPattern: {
    monday: 0.9,
    tuesday: 1.0,
    wednesday: 1.1, // Peak day
    thursday: 1.0,
    friday: 0.8,
    saturday: 0.2,
    sunday: 0.1
  },
  
  dailyPattern: {
    0: 0.1, 1: 0.05, 2: 0.05, 3: 0.05, 4: 0.05, 5: 0.05,
    6: 0.1, 7: 0.3, 8: 0.6, 9: 0.9, 10: 1.0, 11: 0.8,
    12: 0.4, 13: 0.3, 14: 0.7, 15: 1.0, 16: 0.9, 17: 0.7,
    18: 0.5, 19: 0.8, 20: 1.0, 21: 0.9, 22: 0.6, 23: 0.3
  }
};

// Export configuration object
module.exports = {
  DATA_VOLUMES,
  SCENARIOS,
  ACTIVITY_TYPES,
  SPANISH_DATA,
  TEMPORAL_PATTERNS,
  
  // Utility functions
  getRandomElement: (array) => array[Math.floor(Math.random() * array.length)],
  
  getRandomRange: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
  
  getScenarioByWeight: () => {
    const rand = Math.random();
    let cumulative = 0;
    
    for (const [scenarioName, scenario] of Object.entries(SCENARIOS)) {
      cumulative += scenario.weight;
      if (rand <= cumulative) {
        return { name: scenarioName, config: scenario };
      }
    }
    
    // Fallback to average scenario
    return { name: 'average', config: SCENARIOS.average };
  },
  
  // Calculate activity intensity based on time patterns
  getActivityIntensity: (date) => {
    const dayOfWeek = date.toLocaleLowerCase();
    const hour = date.getHours();
    const month = date.getMonth() + 1;
    
    let intensity = 1.0;
    
    // Apply weekly pattern
    if (TEMPORAL_PATTERNS.weeklyPattern[dayOfWeek]) {
      intensity *= TEMPORAL_PATTERNS.weeklyPattern[dayOfWeek];
    }
    
    // Apply daily pattern
    if (TEMPORAL_PATTERNS.dailyPattern[hour]) {
      intensity *= TEMPORAL_PATTERNS.dailyPattern[hour];
    }
    
    // Apply seasonal adjustments (simplified)
    if (month >= 6 && month <= 8) { // Chilean winter/vacation
      intensity *= 0.4;
    } else if (month >= 12 || month <= 2) { // Summer vacation
      intensity *= 0.2;
    }
    
    return Math.max(0.01, intensity); // Minimum 1% activity
  }
};