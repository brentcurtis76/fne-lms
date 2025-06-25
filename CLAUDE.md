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
- **DEV ROLE IMPERSONATION FIXES (January 2025)**:
  - Fixed critical bug where dev role impersonation wasn't working correctly for sidebar navigation
  - Issue: When impersonating non-admin roles, sidebar still showed admin-only items
  - Root cause: `isGlobalAdmin` and `hasAdminPrivileges` functions were checking actual database role even during impersonation
  - Solution: Updated both functions to return only impersonated role privileges when impersonation is active
  - Updated dashboard.tsx, detailed-reports.tsx, and feedback.tsx to use `getEffectiveRoleAndStatus` utility
  - Added debug logging to help troubleshoot role detection issues
  - **UI Improvement**: Replaced native browser confirm() dialog with custom modal matching FNE design
  - **Better UX**: Replaced alert() calls with toast notifications using react-hot-toast
- Avatar performance optimization with caching
- Real-time notifications complete
- Expense report export (PDF/Excel)
- Contract annex system
- Messaging @mentions
- User notification preferences
- Assignment system complete with enrolled courses integration
- Assignment stats simplified to show work status (Active, Completed, In Progress, New)
- **INSTAGRAM-STYLE FEED (January 2025) - PHASE 1 COMPLETE**:
  - Replaced activity feed in "Mi Resumen" with Instagram/LinkedIn-style social feed
  - Post types: text, images (carousel), documents, links
  - Interactions: likes, comments (with nested replies), saves, view counts
  - Custom confirmation modals instead of browser dialogs
  - Edit/delete functionality for own posts
  - Database tables created: community_posts, post_reactions, post_comments, etc.
  - Storage bucket created: post-media with proper RLS policies
  - **COMPLETED FEATURES**:
    - ✅ Comment thread UI with nested replies, pagination, and delete functionality
    - ✅ Community-based post visibility (users only see posts from their communities)
    - ✅ Custom community names display throughout the interface
    - ✅ Role-based access control (admins see all, consultants see assigned schools, others see own community)
    - ✅ Storage policies fixed for image uploads
  - **LOCATION**: Collaborative Space → "Mi Resumen" tab
  - **NEXT STEPS** (Phase 2):
    1. Add real-time updates via Supabase subscriptions
    2. Implement poll and question post types
    3. Enhanced reactions beyond like/save
    4. Hashtags and @mentions support
  - **PHASE 3 FEATURES** (Future): Stories, AI feed algorithm, analytics
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
- **COLLABORATIVE WORKSPACE FIXES (January 2025)**:
  - Fixed missing tab navigation in collaborative workspace
  - Created WorkspaceTabNavigation component for consistent tab UI
  - Fixed component unmounting issue - components now stay mounted using CSS display
  - Implemented consultant view for group assignments (read-only access)
  - Added comprehensive unit tests for groupAssignmentsV2 service
  - Set up workspace access for consultant users with proper role entries
  - Fixed group assignments not displaying due to table reference errors
- **REPORTING ACCESS CONTROL (January 2025)**:
  - Implemented strict role-based access control for reporting system
  - Docentes (teachers) have NO ACCESS to reports - immediate redirect
  - Reports section completely hidden from Docente sidebar navigation
  - Role-specific data filtering:
    - Admins: See all platform data
    - Consultants: See only assigned students
    - Equipo Directivo: See their school's data
    - Líder de Generación: See their generation's data
    - Líder de Comunidad: See their community's data
  - Added visual indicators showing data access scope
  - Created report filtering service and utilities
  - Documentation: See `REPORTING_ACCESS_CONTROL.md`
- **ADMIN PASSWORD RESET SYSTEM (January 2025)**:
  - Administrators can reset any user's password to a temporary password
  - Password reset button (key icon) added to user management page
  - Clean modal interface for setting temporary passwords
  - Random secure password generator included
  - Users forced to change password on next login after admin reset
  - Different messaging for admin-reset vs first-time login
  - Strong password requirements enforced (8+ chars, uppercase, lowercase, number)
  - All password resets logged in audit_logs table for security
  - Database migration: `/database/add-password-reset-tracking.sql`
  - Documentation: See `ADMIN_PASSWORD_RESET.md`
- **USER MANAGEMENT UI REDESIGN (January 2025)**:
  - Complete redesign of user management interface for better UX
  - Single unified interface (removed confusing toggle between classic/modern views)
  - Expandable rows - click any user to see details and actions
  - Clean stats cards for filtering by status (Pending, Approved, All)
  - Organized actions section within expanded view
  - Better information hierarchy with avatars, role badges, and assignment counts
  - All actions accessible with single click - no more hunting for features
  - New component: `UnifiedUserManagement.tsx`
  - Removed over 370 lines of redundant Classic UI code
  - Mobile responsive with proper touch targets
  - Documentation: See `USER_MANAGEMENT_REDESIGN.md`
- **FEEDBACK SYSTEM IMPROVEMENTS (January 2025)**:
  - Fixed authentication error by moving service role key usage to server-side
  - Created `/api/feedback/notify-admins` endpoint for secure notification handling
  - Fixed storage upload errors by adding proper RLS policies
  - Added "Copy for Claude Code" feature for easy error reporting
  - Fixed course deletion foreign key constraints
  - Fixed missing sidebar items on feedback page
  - Added "Soporte Técnico" quick action to admin dashboard
  - Updated feedback detail modal to show user avatars
  - Fixed "Cerrar" button confusion - now clearly labeled "Cerrar ticket" vs "Cerrar ventana"
  - Fixed feedback status transitions (new → seen → in_progress → resolved → closed)
  - Database migration: `/database/add-closed-at-to-feedback.sql`
- **NOTIFICATION SYSTEM FIXES (January 2025)**:
  - Created missing `/api/notifications` and `/api/notifications/mark-read` endpoints
  - Fixed table name mismatch (notifications vs user_notifications)
  - Updated ModernNotificationCenter to fetch directly from Supabase
  - Fixed field mapping (is_read → read_at)
  - Notifications from feedback system now properly appear in notification center
- **COLLABORATIVE WORKSPACE FEED ENHANCEMENTS (January 2025)**:
  - Fixed document upload in feed - was only accepting images
  - Added support for PDF, Word, Excel, PowerPoint, and text files
  - Updated PostMedia type to include 'document' type
  - Fixed file input accept attribute race condition
  - Documents now display with proper icons, names, and file sizes
  - Removed fake view counts that were auto-incrementing
  - View count feature completely removed as it provided no real value
- **CONSULTANT ASSIGNMENTS FIX (June 2025)**:
  - Fixed missing consultant names in consultant assignments page
  - Issue: Consultant profiles had NULL first_name/last_name values
  - Fixed API to properly filter null IDs when fetching user profiles
  - Added fallback handling for missing names in UI
  - Updated consultant profile data in database
  - Added debugging logs for troubleshooting
- **GROUP ASSIGNMENTS PDF UPLOAD FIX (June 2025)**:
  - Created missing 'course-materials' storage bucket
  - Added RLS policies for authenticated users to upload/manage files
  - Improved file upload error handling with specific messages
  - Added file type validation for PDF, Word, Excel, PowerPoint, images
  - Added progress indicator during file upload
  - Sanitized filenames to prevent upload issues
  - 10MB file size limit enforced
- **COLLABORATIVE SPACE IMAGE UPLOAD FIX (June 2025)**:
  - Fixed images not displaying in collaborative space message threads
  - Issue: Messaging system wasn't properly handling attachments
  - Root cause: Empty attachment arrays being returned
  - Solution: Implemented full attachment upload functionality in messagingUtils-simple.ts
  - Added inline image preview display in MessageCard component
  - Images now display in a grid layout within messages
- **BIBLIOGRAPHY IMAGE SUPPORT (June 2025)**:
  - Added ability to upload images to bibliography sections
  - Extended BibliographyItem type to support 'image' type
  - Added image preview display in bibliography editor
  - Implemented file validation for image types (JPG, PNG, GIF, etc.)
  - Added inline image previews in student view
  - Added comprehensive unit tests for image functionality
  - Success messages now differentiate between PDF and image uploads
- **QUIZ SYSTEM SIMPLIFICATION (June 2025)**:
  - **Major Change**: Removed all scoring and grading from quiz system
  - Replaced numerical scores with simple pass/needs_review status
  - Focus shifted to constructive feedback instead of grades
  - Updated QuizReviewPanel to remove score inputs and calculations
  - Added pass/needs_review radio buttons for consultants
  - Required feedback when marking as "needs review"
  - Created QuizResultDisplay component for learning-focused student view
  - Updated all quiz services to remove score calculations
  - New database columns: review_status, general_feedback
  - Created grade_quiz_feedback function for simplified reviews
  - Updated notifications to be feedback-focused
  - **Database Migration Applied**: simplify_quiz_feedback_v2
  - Philosophy: Learning and improvement through feedback, not grades

# KNOWN ISSUES
- ✅ FIXED: PDF export runtime error with jsPDF (created wrapper for SSR)
- ✅ FIXED: Authentication edge cases with RLS policies (enhanced auth system)
- ✅ FIXED: Block deletion and visibility persistence in course builder (January 2025)
- ✅ FIXED: Community leader role assignment for schools without generations (January 2025)

# SUPABASE MCP CONFIGURATION (January 23, 2025)
- **MCP Server Added**: Full read/write access to FNE LMS Supabase project
- **Token**: Configured in user scope (available across all projects)
- **Project Ref**: sxlogxqzmarhqsblxmtj
- **Capabilities**: Direct database queries, schema modifications, data management, RLS policies
- **Documentation**: See `SUPABASE_MCP_SETUP.md` and `SUPABASE_MCP_QUICK_REFERENCE.md`

# PENDING TASKS

## Dev Role Impersonation - Complete Fix Needed
- ⏳ **26 pages still need updates** to use `getEffectiveRoleAndStatus` instead of checking `profile.role` directly
- ⏳ Run `node scripts/fix-role-impersonation.js` to see list of pages needing fixes
- ⏳ Each page needs:
  1. Import `getEffectiveRoleAndStatus` from utils/roleUtils
  2. Replace direct `profileData.role` checks with the utility function
  3. Add `userRole` state and pass it to MainLayout component
- ⏳ Without these fixes, dev impersonation won't work correctly on those pages

## Instagram Feed - Phase 1 Completion (PRIORITY)
- ✅ Database tables and RLS policies working
- ✅ Storage bucket configured
- ✅ Basic post creation and interactions functional
- ⏳ **IMMEDIATE**: Build comment thread UI component
- ⏳ Add real-time subscriptions for live updates
- ⏳ Implement poll and question post types
- ⏳ Multi-user testing and verification

## Quiz Review System Testing
- ⏳ Test open-ended question creation in quiz blocks
- ⏳ Test quiz submission with mixed question types
- ⏳ Verify consultant notifications for pending reviews
- ⏳ Test grading workflow in `/quiz-reviews` page
- ⏳ Verify student receives graded results

## Group Assignments V2 - Testing & Verification
- ✅ Database migration applied (MANUAL_MIGRATION_group_assignments_v2_corrected.sql)
- ✅ Fixed missing tab navigation in collaborative workspace
- ✅ Fixed component state persistence issues
- ✅ Implemented consultant view for group assignments
- ✅ Created comprehensive unit tests (9 tests passing)
- ✅ Set up consultant workspace access
- ⏳ Create storage bucket 'assignments' in Supabase dashboard
- ⏳ Test complete flow from lesson to submission with real users
- ⏳ Verify consultant notifications on submission
- ⏳ Test file upload functionality in group submissions

## Reporting System Enhancements
- ✅ Implemented role-based access control
- ✅ Blocked Docente access completely
- ⏳ Create database views for aggregated report data
- ⏳ Implement RLS policies for report tables
- ⏳ Add performance indexes for role-based queries
- ⏳ Test with production data volumes

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

# DEVELOPMENT TEAM
**Technical Support**: Brent Curtis  
**Phone**: +56941623577  
**Email**: bcurtis@nuevaeducacion.org

**Dev Role Users**:
- Brent Curtis (brent@perrotuertocm.cl)
- Mora del Fresno (mdelfresno@nuevaeducacion.org) - Added June 2025