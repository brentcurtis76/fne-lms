/**
 * Seed Codebase Index API
 *
 * Seeds the codebase_index table with analyzed feature data.
 * Admin-only endpoint.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initial codebase index data
const CODEBASE_INDEX_DATA = [
  {
    feature_area: 'user_management',
    route: '/admin/user-management',
    file_path: 'pages/admin/user-management.tsx',
    roles_allowed: ['admin'],
    component_summary: 'Full-featured admin dashboard for user lifecycle management. Features expandable user list with inline actions, search/filter, bulk import, role management, QA tester toggle, and expense access control.',
    key_behaviors: {
      list_users: {
        description: 'Fetch paginated user list with roles and assignments',
        api_endpoint: 'GET /api/admin/users',
        filters: ['search', 'approval_status', 'school_id', 'community_id'],
        pagination: '25 users per page'
      },
      create_user: {
        description: 'Create new user with email, password, name, and initial role',
        api_endpoint: 'POST /api/admin/create-user',
        required_fields: ['email', 'password'],
        auto_creates: ['auth.users', 'profiles', 'user_roles']
      },
      approve_user: {
        description: 'Approve or reject pending user registration',
        api_endpoint: 'POST /api/admin/approve-user',
        actions: ['approve', 'reject']
      },
      edit_user: {
        description: 'Edit user basic information',
        api_endpoint: 'POST /api/admin/update-user',
        editable_fields: ['email', 'first_name', 'last_name', 'school']
      },
      delete_user: {
        description: 'Permanently delete user and associated records',
        api_endpoint: 'POST /api/admin/delete-user',
        cascade_deletes: ['platform_feedback', 'user_roles', 'profiles', 'auth.users']
      },
      password_reset: {
        description: 'Reset user password to temporary value',
        api_endpoint: 'POST /api/admin/reset-password'
      },
      toggle_qa_tester: {
        description: 'Enable/disable QA testing capability',
        api_endpoint: 'POST /api/admin/update-qa-tester-status'
      },
      toggle_expense_access: {
        description: 'Enable/disable expense report submission',
        database_table: 'expense_report_access'
      },
      bulk_import: {
        description: 'Import multiple users via CSV',
        component: 'BulkUserImportModal'
      }
    },
    expected_outcomes: {
      success: {
        create_user: 'Toast: "Usuario creado correctamente", form resets, list refreshes',
        approve_user: 'Toast: "Usuario aprobado correctamente", status changes to approved',
        edit_user: 'Toast: "Usuario actualizado exitosamente", modal closes',
        delete_user: 'Toast: "Usuario eliminado correctamente", user removed from list'
      },
      failure: {
        unauthorized: 'Redirect to /dashboard with "Solo administradores pueden acceder"',
        duplicate_email: 'Toast: "Este email ya está registrado"',
        validation_error: 'Toast with specific error message',
        network_error: 'Toast: "Error al cargar usuarios"'
      }
    }
  },
  {
    feature_area: 'course_management',
    route: '/admin/course-builder',
    file_path: 'pages/admin/course-builder/index.tsx',
    roles_allowed: ['admin'],
    component_summary: 'Netflix-style course management dashboard. Features card grid with hover expansion, course creation form, search/filter by instructor, pagination, and CRUD operations with cascading deletion.',
    key_behaviors: {
      list_courses: {
        description: 'Fetch paginated course list with instructor data',
        api_endpoint: 'GET /api/admin/courses',
        filters: ['search', 'instructor'],
        pagination: '12 courses per page'
      },
      create_course: {
        description: 'Create new course with metadata and structure type',
        page: '/admin/course-builder/new',
        fields: ['title', 'description', 'instructor_id', 'structure_type', 'thumbnail']
      },
      edit_course: {
        description: 'Edit course metadata and structure',
        page: '/admin/course-builder/[courseId]/edit',
        can_convert_structure: true
      },
      manage_modules: {
        description: 'Add/edit/delete modules in structured courses',
        page: '/admin/course-builder/[courseId]'
      },
      manage_lessons: {
        description: 'Add/edit/delete lessons in modules or simple courses',
        page: '/admin/course-builder/[courseId]'
      },
      delete_course: {
        description: 'Multi-step cascading delete',
        cascade_order: ['lesson_assignments', 'blocks', 'lessons', 'modules', 'course']
      }
    },
    expected_outcomes: {
      success: {
        create_course: 'Toast: "Curso creado exitosamente", redirect to editor',
        edit_course: 'Toast: "Curso actualizado exitosamente", redirect to detail',
        delete_course: 'Confirmation modal, course removed from grid'
      },
      failure: {
        unauthorized: 'Display "Acceso Denegado" screen',
        not_found: 'Toast: "Curso no encontrado"',
        validation_error: 'Toast with specific error'
      }
    }
  },
  {
    feature_area: 'course_management',
    route: '/courses/[id]',
    file_path: 'pages/courses/[id].tsx',
    roles_allowed: ['*'],
    component_summary: 'Public course detail page. Shows course info, instructor, category, duration, difficulty. Server-side rendered for SEO.',
    key_behaviors: {
      view_course: {
        description: 'Display course details via SSR',
        service: 'CoursesService.getCourseById()',
        displays: ['title', 'description', 'instructor', 'category', 'duration', 'difficulty']
      }
    },
    expected_outcomes: {
      success: {
        view_course: 'Full course details displayed'
      },
      failure: {
        not_found: 'Returns 404 page'
      }
    }
  },
  {
    feature_area: 'school_management',
    route: '/admin/schools',
    file_path: 'pages/admin/schools.tsx',
    roles_allowed: ['admin'],
    component_summary: 'School and generation management with expandable cards. Features CRUD for schools/generations, client linking, generation transition handling with rollback.',
    key_behaviors: {
      list_schools: {
        description: 'Fetch schools with generations and user counts',
        uses_rpc: 'get_school_user_counts()'
      },
      create_school: {
        description: 'Create school with optional generations flag',
        fields: ['name', 'has_generations']
      },
      edit_school: {
        description: 'Edit school name and generation settings',
        transition_handling: 'Confirmation modal for disabling generations'
      },
      manage_generations: {
        description: 'Add/edit/delete generations within schools',
        fields: ['name', 'grade_range', 'description']
      },
      link_client: {
        description: 'Bidirectional client-school linking',
        tables: ['schools', 'clientes']
      },
      delete_school: {
        description: 'Delete school with browser confirmation',
        cascade: true
      }
    },
    expected_outcomes: {
      success: {
        create_school: 'Toast: "Escuela creada exitosamente"',
        edit_school: 'Toast: "Escuela actualizada exitosamente"',
        delete_school: 'Toast: "Escuela eliminada exitosamente"',
        link_client: 'Toast: "Cliente vinculado exitosamente"'
      },
      failure: {
        unauthorized: 'Toast: "Acceso denegado. Solo administradores.", redirect to dashboard',
        validation_error: 'Toast: "El nombre de la escuela es requerido"',
        duplicate_client: 'Toast: "Este cliente ya está vinculado a otra escuela"'
      }
    }
  },
  {
    feature_area: 'assessment_builder',
    route: '/admin/assessment-builder',
    file_path: 'pages/admin/assessment-builder/index.tsx',
    roles_allowed: ['admin', 'consultor'],
    component_summary: 'Assessment template management with lifecycle states (draft/published/archived). Features modules, indicators, year expectations, versioning, and snapshots.',
    key_behaviors: {
      list_templates: {
        description: 'List templates with search/filter by status and area',
        tabs: ['Activos', 'Archivados']
      },
      create_template: {
        description: 'Create new assessment template',
        page: '/admin/assessment-builder/create',
        fields: ['name', 'description', 'area', 'grade']
      },
      edit_template: {
        description: 'Edit template structure (modules/indicators)',
        page: '/admin/assessment-builder/[templateId]',
        read_only_when: 'published'
      },
      manage_expectations: {
        description: 'Configure year 1-5 expectations per indicator',
        page: '/admin/assessment-builder/[templateId]/expectations'
      },
      publish_template: {
        description: 'Publish template with validation and snapshot',
        api_endpoint: 'POST /api/admin/assessment-builder/templates/[templateId]/publish',
        validates: ['min 1 module', 'min 1 indicator per module']
      },
      duplicate_template: {
        description: 'Create draft copy with all nested data',
        api_endpoint: 'POST /api/admin/assessment-builder/templates/[templateId]/duplicate'
      },
      archive_restore: {
        description: 'Archive published or restore archived templates',
        api_endpoints: ['archive', 'restore']
      }
    },
    expected_outcomes: {
      success: {
        create_template: 'Toast: "Template creado exitosamente", redirect to editor',
        publish_template: 'Toast: "Template publicado", snapshot created, version incremented',
        duplicate_template: 'Toast with copy counts, redirect to new editor'
      },
      failure: {
        unauthorized: 'Display "Acceso Denegado" page',
        publish_no_modules: 'Toast: "El template debe tener al menos un módulo"',
        publish_no_indicators: 'Toast: "Cada módulo debe tener al menos un indicador"'
      }
    }
  },
  {
    feature_area: 'docente_experience',
    route: '/mi-aprendizaje',
    file_path: 'pages/mi-aprendizaje.tsx',
    roles_allowed: ['docente', 'admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'supervisor_de_red', 'community_manager'],
    component_summary: 'Learner dashboard with two tabs: Learning Paths and Courses. Netflix-style course display categorized by progress status. Search across both tabs.',
    key_behaviors: {
      view_courses: {
        description: 'View enrolled courses grouped by progress',
        api_endpoint: 'GET /api/my-courses',
        categories: ['Continuar Aprendiendo', 'Comenzar', 'Completados']
      },
      view_learning_paths: {
        description: 'View assigned learning paths with progress',
        api_endpoint: 'GET /api/learning-paths/my-paths'
      },
      search: {
        description: 'Real-time search across courses and paths',
        filters_both_tabs: true
      },
      navigate_to_course: {
        description: 'Click course to start/continue learning',
        navigates_to: '/student/course/[courseId]'
      }
    },
    expected_outcomes: {
      success: {
        load_courses: 'Courses displayed in Netflix-style rows by category',
        load_paths: 'Learning paths displayed in grid with progress'
      },
      failure: {
        no_session: 'Redirect to /login',
        api_error: 'Error banner with reload button',
        no_courses: 'Message: "No tienes cursos asignados"'
      }
    }
  },
  {
    feature_area: 'docente_experience',
    route: '/mi-aprendizaje/ruta/[id]',
    file_path: 'pages/mi-aprendizaje/ruta/[id].tsx',
    roles_allowed: ['docente', 'admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'],
    component_summary: 'Learning path detail view with sequential course progression. Shows overall progress, course list with status badges, and optional enhanced analytics.',
    key_behaviors: {
      view_path_details: {
        description: 'View learning path with courses and progress',
        api_endpoint: 'GET /api/learning-paths/[id]?user=true'
      },
      enhanced_analytics: {
        description: 'Optional advanced progress insights',
        api_endpoint: 'GET /api/learning-paths/[id]/enhanced-progress'
      },
      launch_course: {
        description: 'Start or continue individual courses',
        navigates_to: '/student/course/[courseId]'
      }
    },
    expected_outcomes: {
      success: {
        load_path: 'Sequential courses displayed with progress bars',
        enhanced_view: 'Additional analytics metrics shown'
      },
      failure: {
        not_found: '404 page with back button',
        not_assigned: 'Error message with back button'
      }
    }
  },
  {
    feature_area: 'reporting',
    route: '/detailed-reports',
    file_path: 'pages/detailed-reports.tsx',
    roles_allowed: ['admin', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor', 'supervisor_de_red'],
    component_summary: 'In-depth user progress analysis with activity scoring. Features overview tab with top 10 users, detailed tab with full metrics, role-based data scoping, and advanced filtering.',
    key_behaviors: {
      load_users: {
        description: 'Fetch users with comprehensive metrics',
        api_endpoint: 'POST /api/reports/detailed',
        role_based_scope: true
      },
      filter_users: {
        description: 'Filter by school, generation, community, status, date range',
        debounced_search: '500ms'
      },
      activity_scoring: {
        description: 'Calculate engagement scores with weighted factors',
        weights: { lessons: '60%', time: '12%', recency: '20%', enrollments: '8%' }
      },
      view_user_detail: {
        description: 'Open modal with individual user metrics',
        component: 'UserDetailModal'
      }
    },
    expected_outcomes: {
      success: {
        load_data: 'Users displayed with activity scores and metrics',
        filter: 'List updates based on filters'
      },
      failure: {
        unauthorized: 'Redirect to /dashboard',
        api_error: 'Toast error with message'
      }
    }
  },
  {
    feature_area: 'reporting',
    route: '/reports',
    file_path: 'pages/reports.tsx',
    roles_allowed: ['admin', 'equipo_directivo', 'lider_generacion', 'lider_comunidad', 'consultor', 'supervisor_de_red'],
    component_summary: 'Multi-dimensional analytics dashboard with 6 tabs: Overview, Analytics, Learning Paths, Community, School, Courses. Features CSV export and date range filtering.',
    key_behaviors: {
      overview: {
        description: 'Summary metrics and user progress',
        api_endpoint: 'GET /api/reports/overview'
      },
      analytics: {
        description: 'Visualization charts with time grouping',
        api_endpoint: 'GET /api/reports/analytics-data'
      },
      community_breakdown: {
        description: 'Community-level metrics',
        api_endpoint: 'GET /api/reports/community'
      },
      school_breakdown: {
        description: 'School-level metrics with teacher/student separation',
        api_endpoint: 'GET /api/reports/school'
      },
      course_analytics: {
        description: 'Course enrollment and completion stats',
        api_endpoint: 'GET /api/reports/course-analytics'
      },
      export_csv: {
        description: 'Export tab data to CSV',
        available_on_all_tabs: true
      }
    },
    expected_outcomes: {
      success: {
        load_data: 'Tab displays with relevant metrics and charts',
        export: 'CSV downloaded with metadata'
      },
      failure: {
        api_error: 'Toast error with generic message'
      }
    }
  },
  {
    feature_area: 'network_management',
    route: '/admin/networks',
    file_path: 'pages/admin/network-management.tsx',
    roles_allowed: ['admin'],
    component_summary: 'Network (Red de Colegios) management for grouping schools under supervisor oversight. Features smart bulk school assignment, supervisor role management, and conflict detection.',
    key_behaviors: {
      list_networks: {
        description: 'Fetch networks with school and supervisor counts',
        api_endpoint: 'GET /api/admin/networks'
      },
      create_network: {
        description: 'Create new school network',
        api_endpoint: 'POST /api/admin/networks',
        validates: 'unique name'
      },
      assign_schools: {
        description: 'Bulk assign schools with conflict detection',
        api_endpoint: 'PUT /api/admin/networks/schools',
        max_batch: 100,
        conflict_handling: 'skip with warning'
      },
      assign_supervisor: {
        description: 'Assign supervisor_de_red role to user',
        api_endpoint: 'POST /api/admin/networks/supervisors',
        constraint: 'one supervisor per network'
      },
      remove_school: {
        description: 'Remove school from network',
        api_endpoint: 'DELETE /api/admin/networks/schools',
        blocked_if: 'active supervisors exist'
      },
      delete_network: {
        description: 'Delete network if no supervisors',
        api_endpoint: 'DELETE /api/admin/networks',
        blocked_if: 'has active supervisors'
      }
    },
    expected_outcomes: {
      success: {
        create_network: 'Toast: "Red creada exitosamente"',
        assign_schools: 'Toast: "X escuela(s) asignada(s) exitosamente"',
        assign_supervisor: 'Toast: "Supervisor asignado exitosamente"',
        delete_network: 'Toast: "Red eliminada exitosamente"'
      },
      failure: {
        unauthorized: 'Toast: "Solo administradores pueden acceder", redirect to dashboard',
        duplicate_name: 'Toast: "Ya existe una red con ese nombre"',
        supervisor_conflict: 'Toast: "El usuario ya es supervisor de otra red"',
        delete_with_supervisors: 'Delete button disabled, warning shown'
      }
    }
  },
  // COLLABORATIVE SPACE CODEBASE INDEX ENTRIES
  {
    feature_area: 'collaborative_space',
    route: '/community/workspace',
    file_path: 'pages/community/workspace.tsx',
    roles_allowed: ['docente', 'consultor', 'admin', 'lider_comunidad', 'community_manager'],
    component_summary: 'Main collaborative workspace hub with tabbed interface. Features Overview, Communities, Meetings, Documents, and Messaging tabs. Requires community membership to access. Real-time messaging with Supabase subscriptions.',
    key_behaviors: {
      load_workspace: {
        description: 'Fetch user community membership and workspace data',
        api_endpoint: 'GET /api/community/members',
        requires: 'community_id on user_roles'
      },
      messaging: {
        description: 'Real-time messaging within workspace threads',
        subscription: 'supabase.channel(workspace-messages-${workspaceId})',
        real_time: true,
        tables: ['community_messages', 'message_threads']
      },
      tab_navigation: {
        description: 'Switch between workspace sections',
        tabs: ['overview', 'communities', 'meetings', 'documents', 'messaging']
      },
      workspace_settings: {
        description: 'Edit workspace name and image',
        component: 'WorkspaceSettingsModal',
        any_member_can_edit: true
      }
    },
    expected_outcomes: {
      success: {
        load_workspace: 'Workspace displays with user\'s community data',
        send_message: 'Message appears immediately in thread for all participants',
        receive_message: 'Other users see message without page refresh'
      },
      failure: {
        no_community: 'Redirect to dashboard with "No tienes comunidad asignada"',
        permission_denied: 'Access denied for users without community_id'
      }
    }
  },
  {
    feature_area: 'collaborative_space',
    route: '/community/workspace/assignments/[id]/groups',
    file_path: 'pages/community/workspace/assignments/[id]/groups.tsx',
    roles_allowed: ['docente', 'admin', 'consultor'],
    component_summary: 'Group management page for assignment collaboration. Users can create groups, add classmates, and view group composition. Validates school affiliation and course enrollment.',
    key_behaviors: {
      list_groups: {
        description: 'Fetch all groups for this assignment',
        api_endpoint: 'GET /api/assignments/group-members'
      },
      create_group: {
        description: 'Create new group for assignment',
        api_endpoint: 'POST /api/assignments/create-group',
        validations: ['user has no existing group', 'enrolled in course', 'same school']
      },
      add_classmates: {
        description: 'Add other students to group',
        api_endpoint: 'POST /api/assignments/add-classmates',
        modal: 'CreateGroupModal',
        validates: ['not already in group', 'same school', 'enrolled in course']
      },
      leave_group: {
        description: 'Remove self from group',
        api_endpoint: 'DELETE /api/assignments/group-members'
      }
    },
    expected_outcomes: {
      success: {
        create_group: 'Group created, user added as leader',
        add_classmates: 'Classmates appear in group member list',
        leave_group: 'User removed from group, can join another'
      },
      failure: {
        already_in_group: 'Toast: "Ya tienes un grupo para esta tarea"',
        classmate_in_group: 'Toast: "Este estudiante ya está en un grupo"',
        validation_error: 'Error message with specific reason'
      }
    }
  },
  {
    feature_area: 'collaborative_space',
    route: '/community/workspace/assignments/[id]/discussion',
    file_path: 'pages/community/workspace/assignments/[id]/discussion.tsx',
    roles_allowed: ['docente', 'admin', 'consultor'],
    component_summary: 'Real-time group discussion thread for assignment collaboration. Uses Supabase real-time subscriptions for instant message sync between group members.',
    key_behaviors: {
      load_discussion: {
        description: 'Fetch thread messages for group',
        api_endpoint: 'GET /api/messaging/messages (via messagingUtils)',
        subscription: 'postgres_changes on community_messages'
      },
      send_message: {
        description: 'Post message to discussion thread',
        api_endpoint: 'POST /api/messaging/send',
        real_time_sync: true,
        notifies: 'all group members via subscription'
      },
      receive_message: {
        description: 'Real-time message receipt',
        mechanism: 'Supabase channel subscription',
        no_refresh_needed: true
      },
      mention_user: {
        description: '@mention other group members',
        component: 'MentionPicker',
        triggers: 'notification to mentioned user'
      }
    },
    expected_outcomes: {
      success: {
        send_message: 'Message appears in thread for sender and all subscribed users',
        receive_message: 'New messages appear instantly without page refresh',
        mention: 'Mentioned user sees notification'
      },
      failure: {
        not_member: 'Cannot access discussion if not group member',
        network_error: 'Message queued locally, retry on reconnect'
      }
    }
  },
  // NAVIGATION / SIDEBAR CODEBASE INDEX ENTRY
  {
    feature_area: 'navigation',
    route: '/_sidebar',
    file_path: 'components/layout/Sidebar.tsx',
    roles_allowed: ['*'],
    component_summary: 'Global sidebar navigation component with role-based menu visibility. Uses RBAC permissions, restrictedRoles, adminOnly, consultantOnly, superadminOnly, and requiresCommunity flags to filter menu items. Supports collapsed/expanded state with floating menus.',
    key_behaviors: {
      role_visibility: {
        description: 'Menu items filtered based on user role and permissions',
        visibility_rules: {
          adminOnly: 'Only visible to users with admin role',
          consultantOnly: 'Visible to admin and consultor roles',
          superadminOnly: 'Only visible to superadmins (from superadmins table)',
          restrictedRoles: 'Only visible if user role is in the specified array',
          requiresCommunity: 'Only visible if user has community_id or is admin',
          permission: 'Checked via RBAC system, admins bypass all permission checks'
        }
      },
      menu_items_by_role: {
        description: 'Navigation items visible per role type',
        admin: [
          'Mi Panel (/dashboard)',
          'Mi Perfil (/profile)',
          'Mi Aprendizaje (/mi-aprendizaje) with Mis Cursos, Mis Tareas',
          'Feedback - Docente Assessments (/docente/assessments)',
          'Cursos section: Constructor de Cursos, Próximos Cursos',
          'Procesos de Cambio section: Constructor de Evaluaciones, Contexto Transversal, Plan de Migración',
          'Noticias (/admin/news)',
          'Eventos (/admin/events)',
          'Rutas de Aprendizaje (/admin/learning-paths)',
          'Matriz de Asignaciones (/admin/assignment-matrix)',
          'Usuarios (/admin/user-management)',
          'Escuelas (/admin/schools)',
          'Redes de Colegios (/admin/network-management)',
          'Consultorías section: Asignación de Consultores, Vista de Tareas',
          'Gestión section: Clientes, Contratos, Propuestas Pasantías, Rendición de Gastos, Soporte Técnico',
          'Reportes (/detailed-reports)',
          'QA Testing section: Ejecutar Pruebas, Panel de QA, Escenarios, Importar, Registro de Horas, Generador',
          'Vías de Transformación section: Mis Evaluaciones, Contexto Transversal, Panel de Resultados, Todas las Evaluaciones',
          'Espacio Colaborativo section: Vista General, Gestión Comunidades',
          'Configuración (/admin/configuration)'
        ],
        consultor: [
          'Mi Panel (/dashboard)',
          'Mi Perfil (/profile)',
          'Mi Aprendizaje (/mi-aprendizaje) with Mis Cursos, Mis Tareas',
          'Feedback - Docente Assessments (/docente/assessments)',
          'Revisión de Quizzes (/quiz-reviews)',
          'Procesos de Cambio section: Constructor de Evaluaciones, Contexto Transversal, Plan de Migración',
          'Consultorías section: Vista de Tareas',
          'Reportes (/detailed-reports)',
          'Espacio Colaborativo section (if has community)',
          'Configuración (/profile)'
        ],
        docente: [
          'Mi Panel (/dashboard)',
          'Mi Perfil (/profile)',
          'Mi Aprendizaje (/mi-aprendizaje) with Mis Cursos, Mis Tareas',
          'Feedback - Docente Assessments (/docente/assessments)',
          'Espacio Colaborativo section (if has community_id)'
        ],
        equipo_directivo: [
          'Mi Panel (/dashboard)',
          'Mi Perfil (/profile)',
          'Mi Aprendizaje (/mi-aprendizaje) with Mis Cursos, Mis Tareas',
          'Espacio Colaborativo section (if has community_id)'
        ],
        lider_generacion: [
          'Mi Panel (/dashboard)',
          'Mi Perfil (/profile)',
          'Mi Aprendizaje (/mi-aprendizaje) with Mis Cursos, Mis Tareas',
          'Espacio Colaborativo section (if has community_id)'
        ],
        lider_comunidad: [
          'Mi Panel (/dashboard)',
          'Mi Perfil (/profile)',
          'Mi Aprendizaje (/mi-aprendizaje) with Mis Cursos, Mis Tareas',
          'Espacio Colaborativo section (if has community_id)'
        ],
        supervisor_de_red: [
          'Mi Panel (/dashboard)',
          'Mi Perfil (/profile)',
          'Mi Aprendizaje (/mi-aprendizaje) with Mis Cursos, Mis Tareas',
          'Espacio Colaborativo section (if has community_id)'
        ],
        superadmin: [
          'All admin items plus:',
          'Roles y Permisos (/admin/role-management) - requires FEATURE_SUPERADMIN_RBAC flag'
        ]
      },
      collapsed_state: {
        description: 'Sidebar can collapse to icon-only mode',
        collapsed_width: '80px (w-20)',
        expanded_width: '320px (w-80)',
        features: ['Icon-only display', 'Floating menus on hover', 'Badge counts for children', 'Tooltips']
      },
      active_state_detection: {
        description: 'Highlights current route in navigation',
        methods: ['Exact match', 'Query parameter matching for workspace', 'Nested route prefix matching'],
        auto_expand: 'Parent items auto-expand when child is active'
      },
      notification_center: {
        description: 'ModernNotificationCenter component in header',
        visible_when: 'Expanded state and user logged in'
      }
    },
    expected_outcomes: {
      success: {
        render: 'Navigation items filtered by role and permissions',
        collapse_toggle: 'Sidebar transitions between collapsed/expanded states',
        route_active: 'Current route highlighted with accent color and left border',
        floating_menu: 'Collapsed state shows floating menu on hover',
        permission_check: 'Items with permission property validated against RBAC'
      },
      failure: {
        no_user: 'Minimal navigation shown',
        permission_loading: 'Permission-based items hidden until loaded',
        superadmin_check_pending: 'RBAC menu hidden until check completes'
      }
    }
  }
];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check admin role
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isAdmin = roles?.some(r => r.role_type === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Upsert codebase index entries
    const results = {
      inserted: 0,
      updated: 0,
      errors: [] as string[]
    };

    for (const entry of CODEBASE_INDEX_DATA) {
      const { error } = await supabaseAdmin
        .from('codebase_index')
        .upsert({
          ...entry,
          last_indexed: new Date().toISOString(),
          indexed_by: 'claude-code'
        }, {
          onConflict: 'feature_area,route'
        });

      if (error) {
        results.errors.push(`${entry.feature_area}/${entry.route}: ${error.message}`);
      } else {
        results.inserted++;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Seeded ${results.inserted} codebase index entries`,
      results
    });
  } catch (error: any) {
    console.error('Seed codebase index error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
