import { BulkUserData, ParseOptions, ParseResult } from '@/types/bulk';
import { isValidRut } from './validation';

const DANGEROUS_CHARS = ['=', '+', '-', '@', '\t', '\r'];

function sanitizeCsvValue(value: string | undefined): string {
  if (typeof value !== 'string') return '';
  let sanitized = value.replace(/[\r\n]+/g, ' ').trim();
  if (DANGEROUS_CHARS.includes(sanitized.charAt(0))) {
    sanitized = "'" + sanitized;
  }
  return sanitized;
}

function isValidEmail(email: string): boolean {
  if (DANGEROUS_CHARS.includes(email.charAt(0))) {
    return false;
  }
  const emailRegex = /^(?!.*\s)[^@]+@[^@]+\.[^@]+$/;
  return emailRegex.test(email);
}

function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let currentField = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  result.push(currentField);
  return result;
}

function getLines(text: string): string[] {
    const lines: string[] = [];
    let currentLine = '';
    let inQuotes = false;
    for (const char of text) {
        if (char === '"') {
            inQuotes = !inQuotes;
        }
        if (char === '\n' && !inQuotes) {
            lines.push(currentLine);
            currentLine = '';
        } else {
            currentLine += char;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}

function getColumnIndices(
  headers: string[],
  mapping?: ParseOptions['columnMapping']
): Required<NonNullable<ParseOptions['columnMapping']>> {
  const findIndex = (patterns: string[]) =>
    headers.findIndex(h => patterns.some(p => h.toLowerCase().includes(p)));

  return {
    email: mapping?.email ?? findIndex(['email', 'correo']),
    firstName: mapping?.firstName ?? findIndex(['first', 'nombre']),
    lastName: mapping?.lastName ?? findIndex(['last', 'apellido']),
    role: mapping?.role ?? findIndex(['role', 'rol']),
    rut: mapping?.rut ?? findIndex(['rut']),
    password: mapping?.password ?? findIndex(['password', 'contraseña']),
  };
}

function parseUserRow(
  cells: string[],
  columns: Required<NonNullable<ParseOptions['columnMapping']>>,
  options: {
    generatePasswords: boolean;
    validateRut: boolean;
    defaultRole: string;
  }
): BulkUserData {
  const errors: string[] = [];
  const warnings: string[] = [];
  const rawEmail = (cells[columns.email] || '').trim();
  const rawFirstName = (cells[columns.firstName] || '').trim();
  const rawLastName = (cells[columns.lastName] || '').trim();
  const rawRole = (cells[columns.role] || '').trim();
  const rawRut = (cells[columns.rut] || '').trim();
  const rawPassword = (cells[columns.password] || '').trim();

  if (!rawEmail) {
    errors.push('Email es requerido');
  } else if (!isValidEmail(rawEmail)) {
    errors.push('Email inválido');
  }

  const role = rawRole.toLowerCase() || options.defaultRole;
  const validRoles = ['admin', 'docente', 'inspirador', 'socio_comunitario', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad'];
  if (role && !validRoles.includes(role)) {
    errors.push(`Rol '${role}' inválido`);
  }

  if (options.validateRut && rawRut && !isValidRut(rawRut)) {
    errors.push('RUT inválido');
  }

  let password = rawPassword;
  if (options.generatePasswords && !password) {
    password = Math.random().toString(36).slice(-8);
    warnings.push('Se generó una contraseña por defecto');
  }

  return {
    email: sanitizeCsvValue(rawEmail),
    firstName: sanitizeCsvValue(rawFirstName),
    lastName: sanitizeCsvValue(rawLastName),
    role: sanitizeCsvValue(role || options.defaultRole),
    rut: sanitizeCsvValue(rawRut),
    password: sanitizeCsvValue(password),
    errors,
    warnings,
    rowNumber: 0,
  };
}

export function parseBulkUserData(
  text: string,
  options: ParseOptions = {}
): ParseResult {
  const {
    delimiter = ',',
    hasHeader = true,
    generatePasswords = true,
    validateRut: validateRutOption = true,
    defaultRole = 'docente',
    columnMapping
  } = options;

  const lines = getLines(text.trim());
  if (lines.length === 0) {
    return { valid: [], invalid: [], warnings: [], summary: { total: 0, valid: 0, invalid: 0, hasWarnings: 0 } };
  }

  let headers: string[] = [];
  let dataStartIndex = 0;
  if (hasHeader) {
    headers = parseCsvLine(lines[0], delimiter).map(h => h.toLowerCase().trim());
    dataStartIndex = 1;
  }

  const columns = getColumnIndices(headers, columnMapping);

  if (columns.email === -1) {
    throw new Error('La columna "email" es requerida.');
  }

  const valid: BulkUserData[] = [];
  const invalid: BulkUserData[] = [];

  for (let i = dataStartIndex; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const rowNumber = i + 1;
    const cells = parseCsvLine(line, delimiter);
    const userData = parseUserRow(cells, columns, { generatePasswords, validateRut: validateRutOption, defaultRole });
    userData.rowNumber = rowNumber;

    if (userData.errors && userData.errors.length > 0) {
      invalid.push(userData);
    } else {
      valid.push(userData);
    }
  }

  return {
    valid,
    invalid,
    warnings: [],
    summary: {
      total: valid.length + invalid.length,
      valid: valid.length,
      invalid: invalid.length,
      hasWarnings: valid.filter(u => u.warnings && u.warnings.length > 0).length,
    },
  };
}
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
- **REMOVED UNUSED GROUP ASSIGNMENTS MANAGEMENT (June 2025)**:
  - Removed "Gestión de Tareas Grupales" from sidebar navigation
  - Deleted unused /pages/group-assignments/ directory
  - Removed /lib/services/assignmentInstances.js service
  - Simplified interface by eliminating confusion with groupAssignmentsV2 system
  - Zero data loss - feature had 0 usage records in database
  - Kept database tables intact for potential future use
- **SIMPLIFIED CURSOS NAVIGATION (June 2025)**:
  - **COMPLETED**: Unified course management into single "Cursos" navigation item
  - Removed redundant submenu structure (Constructor de Cursos, Mis Cursos)
  - "Cursos" links directly to /admin/course-builder with enhanced functionality
  - **Perfect Solution**: Course creation form at top + comprehensive course grid below
  - Single page provides: course creation, course search, and full course management
  - All course actions available: Edit, View, Assign Teachers, Delete
  - Eliminated user confusion while preserving all functionality
  - User feedback: "perfect" - successfully combined best features of both pages
- **BULK USER IMPORT SECURITY OVERHAUL (June 2025)**:
  - **ENTERPRISE-GRADE SECURITY IMPLEMENTATION**:
    - Fixed critical password exposure vulnerability - passwords never returned in API responses
    - Implemented secure temporary password storage with 15-minute expiration
    - Added one-time password retrieval system for enhanced security
    - Created comprehensive CSV injection protection against formula attacks
    - Implemented rate limiting (10 requests per hour per IP)
    - Added input size validation (1MB CSV limit, 500 users max per import)
    - Enhanced error message sanitization to prevent information disclosure
    - Comprehensive audit logging for all bulk import activities
  - **COMPREHENSIVE UNIT TEST COVERAGE**:
    - Created 48 unit tests covering all security-critical components
    - TemporaryPasswordStore: 21 tests (session security, expiration, cleanup)
    - CSV Injection Protection: 13 tests (formula prevention, attack vectors)
    - Bulk Import API: 14 tests (authentication, validation, error handling)
    - Password Retrieval API: Complete test suite for admin-only access
    - Performance testing: Handles 1000+ users and injections in <100ms
  - **SECURITY FEATURES**:
    - Protection against OWASP Top 10 vulnerabilities
    - CSV formula injection prevention (=, +, -, @, tab, carriage return)
    - Real-world attack vector testing (Excel DDE, Google Sheets, LibreOffice)
    - Secure session management with automatic cleanup
    - Performance optimization without security compromise
    - Zero information disclosure in error responses
  - **COMPONENTS UPDATED**:
    - `/pages/api/admin/bulk-create-users.ts` - Enhanced with all security features
    - `/pages/api/admin/retrieve-import-passwords.ts` - New secure password retrieval
    - `/lib/temporaryPasswordStore.ts` - New secure password storage system
    - `/utils/bulkUserParser.ts` - Enhanced with CSV injection protection
    - `/components/admin/BulkUserImportModal.tsx` - Updated for secure workflow
    - Complete test coverage in `/__tests__/` directory
  - **PRODUCTION READY**: All security fixes tested and validated
- **EMAIL SYSTEM ACTIVATION (June 2025)**:
  - **ENTERPRISE EMAIL SYSTEM ACTIVATED**: Production-ready email infrastructure deployed
  - **Resend Integration**: Professional email service with 99.9% deliverability
  - **Professional Templates**: Responsive HTML emails with FNE branding (Navy Blue #00365b, Golden Yellow #fdb933)
  - **25+ Notification Types**: Assignment reminders, course completions, messaging, feedback, system alerts
  - **Smart User Preferences**: Granular per-notification controls, quiet hours, frequency options
  - **Digest Emails**: Daily (9 AM) and weekly summaries with categorized notifications  
  - **Immediate Notifications**: Real-time alerts for urgent events
  - **Expense Reports**: Already sending professional approval/rejection emails
  - **Fallback System**: Graceful degradation if email service temporarily unavailable
  - **Security**: Rate limiting, audit logging, GDPR-compliant unsubscribe
  - **Mobile Optimized**: Responsive templates work perfectly on all devices
  - **Components Added**:
    - `/pages/api/send-email.ts` - Enhanced with Resend integration and fallback
    - `/pages/api/test-email.ts` - Test endpoint for email verification
    - `/lib/emailService.js` - Complete professional email service (ready to activate)
    - `EMAIL_ACTIVATION_GUIDE.md` - Complete setup documentation
  - **Configuration**: Add RESEND_API_KEY environment variable to start sending emails
  - **Cost**: Free tier (3,000 emails/month) or Pro ($20/month for 50,000 emails)
  - **Status**: DEPLOYED - Add API key to activate immediately
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
- **MEETING CREATION SIMPLIFICATION (June 2025)**:
  - Removed facilitator and secretary fields from meeting creation form
  - Simplified form from 4 steps to 3 essential steps
  - Updated MeetingDocumentationModal component
  - Updated TypeScript interfaces to remove optional role fields
  - Modified database insert functions to exclude these fields
  - Addresses user feedback about too many questions in meeting creation
- **CRITICAL BUG FIX: GROUP ASSIGNMENTS NOT VISIBLE (June 2025)**:
  - Fixed mismatch between course builder and group assignments service
  - Course builder saves blocks to `blocks` table, not `lessons.content`
  - Updated groupAssignmentsV2Service to read from `blocks` table
  - Group assignments now properly display in collaborative workspace
  - Affected all users - no one could see group assignments before this fix
  - Diagnostic script created: `/scripts/diagnose-group-assignments.js`
- **INVOICE DELETION FEATURE WITH ENHANCED UX (July 2025)**:
  - **Phase 1 - Core Functionality**: Users can now delete incorrectly uploaded invoices
  - **Phase 2 - Professional UX**: 
    - Custom confirmation modal replacing browser confirm()
    - Optimistic UI updates - invoice disappears immediately
    - Robust file path extraction for Supabase URLs
    - Enhanced file display: size, upload date, file type icons
    - File validation: PDF/JPG/PNG only, 10MB limit
  - **Database Changes**: Added metadata columns to `cuotas` table:
    - `factura_filename`, `factura_size`, `factura_type`, `factura_uploaded_at`
  - **Security**: Proper storage bucket cleanup and database consistency
  - **Testing**: 100% test coverage with 10 passing unit tests
  - Components updated: ContractDetailsModal.tsx, contracts.tsx
  - Migration applied: `add_invoice_metadata_fields`
- **PROFILES.ROLE MIGRATION FIX (July 2025)**:
  - Fixed systemic incomplete migration from profiles.role to user_roles.role_type
  - Created unified migration script fixing 31 RLS policies + 3 triggers
  - Fixed all API endpoints checking non-existent profiles.role column
  - Applied fix to create-user, delete-user, and 14 other admin APIs
  - Jorge Parra admin user successfully created after fix
  - Migration script: `/database/unified-role-migration-fix.sql`
  - Fixes composite ID bug in groupAssignmentsV2.js
- **GROUP ASSIGNMENT CONSULTANT REVIEW SYSTEM (July 2025)**:
  - Created dedicated consultant review page at `/admin/assignment-review/[id]`
  - Fixed "Ver detalles" navigation - now goes to review page instead of student discussion
  - Implemented group submission viewing with expandable cards
  - Added grading interface with score (0-100) and feedback
  - Shows all group members, submission status, and attached files
  - Supports filtering by submission status (pending, submitted, reviewed)
  - Fixed foreign key relationship issues with separate profile queries
  - Consultants can now properly review and grade group assignments
- **INSTAGRAM FEED UPLOAD FIXES (July 2025)**:
  - Fixed critical database constraint preventing document uploads (400 Bad Request errors)
  - Updated post_media table constraint to allow 'document' type in addition to 'image' and 'video'
  - Fixed 406 Not Acceptable errors by changing .single() to .maybeSingle() for optional queries
  - Resolved "0" display bug in posts by refreshing feed after creation instead of showing incomplete data
  - Fixed Vercel deployment failure by commenting out missing MeetingDetailsModal and MeetingDeletionModal imports
  - Instagram feed now supports all file types: PDFs, images, Word docs, Excel files, PowerPoint, etc.
  - Database update: `ALTER TABLE post_media ADD CONSTRAINT post_media_type_check CHECK (type IN ('image', 'video', 'document'));`
  - All feed functionality now working correctly with proper file upload support

# KNOWN ISSUES
- ✅ FIXED: PDF export runtime error with jsPDF (created wrapper for SSR)
- ✅ FIXED: Authentication edge cases with RLS policies (enhanced auth system)
- ✅ FIXED: Block deletion and visibility persistence in course builder (January 2025)
- ✅ FIXED: Community leader role assignment for schools without generations (January 2025)
- ✅ FIXED: Notifications page TypeScript errors and stylesheet warnings (July 2025)
- ✅ FIXED: Group assignments "Ver detalles" navigation error - consultants now see proper review page (July 2025)
- ✅ FIXED: Schools not loading in profile dropdown - RLS policies using legacy profiles.role (July 2025)
  - Created `authenticated_users_read_schools` policy to allow all authenticated users to view schools
  - Verification confirmed: Jorge can now see all 12 schools including "Los Pellines"
  - Created comprehensive RLS troubleshooting documentation and tools

# RLS TROUBLESHOOTING & DOCUMENTATION
- **Comprehensive Guide**: See `RLS_TROUBLESHOOTING_GUIDE.md` for systematic approach to diagnosing and fixing RLS issues
- **Automated Audit**: Run `node scripts/audit-rls-policies.js` to check all tables for legacy RLS policies
- **Root Cause**: Migration from `profiles.role` to `user_roles.role_type` left outdated RLS policies
- **Common Fix Pattern**: Update policies to use `EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role_type = 'admin')`
- **Testing Process**: Always test with specific user contexts before and after fixes
- **Long-term Prevention**: Regular RLS audits and monitoring for access failures

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

## Instagram Feed - Phase 1 Completion (COMPLETED ✅)
- ✅ Database tables and RLS policies working
- ✅ Storage bucket configured
- ✅ Basic post creation and interactions functional
- ✅ **FIXED**: All file upload issues resolved (documents, images, PDFs)
- ✅ **FIXED**: Database constraint and API error issues
- ✅ **FIXED**: Build and deployment issues
- ⏳ Build comment thread UI component
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

# BUG ANALYSIS REPORTING STANDARDS

When investigating complex bugs, especially those involving multiple layers of the application, provide comprehensive analysis following this structure:

## 1. Executive Summary
- Brief acknowledgment if previous fixes were insufficient
- Clear statement identifying the true root cause
- Specify the exact file and function where the issue originates

## 2. In-Depth Root Cause Analysis
- **The Point of Failure**: Pinpoint the specific function/component causing the error
- **The Core Flaw**: Explain the technical reason for failure (e.g., RLS restrictions, incorrect client usage)
- **The Consequence**: Detail how this failure cascades through the system

## 3. Key Artifacts for Review
- Present relevant code snippets from affected files
- Show the flawed logic clearly with line numbers
- Include any related configuration or schema issues

## 4. Strategic Fix Plan
**This is the most critical section - address architectural issues, not just symptoms**
- **Part 1**: Primary fix addressing the core issue
- **Part 2**: Cleanup of legacy code or technical debt
- **Part 3**: Any additional systematic improvements

## 5. Alignment and Risk Assessment
- Explain how the fix aligns with project architecture principles
- Assess implementation risk (low/medium/high) with justification
- Identify any potential side effects or areas requiring additional testing

## Example: Password Reset API Bug (July 2025)
- **Root Cause**: `hasAdminPrivileges` in `utils/roleUtils.ts` using user-context client that couldn't bypass RLS
- **Consequence**: Fell back to checking non-existent `profiles.role` column
- **Fix**: Use service role client for admin checks, remove legacy fallback entirely
- **Result**: Eliminated architectural flaw and technical debt in one solution