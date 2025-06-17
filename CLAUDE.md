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
- **BLOCK DELETION AND VISIBILITY FIX (January 2025)**:
  - Fixed block deletion using correct Supabase syntax (.eq instead of .match)
  - Added persistent visibility state with is_visible database field
  - Blocks now properly delete and stay deleted
  - Collapse/expand state persists across page refreshes
  - Database migration: `/database/add_visibility_to_blocks.sql`
- **GROUP ASSIGNMENTS V2 - SIMPLIFIED IMPLEMENTATION (January 2025)**:
  - Complete re-engineering based on consultant feedback
  - Group assignments now created directly in lesson blocks
  - Automatically appear in collaborative workspace when courses assigned to communities
  - Students see informational message in lessons directing to collaborative space
  - No blocking of lesson progression
  - Simplified database schema: group_assignment_groups, group_assignment_members, group_assignment_submissions
  - Automatic group creation and assignment
  - Consultant notifications on submission
  - New service: groupAssignmentsV2Service
  - New component: GroupSubmissionModalV2
  - Migration: Run `/database/MANUAL_MIGRATION_group_assignments_v2.sql` in Supabase
- **GROUP ASSIGNMENT RESOURCES (January 2025)**:
  - Added ability for instructors to attach links and documents to group assignments
  - Resources only visible in collaborative workspace, not in lessons
  - Support for external links and file uploads (10MB limit)
  - Updated components: GroupAssignmentBlockEditor, GroupSubmissionModalV2
  - New TypeScript interface: GroupAssignmentResource
  - Comprehensive unit test coverage (41 tests passing)
- **QUIZ SYSTEM ENHANCEMENTS (January 2025)**:
  - Added open-ended question type to quiz blocks
  - New quiz submission tracking system
  - Consultant review interface for open-ended answers
  - Real-time notifications for pending reviews
  - New page: `/quiz-reviews` for consultants to grade open questions
  - Enhanced quiz types: multiple choice, true/false, open-ended
- **QUIZ LEARNING-FOCUSED UPDATE (January 2025)**:
  - Removed all score/grade displays from student view
  - Implemented 2-tier feedback system for MC/TF questions
  - Tier 1: General encouragement to review answers
  - Tier 2: Specific questions marked for attention
  - Quiz submissions now save to database properly
  - New component: `LearningQuizTaker` replaces inline quiz rendering
  - Focus on learning, not grades
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
- **LESSON COMPLETION UI UPDATE (January 2025)**:
  - Changed completion icon from trophy to thumbs up per user request
  - Updated in `/pages/student/lesson/[lessonId].tsx`
- **GROWTH COMMUNITIES CUSTOMIZATION (January 2025)**:
  - Communities can now rename themselves and add a group image (like WhatsApp)
  - DEMOCRATIC: Any community member can edit settings (not just leaders)
  - New fields: custom_name, image_url, image_storage_path in community_workspaces
  - New component: WorkspaceSettingsModal for editing community settings
  - New service: communityWorkspaceService for handling updates
  - Image upload support with 5MB limit (JPEG, PNG, WebP)
  - Migration: `/database/add-community-customization.sql`
  - Storage bucket "community-images" created with public access
  - ✅ DEPLOYED: Database migration and storage policies applied
  - Access points: Dashboard (Mi Panel) and Collaborative Space header
  - Prominent display with gradient header in collaborative space
- **COMMUNITY LEADER ROLE FIX (January 2025)**:
  - Fixed error when assigning "Líder de Comunidad" role to schools without generations
  - Database constraint now allows NULL generation_id for schools with has_generations=false
  - Frontend shows clear messages about generation requirements
  - Prevents assigning "Líder de Generación" to schools without generations
  - Migration: `/database/fix-community-leader-without-generation.sql`
  - Apply script: `/scripts/apply-community-leader-fix.js`
- **GENERATION DELETION BUG FIX (January 2025)**:
  - Fixed root cause: has_generations flag not updating when generations deleted
  - Added database triggers to automatically maintain flag consistency
  - Triggers update has_generations when generations are added/deleted
  - Retroactively fixes existing data inconsistencies
  - Migration: `/database/fix-generation-deletion-bug.sql`
  - No code changes needed - triggers handle it automatically
- **COMMUNITY DROPDOWN BUG FIX (January 2025)**:
  - Fixed root cause: school_id type mismatch (string vs integer)
  - Updated `getAvailableCommunitiesForAssignment` to use parseInt() for school_id
  - This ensures newly created communities appear immediately in dropdowns
  - Migration: `/database/fix-school-id-type-consistency.sql` (for verification)
  - Fix prevents the bug from recurring for all future community assignments
  - **Important**: Communities are filtered by selected school. To see all communities, clear school selection first.

# KNOWN ISSUES
- ✅ FIXED: PDF export runtime error with jsPDF (created wrapper for SSR)
- ✅ FIXED: Authentication edge cases with RLS policies (enhanced auth system)
- ✅ FIXED: Block deletion and visibility persistence in course builder (January 2025)
- ✅ FIXED: Community leader role assignment for schools without generations (January 2025)

# PENDING TASKS
## Quiz Review System Testing
- ⏳ Test open-ended question creation in quiz blocks
- ⏳ Test quiz submission with mixed question types
- ⏳ Verify consultant notifications for pending reviews
- ⏳ Test grading workflow in `/quiz-reviews` page
- ⏳ Verify student receives graded results

## Group Assignments V2 - SIMPLIFIED IMPLEMENTATION
- ✅ Complete re-engineering based on consultant feedback
- ✅ Group assignments now part of lesson blocks (no separate creation)
- ✅ Automatic display in collaborative workspace
- ✅ Student-facing informational block in lessons
- ✅ Simplified database schema implemented
- ✅ New service layer (groupAssignmentsV2Service)
- ✅ Updated UI components (GroupSubmissionModalV2)
- ✅ Consultant notification system
- ⏳ **NEXT STEP**: Run `/database/MANUAL_MIGRATION_group_assignments_v2.sql` in Supabase
- ⏳ Test complete flow from lesson to submission
- ⏳ Verify consultant notifications
- ⏳ Test with different user roles

## Implementation Details - Group Assignments V2
- **Location**: Group assignments integrated into `/pages/community/workspace.tsx`
- **New Section**: "Tareas Grupales" in collaborative space sidebar
- **Key Files**:
  - `/lib/services/groupAssignmentsV2.js` - Simplified service layer
  - `/components/assignments/GroupSubmissionModalV2.tsx` - Submission interface
  - `/components/student/StudentBlockRenderer.tsx` - Updated with group assignment block
  - `/database/MANUAL_MIGRATION_group_assignments_v2.sql` - Database schema
  - `/scripts/apply-group-assignments-v2.js` - Migration script (use manual SQL if fails)
- **Documentation**: See `GROUP_ASSIGNMENTS_V2_CHANGES.md` for full details

# DEVELOPMENT CONTACTS
**Technical Support**: Brent Curtis  
**Phone**: +56941623577  
**Email**: bcurtis@nuevaeducacion.org