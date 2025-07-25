/**
 * FNE LMS Data Seeding - Courses Generator
 * 
 * Generates realistic course content with varied difficulty levels,
 * assignments, and enrollment patterns matching educational contexts
 */

const { logProgress, batchInsert, generateRandomDate, randomBetween, randomChoice } = require('../utils/database');

async function generateCourses(supabase, scenarios, generatedData) {
  console.log('📚 Generating learning content...');
  
  const { DATA_VOLUMES, SPANISH_DATA } = scenarios;
  const users = generatedData.users || [];
  const schools = generatedData.organizations?.schools || [];
  
  if (users.length === 0 || schools.length === 0) {
    throw new Error('Users and schools must be generated first');
  }
  
  const generatedCourses = {
    courses: [],
    enrollments: [],
    assignments: []
  };
  
  try {
    // Step 1: Generate Courses
    console.log('\n1. Creating courses...');
    const courses = [];
    const teachers = users.filter(u => u.role === 'docente');
    
    const courseTemplates = [
      {
        subject: 'Matemáticas',
        topics: ['Álgebra Básica', 'Geometría', 'Estadística y Probabilidad', 'Cálculo Diferencial'],
        difficulty: ['básico', 'intermedio', 'avanzado'],
        duration_weeks: [8, 12, 16]
      },
      {
        subject: 'Lengua y Literatura',
        topics: ['Comprensión Lectora', 'Expresión Escrita', 'Literatura Chilena', 'Análisis Textual'],
        difficulty: ['básico', 'intermedio', 'avanzado'],
        duration_weeks: [6, 10, 14]
      },
      {
        subject: 'Historia y Geografía',
        topics: ['Historia de Chile', 'Historia Universal', 'Geografía Física', 'Educación Cívica'],
        difficulty: ['básico', 'intermedio'],
        duration_weeks: [8, 12]
      },
      {
        subject: 'Ciencias Naturales',
        topics: ['Biología Celular', 'Física General', 'Química Orgánica', 'Medio Ambiente'],
        difficulty: ['básico', 'intermedio', 'avanzado'],
        duration_weeks: [10, 14, 18]
      },
      {
        subject: 'Tecnología',
        topics: ['Programación Básica', 'Diseño Digital', 'Robótica', 'Innovación Tecnológica'],
        difficulty: ['básico', 'intermedio', 'avanzado'],
        duration_weeks: [6, 8, 12]
      },
      {
        subject: 'Arte y Cultura',
        topics: ['Historia del Arte', 'Expresión Artística', 'Música', 'Teatro y Danza'],
        difficulty: ['básico', 'intermedio'],
        duration_weeks: [6, 10]
      }
    ];
    
    for (let i = 0; i < DATA_VOLUMES.courses; i++) {
      const template = randomChoice(courseTemplates);
      const topic = randomChoice(template.topics);
      const difficulty = randomChoice(template.difficulty);
      const duration = randomChoice(template.duration_weeks);
      const teacher = randomChoice(teachers);
      
      const course = {
        id: `test-course-${i + 1}`,
        title: `${topic} - ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`,
        description: generateCourseDescription(template.subject, topic, difficulty),
        subject: template.subject,
        level: difficulty,
        teacher_id: teacher.id,
        school_id: teacher.school_id,
        duration_weeks: duration,
        total_lessons: randomBetween(8, 24),
        estimated_hours: duration * randomBetween(2, 6), // 2-6 hours per week
        difficulty_score: getDifficultyScore(difficulty),
        tags: generateCourseTags(template.subject, topic),
        status: 'published',
        enrollment_capacity: randomBetween(20, 40),
        prerequisites: difficulty === 'avanzado' ? getPrerequisites(template.subject) : null,
        learning_objectives: generateLearningObjectives(topic, difficulty),
        assessment_methods: generateAssessmentMethods(),
        created_at: generateRandomDate('2023-06-01', '2024-01-01'),
        start_date: generateRandomDate('2024-03-01', '2024-08-01'),
        end_date: null, // Will be calculated based on start_date + duration
        metadata: {
          test_data: 'true',
          course_scenario: getScenarioForCourse(difficulty),
          engagement_prediction: randomBetween(60, 95),
          completion_target: getCompletionTarget(difficulty),
          collaboration_required: Math.random() > 0.3, // 70% require collaboration
          technology_requirements: getTechnologyRequirements(template.subject),
          content_format: randomChoice(['mixed', 'video_heavy', 'text_heavy', 'interactive'])
        }
      };
      
      // Calculate end date
      const startDate = new Date(course.start_date);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + (duration * 7));
      course.end_date = endDate.toISOString().split('T')[0];
      
      courses.push(course);
      logProgress('Courses', i + 1, DATA_VOLUMES.courses, course.title);
    }
    
    const courseResults = await batchInsert(supabase, 'courses', courses);
    generatedCourses.courses = courseResults;
    
    // Step 2: Generate Course Enrollments
    console.log('\n2. Creating course enrollments...');
    const enrollments = [];
    const students = users.filter(u => u.role === 'estudiante' || u.role === 'lider_comunidad');
    
    // Each student enrolls in 2-5 courses
    for (const student of students) {
      const numCourses = randomBetween(2, 5);
      const availableCourses = courses.filter(c => 
        c.school_id === student.school_id || Math.random() > 0.7 // 30% can take courses from other schools
      );
      
      const selectedCourses = [];
      for (let i = 0; i < numCourses && selectedCourses.length < availableCourses.length; i++) {
        let course;
        do {
          course = randomChoice(availableCourses);
        } while (selectedCourses.includes(course.id));
        
        selectedCourses.push(course.id);
        
        const enrollment = {
          id: `test-enrollment-${enrollments.length + 1}`,
          user_id: student.id,
          course_id: course.id,
          enrolled_at: generateRandomDate(course.start_date, new Date().toISOString().split('T')[0]),
          status: getEnrollmentStatus(),
          progress_percentage: 0, // Will be updated by progress generator
          expected_completion: course.end_date,
          motivation_level: randomChoice(['alto', 'medio', 'bajo']),
          study_time_per_week: randomBetween(1, 8),
          metadata: {
            test_data: 'true',
            enrollment_method: randomChoice(['self_enrolled', 'teacher_assigned', 'required', 'recommended']),
            learning_style: randomChoice(['visual', 'auditivo', 'kinestésico', 'mixed']),
            goals: generateStudentGoals(),
            support_needed: randomChoice(['bajo', 'medio', 'alto'])
          }
        };
        
        enrollments.push(enrollment);
      }
    }
    
    console.log(`   Creating ${enrollments.length} enrollments for ${students.length} students...`);
    const enrollmentResults = await batchInsert(supabase, 'course_enrollments', enrollments, 200);
    generatedCourses.enrollments = enrollmentResults;
    
    // Step 3: Generate Assignments
    console.log('\n3. Creating assignments...');
    const assignments = [];
    
    for (const course of courses) {
      const numAssignments = randomBetween(3, 8);
      
      for (let i = 0; i < numAssignments; i++) {
        const assignment = {
          id: `test-assignment-${assignments.length + 1}`,
          course_id: course.id,
          title: generateAssignmentTitle(course.subject, i + 1),
          description: generateAssignmentDescription(course.subject, course.level),
          type: randomChoice(['individual', 'group', 'peer_review', 'project']),
          max_score: randomChoice([10, 20, 50, 100]),
          due_date: generateAssignmentDueDate(course.start_date, course.end_date, i, numAssignments),
          instructions: generateAssignmentInstructions(course.subject),
          submission_format: randomChoice(['text', 'file_upload', 'video', 'presentation', 'mixed']),
          collaboration_allowed: Math.random() > 0.4, // 60% allow collaboration
          peer_review_required: Math.random() > 0.7, // 30% require peer review
          estimated_time_hours: randomBetween(2, 12),
          weight_percentage: Math.round(100 / numAssignments), // Distribute evenly
          status: 'published',
          created_at: generateRandomDate(course.created_at, course.start_date),
          metadata: {
            test_data: 'true',
            difficulty_level: getDifficultyLevel(course.level, i, numAssignments),
            skills_assessed: generateAssessedSkills(course.subject),
            rubric_criteria: generateRubricCriteria(),
            late_submission_policy: randomChoice(['penalty', 'no_penalty', 'not_allowed']),
            feedback_type: randomChoice(['automated', 'teacher', 'peer', 'mixed'])
          }
        };
        
        assignments.push(assignment);
      }
      
      logProgress('Assignments', courses.indexOf(course) + 1, courses.length, 
        `${course.title} - ${numAssignments} assignments`);
    }
    
    const assignmentResults = await batchInsert(supabase, 'assignments', assignments, 150);
    generatedCourses.assignments = assignmentResults;
    
    // Generate summary report
    console.log('\n📊 Course Content Summary:');
    console.log(`   • Courses: ${courses.length}`);
    console.log(`   • Enrollments: ${enrollments.length}`);
    console.log(`   • Assignments: ${assignments.length}`);
    
    // Subject distribution
    const subjectCounts = courses.reduce((acc, course) => {
      acc[course.subject] = (acc[course.subject] || 0) + 1;
      return acc;
    }, {});
    console.log(`   • Subject Distribution: ${JSON.stringify(subjectCounts)}`);
    
    // Difficulty distribution
    const difficultyCount = courses.reduce((acc, course) => {
      acc[course.level] = (acc[course.level] || 0) + 1;
      return acc;
    }, {});
    console.log(`   • Difficulty Levels: ${JSON.stringify(difficultyCount)}`);
    
    // Average enrollments per course
    const avgEnrollments = Math.round(enrollments.length / courses.length);
    console.log(`   • Average Enrollments per Course: ${avgEnrollments}`);
    
    return generatedCourses;
  } catch (error) {
    console.error('❌ Course generation failed:', error.message);
    throw error;
  }
}

// Helper functions for course generation
function generateCourseDescription(subject, topic, difficulty) {
  const templates = {
    'Matemáticas': `Curso de ${topic} nivel ${difficulty} que desarrolla habilidades fundamentales en matemáticas aplicadas a contextos reales y educativos.`,
    'Lengua y Literatura': `Desarrolla competencias en ${topic} a través de metodologías interactivas y análisis crítico de textos contemporáneos.`,
    'Historia y Geografía': `Explora ${topic} con enfoque en la comprensión de procesos históricos y geográficos relevantes para Chile y el mundo.`,
    'Ciencias Naturales': `Curso práctico de ${topic} que integra experimentación y análisis científico para comprender fenómenos naturales.`,
    'Tecnología': `Introducción práctica a ${topic} con proyectos aplicados y desarrollo de competencias digitales del siglo XXI.`,
    'Arte y Cultura': `Experiencia creativa en ${topic} que fomenta la expresión artística y el conocimiento cultural.`
  };
  
  return templates[subject] || `Curso de ${topic} nivel ${difficulty} con enfoque práctico y colaborativo.`;
}

function getDifficultyScore(difficulty) {
  const scores = {
    'básico': randomBetween(1, 3),
    'intermedio': randomBetween(4, 7),
    'avanzado': randomBetween(8, 10)
  };
  
  return scores[difficulty] || 5;
}

function generateCourseTags(subject, topic) {
  const baseTags = [subject.toLowerCase(), topic.toLowerCase().replace(/\s+/g, '_')];
  const additionalTags = [
    'colaborativo', 'práctico', 'investigación', 'proyecto', 'evaluación_continua',
    'multimedia', 'interactivo', 'reflexivo', 'aplicado'
  ];
  
  return [...baseTags, ...additionalTags.slice(0, randomBetween(2, 4))];
}

function getPrerequisites(subject) {
  const prerequisites = {
    'Matemáticas': ['Álgebra básica', 'Aritmética'],
    'Ciencias Naturales': ['Matemáticas básicas', 'Método científico'],
    'Tecnología': ['Competencias digitales básicas'],
    'Lengua y Literatura': ['Comprensión lectora básica']
  };
  
  return prerequisites[subject] || null;
}

function generateLearningObjectives(topic, difficulty) {
  const objectives = [
    `Comprender los conceptos fundamentales de ${topic}`,
    `Aplicar conocimientos de ${topic} en contextos prácticos`,
    `Desarrollar habilidades de análisis crítico en ${topic}`,
    `Colaborar efectivamente en proyectos relacionados con ${topic}`
  ];
  
  if (difficulty === 'avanzado') {
    objectives.push(`Evaluar y sintetizar información compleja sobre ${topic}`);
    objectives.push(`Crear soluciones innovadoras utilizando principios de ${topic}`);
  }
  
  return objectives;
}

function generateAssessmentMethods() {
  const methods = ['evaluaciones_continuas', 'proyectos', 'presentaciones', 'portafolio'];
  return methods.slice(0, randomBetween(2, 4));
}

function getScenarioForCourse(difficulty) {
  if (difficulty === 'avanzado') return 'high_engagement';
  if (difficulty === 'básico') return 'mixed_engagement';
  return 'standard_engagement';
}

function getCompletionTarget(difficulty) {
  const targets = {
    'básico': randomBetween(75, 90),
    'intermedio': randomBetween(65, 85),
    'avanzado': randomBetween(55, 75)
  };
  
  return targets[difficulty] || 70;
}

function getTechnologyRequirements(subject) {
  const requirements = {
    'Tecnología': ['computadora', 'internet_estable', 'software_específico'],
    'Ciencias Naturales': ['simuladores', 'laboratorio_virtual'],
    'Arte y Cultura': ['herramientas_creativas', 'multimedia'],
    'Matemáticas': ['calculadora_científica', 'software_matemático']
  };
  
  return requirements[subject] || ['básico'];
}

function getEnrollmentStatus() {
  const statuses = ['active', 'active', 'active', 'active', 'paused', 'completed', 'dropped'];
  return randomChoice(statuses); // 57% active, others varied
}

function generateStudentGoals() {
  const goals = [
    'mejorar_notas', 'desarrollar_habilidades', 'preparar_exámenes',
    'explorar_intereses', 'requisito_académico', 'crecimiento_personal'
  ];
  
  return goals.slice(0, randomBetween(1, 3));
}

function generateAssignmentTitle(subject, number) {
  const templates = {
    'Matemáticas': [`Resolución de Problemas ${number}`, `Ejercicios Aplicados ${number}`, `Proyecto Matemático ${number}`],
    'Lengua y Literatura': [`Análisis Textual ${number}`, `Ensayo Crítico ${number}`, `Creación Literaria ${number}`],
    'Historia y Geografía': [`Investigación Histórica ${number}`, `Análisis Geográfico ${number}`, `Proyecto Cultural ${number}`],
    'Ciencias Naturales': [`Experimento de Laboratorio ${number}`, `Investigación Científica ${number}`, `Proyecto de Campo ${number}`],
    'Tecnología': [`Desarrollo de Aplicación ${number}`, `Proyecto Tecnológico ${number}`, `Innovación Digital ${number}`],
    'Arte y Cultura': [`Creación Artística ${number}`, `Proyecto Cultural ${number}`, `Expresión Creativa ${number}`]
  };
  
  const options = templates[subject] || [`Actividad ${number}`];
  return randomChoice(options);
}

function generateAssignmentDescription(subject, level) {
  return `Actividad ${level} de ${subject} que desarrolla competencias específicas a través de trabajo práctico y reflexivo.`;
}

function generateAssignmentDueDate(startDate, endDate, index, total) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const courseDuration = end.getTime() - start.getTime();
  const assignmentInterval = courseDuration / total;
  
  const dueDate = new Date(start.getTime() + (assignmentInterval * (index + 1)));
  return dueDate.toISOString().split('T')[0];
}

function generateAssignmentInstructions(subject) {
  return `Instrucciones detalladas para completar la actividad de ${subject}. Incluye recursos, metodología y criterios de evaluación.`;
}

function getDifficultyLevel(courseLevel, assignmentIndex, totalAssignments) {
  if (assignmentIndex < totalAssignments * 0.3) return 'introductorio';
  if (assignmentIndex < totalAssignments * 0.7) return 'intermedio';
  return 'avanzado';
}

function generateAssessedSkills(subject) {
  const skillsMap = {
    'Matemáticas': ['resolución_problemas', 'pensamiento_lógico', 'cálculo'],
    'Lengua y Literatura': ['comprensión_lectora', 'expresión_escrita', 'análisis_crítico'],
    'Historia y Geografía': ['análisis_histórico', 'interpretación', 'investigación'],
    'Ciencias Naturales': ['método_científico', 'observación', 'experimentación'],
    'Tecnología': ['programación', 'diseño', 'innovación'],
    'Arte y Cultura': ['creatividad', 'expresión', 'interpretación']
  };
  
  return skillsMap[subject] || ['análisis', 'síntesis', 'evaluación'];
}

function generateRubricCriteria() {
  return [
    'contenido_y_conocimiento',
    'organización_y_estructura',
    'creatividad_e_innovación',
    'colaboración_y_participación',
    'presentación_y_formato'
  ];
}

module.exports = { generateCourses };