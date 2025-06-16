FNE LMS Project - Claude Code Context

# IMMEDIATE CONTEXT
- Project: Custom Next.js 14 + Supabase LMS platform
- Location: ~/Documents/fne-lms-working  
- Technology: Next.js 14.2.28, Supabase, React 18, Tailwind CSS, Recharts
- Port: MUST run on port 3000 for Supabase integration
- Language: All UI text in Spanish
- Production URL: https://fne-lms.vercel.app

# ENVIRONMENT CONFIGURATION
```bash
NEXT_PUBLIC_SUPABASE_URL=https://sxlogxqzmarhqsblxmtj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI
```

# QUICK START
```bash
cd ~/Documents/fne-lms-working
npm install
npm run dev  # MUST be port 3000
```

# FNE BRAND STANDARDS
- Navy Blue: #00365b
- Golden Yellow: #fdb933  
- Error Red: #ef4044
- All text in Spanish
- Mobile responsive with Tailwind CSS

# KEY DIRECTORIES
- `/pages/admin/course-builder/` - Lesson editor
- `/components/blocks/` - Content block editors
- `/components/layout/` - MainLayout, Sidebar
- `/lib/` - Supabase client, services
- `/types/` - TypeScript definitions
- `/utils/` - Utility functions

# CURRENT SYSTEM STATUS

## ✅ Core Features Complete
- **Global sidebar navigation** - Unified interface across all pages
- **Lesson editor** - 6 block types (Text, Video, Image, Quiz, File Download, External Links)
- **User management** - 6-role system with approval workflow
- **Course assignments** - Teacher-course relationship management
- **Assignment system** - Full CRUD with enrolled courses filtering, submissions tracking
- **Group assignments** - Collaborative assignments in workspace with discussion threads
- **Reporting system** - Analytics dashboard with role-based access
- **Notification system** - Real-time notifications with email delivery
- **Collaborative workspace** - Meetings, documents, messaging, activity feed, group assignments
- **Contract management** - Creation, editing, annexes, PDF generation
- **Expense reporting** - Approval workflow with receipt management
- **Consultant assignments** - Individual and group-based consultant-student relationships

## 🎯 Key Technical Patterns

### Navigation Structure
```
├── Mi Panel (Dashboard)
├── Mi Perfil
├── Mis Tareas (Assignments)
├── Cursos
│   ├── Constructor de Cursos
│   └── Gestor de Cursos
├── Usuarios [Admin only]
├── Consultorías [Admin only]
├── Gestión [Admin only]
│   ├── Contratos
│   └── Rendición de Gastos
├── Reportes
├── Espacio Colaborativo
└── Configuración [Admin only]
```

### 6-Role System (CRITICAL CORRECTION)
- **admin** - Full platform control
- **consultor** - FNE instructors (TEACHERS in the LMS)
- **equipo_directivo** - School administration (students)
- **lider_generacion** - Generation oversight (students)
- **lider_comunidad** - Community leadership (students)
- **docente** - School teachers (STUDENTS in the LMS)

### Header Component Pattern (CRITICAL)
```typescript
// Required in every authenticated page
<Header 
  user={user}
  isAdmin={isAdmin}
  avatarUrl={avatarUrl}
  onLogout={handleLogout}
  showNavigation={true}
/>
```

# CRITICAL REMINDERS
- ✅ Port 3000 REQUIRED for Supabase
- ✅ Use consistent Supabase client from `/lib/supabase`
- ✅ All UI text in Spanish
- ✅ Follow FNE brand colors
- ✅ TypeScript strict mode
- ✅ Mobile responsive design

# RECENT UPDATES
- Avatar performance optimization with caching
- Real-time notifications complete
- Expense report export (PDF/Excel)
- Contract annex system
- Messaging @mentions
- User notification preferences
- Assignment system complete with enrolled courses integration
- Assignment stats simplified to show work status (Active, Completed, In Progress, New)
- **GROUP ASSIGNMENTS (Phase 2) - COMPLETED WITH ROLE CORRECTIONS**:
  - Added to Collaborative Space under "Tareas Grupales" section
  - CONSULTORES (teachers) create assignments and manage groups
  - DOCENTES (students) can only view and submit assignments
  - Manual group assignment by consultores (self-grouping removed)
  - Integrated discussion threads per group using messaging system
  - Collaborative submission with PDF support
  - Database migration applied with corrected RLS policies
  - New tables: group_assignment_members, group_assignment_submissions, group_assignment_discussions
  - Modified lesson_assignments table for group support
- **QUIZ SYSTEM ENHANCEMENTS (January 2025)**:
  - Added open-ended question type to quiz blocks
  - New quiz submission tracking system
  - Consultant review interface for open-ended answers
  - Real-time notifications for pending reviews
  - New page: `/quiz-reviews` for consultants to grade open questions
  - Enhanced quiz types: multiple choice, true/false, open-ended
- **USER MANAGEMENT IMPROVEMENTS (January 2025)**:
  - Fixed duplicate profile creation issue
  - Added forced password change for admin-created users
  - Created API endpoint for user creation with service role
  - Proper login flow: password change → profile completion → dashboard
- **ROLE-BASED COURSE ACCESS (January 2025)**:
  - Non-admin users can only see assigned courses
  - Course creation restricted to admins only
  - Course manager page shows appropriate content per role
- **AVATAR STYLING FIX (January 2025)**:
  - Fixed avatar border styling from square to circular
  - Added proper ring styling with yellow color (#fdb933)
  - Enhanced avatar component with rounded-full wrapper
- **CONSULTANT ASSIGNMENTS SYSTEM (January 2025)**:
  - Full consultant-student assignment management system
  - Support for individual, community, generation, and school-wide assignments
  - Consultant assignments page at `/admin/consultant-assignments`
  - Community-based assignments properly display affected students
  - User management page shows consultant names for students
  - Fixed Supabase foreign key expansion issues
  - Assignment types: comprehensive (Completa), monitoring, mentoring, evaluation, support
  - Permissions: view progress, assign courses, message students

# KNOWN ISSUES
- ✅ FIXED: PDF export runtime error with jsPDF (created wrapper for SSR)
- ✅ FIXED: Authentication edge cases with RLS policies (enhanced auth system)

# PENDING TASKS
## Quiz Review System Testing
- ⏳ Test open-ended question creation in quiz blocks
- ⏳ Test quiz submission with mixed question types
- ⏳ Verify consultant notifications for pending reviews
- ⏳ Test grading workflow in `/quiz-reviews` page
- ⏳ Verify student receives graded results

## Group Assignments (Phase 2) - ROLE CORRECTIONS APPLIED
- ✅ Database schema created with corrected RLS policies
- ✅ UI components updated (consultores create, docentes submit)
- ✅ Service layer implemented with role checks
- ✅ Workspace navigation updated
- ✅ Database migration applied
- ✅ Role correction SQL created: `/database/fix-group-assignments-roles.sql`
- ⏳ **NEXT STEP**: Apply role correction SQL in Supabase
- ⏳ Test assignment creation by CONSULTORES
- ⏳ Test group management by CONSULTORES
- ⏳ Test submission by DOCENTES (students)
- ⏳ Verify grading workflow by CONSULTORES

## Implementation Details
- **Location**: Group assignments integrated into `/pages/community/workspace.tsx`
- **New Section**: "Tareas Grupales" in collaborative space sidebar
- **Key Files**:
  - `/lib/services/groupAssignments.js` - Service layer
  - `/pages/community/workspace/assignments/[id]/groups.tsx` - Group management
  - `/pages/community/workspace/assignments/[id]/discussion.tsx` - Group chat
  - `/database/add-group-assignments.sql` - Database schema
  - `/scripts/apply-group-assignments.js` - Migration script
- **Documentation**: See `GROUP_ASSIGNMENTS_IMPLEMENTATION.md` for full details

# DEVELOPMENT CONTACTS
**Technical Support**: Brent Curtis  
**Phone**: +56941623577  
**Email**: bcurtis@nuevaeducacion.org