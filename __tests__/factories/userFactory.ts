/**
 * Test Data Factory for User-related test data
 * Provides consistent, realistic test data for all user roles
 */

import { User } from '@supabase/supabase-js';
import { UserRoleType } from '../../types/roles';

export interface TestUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRoleType;
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  is_active: boolean;
  created_at: string;
  avatar_url?: string;
}

export interface TestSchool {
  id: string;
  name: string;
  district?: string;
  region?: string;
  has_generations: boolean;
  created_at: string;
}

export interface TestGeneration {
  id: string;
  name: string;
  school_id: string;
  grade_range?: string;
  academic_year: string;
  created_at: string;
}

export interface TestCommunity {
  id: string;
  name: string;
  school_id: string;
  generation_id?: string;
  description?: string;
  created_at: string;
}

export interface TestCourse {
  id: string;
  title: string;
  description: string;
  instructor_id: string;
  is_published: boolean;
  created_at: string;
}

export interface TestEnrollment {
  id: string;
  user_id: string;
  course_id: string;
  enrolled_at: string;
  progress_percentage: number;
  is_completed: boolean;
}

export class UserFactory {
  private static userCounter = 1;
  private static schoolCounter = 1;
  private static generationCounter = 1;
  private static communityCounter = 1;
  private static courseCounter = 1;

  /**
   * Create a complete test environment with schools, generations, and communities
   */
  static createTestEnvironment() {
    const school1 = this.createSchool({
      name: 'Escuela Primaria Norte',
      has_generations: true
    });

    const school2 = this.createSchool({
      name: 'Liceo Secundario Sur',
      has_generations: false
    });

    const generation1 = this.createGeneration({
      name: 'Generación Tractor',
      school_id: school1.id,
      grade_range: '1°-6° Básico'
    });

    const generation2 = this.createGeneration({
      name: 'Generación Innova',
      school_id: school1.id,
      grade_range: '7°-8° Básico'
    });

    const community1 = this.createCommunity({
      name: 'Comunidad Alpha',
      school_id: school1.id,
      generation_id: generation1.id
    });

    const community2 = this.createCommunity({
      name: 'Comunidad Beta',
      school_id: school1.id,
      generation_id: generation2.id
    });

    const community3 = this.createCommunity({
      name: 'Comunidad Gamma',
      school_id: school2.id
    });

    return {
      schools: [school1, school2],
      generations: [generation1, generation2],
      communities: [community1, community2, community3]
    };
  }

  /**
   * Create a test user for each role with proper associations
   */
  static createRoleBasedUsers(environment?: ReturnType<typeof UserFactory.createTestEnvironment>) {
    const env = environment || this.createTestEnvironment();
    const [school1, school2] = env.schools;
    const [generation1, generation2] = env.generations;
    const [community1, community2, community3] = env.communities;

    // Admin - Global access
    const admin = this.createUser({
      role: 'admin',
      first_name: 'María',
      last_name: 'Administradora',
      email: 'admin@test.com'
    });

    // Consultor - FNE instructor
    const consultor = this.createUser({
      role: 'consultor',
      first_name: 'Carlos',
      last_name: 'Consultor',
      email: 'consultor@test.com'
    });

    // Equipo Directivo - School management
    const equipoDirectivo = this.createUser({
      role: 'equipo_directivo',
      first_name: 'Ana',
      last_name: 'Directora',
      email: 'directora@test.com',
      school_id: school1.id
    });

    // Líder de Generación - Generation leader
    const liderGeneracion = this.createUser({
      role: 'lider_generacion',
      first_name: 'Luis',
      last_name: 'Líder',
      email: 'lider.gen@test.com',
      school_id: school1.id,
      generation_id: generation1.id
    });

    // Líder de Comunidad - Community leader
    const liderComunidad = this.createUser({
      role: 'lider_comunidad',
      first_name: 'Sofia',
      last_name: 'Coordinadora',
      email: 'lider.com@test.com',
      school_id: school1.id,
      generation_id: generation1.id,
      community_id: community1.id
    });

    // Docente - Teacher/Student
    const docente1 = this.createUser({
      role: 'docente',
      first_name: 'Pedro',
      last_name: 'Profesor',
      email: 'docente1@test.com',
      school_id: school1.id,
      generation_id: generation1.id,
      community_id: community1.id
    });

    const docente2 = this.createUser({
      role: 'docente',
      first_name: 'Elena',
      last_name: 'Maestra',
      email: 'docente2@test.com',
      school_id: school1.id,
      generation_id: generation2.id,
      community_id: community2.id
    });

    const docente3 = this.createUser({
      role: 'docente',
      first_name: 'Roberto',
      last_name: 'Educador',
      email: 'docente3@test.com',
      school_id: school2.id,
      community_id: community3.id
    });

    return {
      admin,
      consultor,
      equipoDirectivo,
      liderGeneracion,
      liderComunidad,
      docentes: [docente1, docente2, docente3],
      environment: env
    };
  }

  /**
   * Create a single test user
   */
  static createUser(overrides: Partial<TestUser> = {}): TestUser {
    const id = overrides.id || `user-${this.userCounter++}`;
    const timestamp = new Date().toISOString();

    return {
      id,
      email: overrides.email || `user${this.userCounter}@test.com`,
      first_name: overrides.first_name || 'Test',
      last_name: overrides.last_name || `User${this.userCounter}`,
      role: overrides.role || 'docente',
      school_id: overrides.school_id,
      generation_id: overrides.generation_id,
      community_id: overrides.community_id,
      is_active: overrides.is_active ?? true,
      created_at: overrides.created_at || timestamp,
      avatar_url: overrides.avatar_url,
      ...overrides
    };
  }

  /**
   * Create a test school
   */
  static createSchool(overrides: Partial<TestSchool> = {}): TestSchool {
    const id = overrides.id || `school-${this.schoolCounter++}`;
    const timestamp = new Date().toISOString();

    return {
      id,
      name: overrides.name || `Escuela Test ${this.schoolCounter}`,
      district: overrides.district || 'Distrito Central',
      region: overrides.region || 'Región Metropolitana',
      has_generations: overrides.has_generations ?? true,
      created_at: overrides.created_at || timestamp,
      ...overrides
    };
  }

  /**
   * Create a test generation
   */
  static createGeneration(overrides: Partial<TestGeneration> = {}): TestGeneration {
    const id = overrides.id || `gen-${this.generationCounter++}`;
    const timestamp = new Date().toISOString();

    return {
      id,
      name: overrides.name || `Generación ${this.generationCounter}`,
      school_id: overrides.school_id || 'school-1',
      grade_range: overrides.grade_range || '1°-6°',
      academic_year: overrides.academic_year || '2024',
      created_at: overrides.created_at || timestamp,
      ...overrides
    };
  }

  /**
   * Create a test community
   */
  static createCommunity(overrides: Partial<TestCommunity> = {}): TestCommunity {
    const id = overrides.id || `community-${this.communityCounter++}`;
    const timestamp = new Date().toISOString();

    return {
      id,
      name: overrides.name || `Comunidad ${this.communityCounter}`,
      school_id: overrides.school_id || 'school-1',
      generation_id: overrides.generation_id,
      description: overrides.description || 'Comunidad de crecimiento test',
      created_at: overrides.created_at || timestamp,
      ...overrides
    };
  }

  /**
   * Create a test course
   */
  static createCourse(overrides: Partial<TestCourse> = {}): TestCourse {
    const id = overrides.id || `course-${this.courseCounter++}`;
    const timestamp = new Date().toISOString();

    return {
      id,
      title: overrides.title || `Curso Test ${this.courseCounter}`,
      description: overrides.description || 'Un curso de prueba para testing',
      instructor_id: overrides.instructor_id || 'instructor-1',
      is_published: overrides.is_published ?? true,
      created_at: overrides.created_at || timestamp,
      ...overrides
    };
  }

  /**
   * Create a test enrollment
   */
  static createEnrollment(overrides: Partial<TestEnrollment> = {}): TestEnrollment {
    const id = overrides.id || `enrollment-${Date.now()}`;
    const timestamp = new Date().toISOString();

    return {
      id,
      user_id: overrides.user_id || 'user-1',
      course_id: overrides.course_id || 'course-1',
      enrolled_at: overrides.enrolled_at || timestamp,
      progress_percentage: overrides.progress_percentage ?? 0,
      is_completed: overrides.is_completed ?? false,
      ...overrides
    };
  }

  /**
   * Create Supabase User object for authentication tests
   */
  static createSupabaseUser(testUser: TestUser): User {
    return {
      id: testUser.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: testUser.email,
      email_confirmed_at: testUser.created_at,
      phone: '',
      confirmed_at: testUser.created_at,
      last_sign_in_at: testUser.created_at,
      app_metadata: {},
      user_metadata: {
        first_name: testUser.first_name,
        last_name: testUser.last_name
      },
      identities: [],
      created_at: testUser.created_at,
      updated_at: testUser.created_at
    };
  }

  /**
   * Reset all counters (useful for test isolation)
   */
  static resetCounters() {
    this.userCounter = 1;
    this.schoolCounter = 1;
    this.generationCounter = 1;
    this.communityCounter = 1;
    this.courseCounter = 1;
  }
}

/**
 * Export commonly used test data sets
 */
export const TestData = {
  /**
   * Complete test environment with all role types
   */
  fullEnvironment: () => UserFactory.createRoleBasedUsers(),

  /**
   * Minimal test setup for simple tests
   */
  minimal: () => ({
    admin: UserFactory.createUser({ role: 'admin', email: 'admin@test.com' }),
    docente: UserFactory.createUser({ role: 'docente', email: 'docente@test.com' }),
    school: UserFactory.createSchool({ name: 'Test School' })
  }),

  /**
   * Consultant with assigned students for testing consultant features
   */
  consultantScenario: () => {
    const environment = UserFactory.createTestEnvironment();
    const consultant = UserFactory.createUser({ role: 'consultor', email: 'consultant@test.com' });
    const students = [
      UserFactory.createUser({ 
        role: 'docente', 
        email: 'student1@test.com',
        school_id: environment.schools[0].id,
        community_id: environment.communities[0].id
      }),
      UserFactory.createUser({ 
        role: 'docente', 
        email: 'student2@test.com',
        school_id: environment.schools[0].id,
        community_id: environment.communities[1].id
      })
    ];

    return {
      consultant,
      students,
      environment
    };
  }
};