# FNE LMS Platform - Comprehensive Development Guide

## PROJECT OVERVIEW
Comprehensive Learning Management System for Fundación Nueva Educación (FNE), a Chilean nonprofit organization that promotes deep cultural change in schools across Chile.

## DUAL DEVELOPMENT APPROACH
We are working on TWO parallel systems:
1. **IMMEDIATE**: Next.js lesson editor (prototype/testing ground)
2. **FUTURE**: WordPress/LearnDash/BuddyBoss platform (full LMS)

---

## CURRENT WORK - NEXT.JS LESSON EDITOR

### Technical Stack
- **Location**: `~/Documents/fne-lms-v2`
- **Technology**: Next.js 14.2.28 + Supabase
- **Port**: 3000 (CRITICAL - Required for Supabase integration)
- **Key Files**:
  - Supabase client: `/lib/supabase.ts`
  - Types: `/types/supabase.ts`, `/types/blocks.ts`
  - Lesson editor: `/pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx`
  - Block editors: `/components/blocks/*`

### Supabase Configuration
- **Project URL**: `https://sxlogxqzmarhqsblxmtj.supabase.co`
- **Anon Public Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E`
- **Service Role Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI`

**⚠️ Environment Variables Required:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://sxlogxqzmarhqsblxmtj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI
```

### Current Status
- ✅ Text blocks (TipTap rich text editor)
- ✅ Video blocks (URL input)
- ✅ Image blocks (upload functionality)
- ✅ **Enhanced Quiz blocks** (multiple questions, A-D answers, points, explanations, settings)
- ✅ **File Download blocks** (ready for file upload implementation)
- ✅ **External Link blocks** (ready for link management)
- ✅ **Professional Timeline Sidebar** (block navigation, no DnD conflicts)
- ✅ **Production-ready lesson editor** (all TypeScript errors fixed)

### Recent Session Updates (January 2025)
- ✅ **Block System Standardization** - Centralized block configuration system in `/config/blockTypes.ts` with consistent naming, removed icons throughout interface
- ✅ **Header Modernization** - Implemented floating button navigation with Option 3 (individual floating button effects with scale/opacity transitions)
- ✅ **Dashboard Course Management** - Distinguished between admin-created courses ("Mis Cursos") and all courses with light blue/yellow color scheme
- ✅ **Forgot Password Functionality** - Complete implementation with email reset links and `/reset-password` page
- ✅ **Remember Me Authentication** - Full session persistence control with browser close detection
- ✅ **Login as Homepage** - Simplified homepage to redirect directly to login for unauthenticated users
- ✅ **Server Stability Fixes** - Resolved TypeScript compilation errors and database query issues causing crashes
- ✅ **Student Navigation Enhancement** - Smart lesson completion with next lesson detection and course completion badges
- ✅ **Quiz Grading System** - Fixed partial credit calculation with fallback logic for undefined correctAnswerId values

### Previous Session Updates (May 25, 2025)
- ✅ **Fixed all student lesson block renderers** - All block types now display properly in student view
- ✅ **Enhanced External Links with inline preview** - Users can preview external websites within the lesson page using iframes instead of popup windows
- ✅ **Implemented lesson completion congratulations page** - Added beautiful completion screen with trophy, statistics, and navigation options when students finish lessons
- ✅ **Fixed progress tracking for admins** - Progress bar now updates correctly for admin users navigating through lessons
- ✅ **Updated brand colors throughout** - Changed all green elements to use brand yellow (#fdb933) for consistency
- ✅ **Improved error handling** - Better messages when lessons have no content vs actual errors

### Brand Colors
- Navy Blue: `#00365b`
- Golden Yellow: `#fdb933`
- Red: `#ef4044`

---

## IMMEDIATE PRIORITIES

### 1. Enhanced Quiz Block System (URGENT)

#### Data Structure
```typescript
interface QuizQuestion {
  id: string;
  question: string;
  explanation?: string;
  options: QuizOption[];
  correctAnswerId: string;
  points: number;
  orderIndex: number;
}

interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
  orderIndex: number;
}

interface QuizSettings {
  randomizeQuestions: boolean;
  randomizeAnswers: boolean;
  showScoreImmediately: boolean;
  allowRetries: boolean;
  passingScore: number;
  showExplanations: boolean;
}
```

#### UI Requirements
- Navy blue header with "Quiz Interactivo" title
- Settings panel (randomization, retries, passing score)
- Sortable question cards (@dnd-kit)
- Multiple choice (A, B, C, D) with radio selection
- Optional explanation per question
- Statistics panel (total questions, points, status)
- Validation: min 2 options, exactly 1 correct answer

### 2. File Download Block

#### Features
- Drag & drop upload interface
- Support: PDF, DOC, XLS, PPT, images, videos, ZIP (max 50MB)
- File type icons and size display
- File preview (images/PDFs)
- Individual file descriptions
- Upload progress indicators
- File validation and error handling

### 3. External Link Block

#### Features
- URL validation with visual feedback
- Categories: Resource, Reference, Tool, Reading, Video, Exercise, Example
- Auto-fetch metadata (title, description)
- Display options: list, grid, cards
- Link status checking
- Thumbnail support
- Category color coding

### 4. Timeline Editor

#### Features
- Visual horizontal timeline of lesson blocks
- Block type icons and colors
- Drag & drop reordering
- Estimated duration per block
- Progress indicators
- Mobile responsive design

---

## DATABASE SCHEMA UPDATES

```sql
-- Quiz questions table
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  explanation TEXT,
  points INTEGER DEFAULT 1,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Quiz options table
CREATE TABLE IF NOT EXISTS quiz_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES quiz_questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN DEFAULT FALSE,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Download files table
CREATE TABLE IF NOT EXISTS download_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- External links table
CREATE TABLE IF NOT EXISTS external_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  category TEXT,
  open_in_new_tab BOOLEAN DEFAULT TRUE,
  order_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## COMPREHENSIVE LMS PLATFORM (FUTURE)

### Organizational Structure
- **Multiple Schools** (each has own "Space")
- **Two Generations per School**:
  - Tractor Generation: PreK-2nd grade (flexible, increases yearly)
  - Innova Generation: 3rd-12th grade
- **Growth Communities**: 2-16 teachers each within generations

### Role Hierarchy
1. **Global Administrator (FNE)**: Full platform control, all schools
2. **Consultants**: Access to assigned schools, course assignment, reporting
3. **Leadership Team**: School-level admin, all teachers in their school
4. **Generation Leader**: One generation oversight, all communities in generation
5. **Community Leader**: Specific Growth Community (2-16 teachers)
6. **Teacher**: Course access, assignment submission, collaboration

### Multi-Role Support
- Users can hold multiple roles simultaneously
- Dynamic interface based on role permissions
- Example: Leadership Team + Generation Leader + Teacher

### Technology Stack
- **WordPress**: Base CMS
- **LearnDash**: Course creation and management
- **BuddyBoss**: Collaboration spaces and social features
- **Custom Plugins**: Role and permission management

### Key Features
- Personalized learning paths
- Multi-level reporting (Individual → Community → Generation → School → Global)
- Assignment submission system (individual and group)
- Collaboration spaces per organizational level
- Integration: Zoom, Google Drive, Padlet
- Mobile responsive Spanish interface

### Implementation Phases
1. **Phase 1**: WordPress/LearnDash/BuddyBoss setup, basic roles
2. **Phase 2**: Custom features, reporting, collaboration spaces
3. **Phase 3**: Pilot testing (one school)
4. **Phase 4**: Full launch with training
5. **Phase 5**: Social network activation, advanced features

---

## DEVELOPMENT PROGRESS LOG

### Instructions for Claude Code:
**At the end of each session, update this section with:**
1. What was completed
2. What's currently in progress
3. Any issues encountered
4. Next steps for the following session
5. Code changes made (file paths and brief descriptions)

### Session History

#### Session 2025-01-27 - UI Modernization & Authentication Enhancement

**Completed:**
- ✅ **Block System Standardization** - Created centralized `/config/blockTypes.ts` configuration with consistent naming conventions and removed all icons from block interfaces for cleaner design
- ✅ **Header Navigation Modernization** - Implemented Option 3 floating button navigation with individual button hover effects, scale animations, and dynamic background overlays using glassmorphism
- ✅ **Dashboard Course Organization** - Distinguished between admin-created courses ("Mis Cursos") and all available courses with separate sections, navigation buttons, and light blue/yellow color scheme
- ✅ **Forgot Password System** - Complete implementation including email reset functionality, `/reset-password` page, and proper error handling with Supabase auth integration
- ✅ **Remember Me Authentication** - Full session persistence control with checkbox state management, browser close detection, and localStorage/sessionStorage coordination
- ✅ **Homepage Simplification** - Converted homepage to intelligent router that redirects to login for unauthenticated users and dashboard for authenticated users
- ✅ **User Management Header Consistency** - Fixed header props passing to ensure consistent modern navigation across all admin pages
- ✅ **Authentication Flow Enhancement** - Improved login experience with toggle between login and password reset modes

**Technical Improvements:**
- ✅ **Centralized Block Configuration** - All block types now use standardized configuration from single source of truth
- ✅ **Modern CSS Animations** - Floating button effects with scale, opacity, and background transitions for enhanced UX
- ✅ **Smart Navigation Logic** - Dashboard buttons with smooth scroll to sections and dynamic course counts
- ✅ **Session Management** - Proper handling of remember me preferences with browser session detection
- ✅ **Email Integration** - Password reset emails with custom redirect URLs for seamless user experience

**User Experience Enhancements:**
- ✅ **Clean Block Interface** - Removed visual clutter by eliminating icons while maintaining functionality
- ✅ **Intuitive Course Management** - Clear separation between personal courses and all available courses
- ✅ **Seamless Authentication** - Login/signup/password reset flow with proper state management
- ✅ **Responsive Design** - Modern header navigation works across desktop and mobile devices
- ✅ **Professional Styling** - Consistent brand colors and modern UI patterns throughout

**Issues Resolved:**
- ✅ **Inconsistent Header Styles** - All pages now use the same modern floating button header
- ✅ **Missing Authentication Features** - Forgot password and remember me functionality fully operational
- ✅ **Course Management Confusion** - Clear distinction between admin-created and all available courses
- ✅ **Homepage Content Overload** - Simplified to authentication-focused routing
- ✅ **Session Persistence Issues** - Remember me functionality works correctly with browser close detection

**Code Changes:**
- `/config/blockTypes.ts` - Created centralized block configuration system with standardized naming
- `/components/layout/Header.tsx` - Implemented Option 3 floating button navigation with modern animations
- `/pages/dashboard.tsx` - Enhanced with separate course sections, navigation buttons, and light color scheme
- `/pages/login.tsx` - Added forgot password mode toggle and remember me functionality
- `/pages/reset-password.tsx` - Created new password reset page with validation and success handling
- `/pages/index.tsx` - Simplified to intelligent authentication routing
- `/pages/admin/user-management.tsx` - Fixed header props for consistent navigation
- `/components/blocks/*` - Updated all block editors to use centralized configuration

**Platform Status:**
- ✅ **Modern UI Design** - Professional floating button navigation with smooth animations
- ✅ **Complete Authentication System** - Login, signup, password reset, and session management
- ✅ **Organized Dashboard** - Clear course management with admin/student perspectives
- ✅ **Consistent Branding** - Standardized colors, spacing, and visual elements
- ✅ **Production Ready** - All major UI and authentication features operational

**Next Session Goals:**
- 🎨 **Further UI Polish** - Additional design refinements based on user feedback
- 📱 **Mobile Optimization** - Enhanced responsive design testing and improvements
- 🔧 **Performance Monitoring** - Load time optimization for better user experience
- 📊 **Analytics Integration** - User behavior tracking for platform improvements

#### Session 2025-05-26 - Critical Student Viewer Block Loading Fix

**Completed:**
- ✅ **MAJOR BUG FIX: Student lesson viewer blocks loading** - Fixed critical issue where student viewer wasn't loading any lesson blocks
- ✅ **Root cause analysis** - Student viewer was trying to extract blocks from lesson.content field instead of querying blocks table
- ✅ **Database query fix** - Added proper blocks table query with lesson_id and position ordering
- ✅ **Comprehensive debugging system** - Added extensive logging to course and lesson viewers for future troubleshooting
- ✅ **Data flow verification** - Confirmed all 6 lesson blocks (text, video, image, quiz, download, external-links) exist in database
- ✅ **Student experience restoration** - Lesson content now loads properly with all interactive blocks

**Technical Details:**
- **Problem**: Student viewer queried lessons table but never queried blocks table
- **Root Cause**: Code assumed blocks were embedded in lesson.content or lesson.blocks properties
- **Reality**: Blocks are stored in separate blocks table with lesson_id foreign key
- **Solution**: Added dedicated blocks query: `supabase.from('blocks').select('*').eq('lesson_id', lessonId).order('position')`

**Debugging Process:**
- ✅ **Deep database analysis** - Verified all lesson and block data exists correctly
- ✅ **URL corruption investigation** - Traced apparent lesson ID mismatch to frontend display issue
- ✅ **Client-side debugging** - Added comprehensive console logging for data flow tracking
- ✅ **Student vs Admin comparison** - Course builder loads blocks correctly, student viewer was missing blocks query

**Issues Resolved:**
- ✅ **"Esta lección no tiene contenido aún"** - Student lessons now load all blocks properly
- ✅ **Empty blocks array issue** - Student viewer now fetches blocks from correct database table
- ✅ **Block rendering mismatch** - All 6 block types now display correctly in student view
- ✅ **Progress tracking compatibility** - Block loading works with existing progress tracking system

**Code Changes:**
- `/pages/student/lesson/[lessonId].tsx` - Added blocks table query and removed incorrect lesson.content extraction
- `/pages/student/course/[courseId].tsx` - Added debugging logs for lesson navigation tracking
- Debug scripts created for future troubleshooting

**Testing Verified:**
- ✅ **Lesson with 6 blocks** loads all content types: text (rich formatting), video (YouTube), image (uploaded), quiz (2 questions), download (PDF file), external links (FNE website)
- ✅ **Student navigation** works correctly from course page to lesson page
- ✅ **Progress tracking** maintains compatibility with block completion system
- ✅ **Admin vs student views** both now load blocks consistently

**Platform Status:**
- ✅ **Student lesson experience** - Fully functional with all block types
- ✅ **Course structure** - Complete navigation between courses, modules, and lessons
- ✅ **Content creation** - Admin course builder creates blocks correctly
- ✅ **Data persistence** - All lesson content and user progress saving properly

**Next Session Goals:**
- 🚀 **Production deployment** - Platform ready for team access and content creation
- 📚 **Content development** - Admin team can now create full interactive lessons
- 👥 **User testing** - Student experience ready for pilot testing
- 🔧 **Performance optimization** - Monitor lesson loading speeds with real content

#### Session 2025-05-25 - Complete User Management System & Storage RLS Fix

**Completed:**
- ✅ **Fixed Supabase Storage RLS Policies** - Created 4 storage policies for public access to 'resources' bucket
- ✅ **Image Upload Functionality** - Resolved "new row violates row-level security policy" error
- ✅ **Complete User Role System** - Implemented "docente" (default) and "admin" role architecture
- ✅ **Automatic Role Assignment** - New users get "docente" role on profile completion
- ✅ **Enhanced External Link Block** - Fixed URL validation to accept URLs without protocol (auto-adds https://)
- ✅ **Professional User Management Interface** - Full admin panel at `/admin/user-management`
- ✅ **Admin User Creation** - Admins can create users directly (bypass signup process)
- ✅ **Admin User Deletion** - Complete user removal from both profiles and auth.users tables
- ✅ **Admin Role Management** - Change user roles between "docente" and "admin"
- ✅ **Beautiful UI Notifications** - Replaced all ugly browser alerts with styled toast notifications
- ✅ **Custom Confirmation Modals** - Professional delete confirmation with FNE branding
- ✅ **Fixed Page Spacing** - Proper header spacing on user management and module pages
- ✅ **Server-side Admin APIs** - Secure endpoints using service role for user operations

**Technical Improvements:**
- ✅ **Service Role API Integration** - Created `/api/admin/delete-user` and `/api/admin/update-role` endpoints
- ✅ **RLS Policy Bypass** - Admin operations work regardless of RLS restrictions
- ✅ **Proper Error Handling** - JSON parsing, network errors, and user feedback
- ✅ **Role Persistence** - All role changes properly saved to Supabase database
- ✅ **Security Implementation** - Admin verification and token validation

**User Experience Enhancements:**
- ✅ **React Hot Toast Integration** - Success (green), error (red), and warning (orange) notifications
- ✅ **Professional Modal Design** - Custom delete confirmation with warning icons and proper styling
- ✅ **Responsive Admin Interface** - Mobile-friendly user management table
- ✅ **Intuitive Navigation** - Added "Usuarios" link in admin header navigation

**Issues Resolved:**
- ✅ **Supabase Storage Upload Errors** - Fixed RLS policies for anonymous file uploads
- ✅ **URL Validation Issues** - External links now accept www.domain.com format
- ✅ **Role Update Failures** - Client-side updates blocked by RLS, now use admin APIs
- ✅ **Incomplete User Deletion** - Users now completely removed from both tables
- ✅ **Ugly Browser Notifications** - All alerts replaced with beautiful toast notifications
- ✅ **Header Spacing Issues** - Fixed layout spacing across admin pages

**Database Schema Updates:**
- ✅ **Storage RLS Policies** - 4 policies for INSERT/SELECT/UPDATE/DELETE on 'resources' bucket
- ✅ **Role System** - profiles.role field with "docente"/"admin" values
- ✅ **Environment Variables** - Added SUPABASE_SERVICE_ROLE_KEY for server-side operations

**Ready for Deployment:**
- ✅ **Production-Ready Build** - All TypeScript errors resolved
- ✅ **Image Upload Working** - Storage policies configured
- ✅ **User Management Complete** - Full admin interface functional
- ✅ **Role System Operational** - Default roles assigned, admin controls working
- ✅ **Professional UI/UX** - Consistent branding and notifications

**Code Changes:**
- `/pages/admin/user-management.tsx` - Complete user management interface with add/edit/delete functionality
- `/pages/api/admin/delete-user.ts` - Server-side API for secure user deletion using service role
- `/pages/api/admin/update-role.ts` - Server-side API for role updates bypassing RLS policies
- `/pages/profile.tsx` - Added automatic "docente" role assignment for new users and existing users
- `/components/layout/Header.tsx` - Added "Usuarios" navigation link for admin users
- `/components/blocks/ExternalLinkBlockEditor.tsx` - Enhanced URL validation to accept domains without protocol
- `/pages/admin/course-builder/[courseId]/[moduleId]/index.tsx` - Fixed header spacing with mt-48
- `.env.local` - Added SUPABASE_SERVICE_ROLE_KEY for server-side operations

**Notes:**
- **User Management System** is now production-ready with full CRUD operations
- **Role System** automatically assigns "docente" to new users, admins can promote users
- **Storage RLS Policies** enable image uploads in lesson editor
- **All UI notifications** use professional toast system instead of browser alerts
- **Admin APIs** use service role for operations that bypass RLS restrictions
- **Platform ready for team deployment** - all core functionality operational

**Next Session Goals:**
- 🚀 **Deploy to Vercel** - Set up production deployment for team access
- 🔧 **Configure Environment Variables** - Set up Supabase credentials in Vercel
- 👥 **Team Onboarding** - Share deployed URL for course content creation
- 📚 **Content Creation** - Admin team can start building courses

#### Session 2025-05-24 - Major Lesson Editor Completion & Storage Fix
**Completed:**
- ✅ **Fixed all hydration and DnD errors** that were causing console cascade failures
- ✅ **Restored functional sidebar timeline** without problematic DnD dependencies
- ✅ **Fixed all TypeScript compilation errors** (missing properties, type mismatches)
- ✅ **Replaced emoji icons with professional SVG icons** throughout the interface
- ✅ **Verified Enhanced Quiz Block** already meets all specifications (multiple questions, A-D answers, points, explanations, settings)
- ✅ **Ensured production-ready build** compiles successfully
- ✅ **Confirmed correct port 3000** for Supabase integration
- ✅ **Diagnosed Supabase storage RLS policy issue** for image uploads
- ✅ **Created comprehensive STORAGE_FIX_GUIDE.md** with step-by-step solutions

**In Progress:**
- 🔧 **Awaiting RLS policy configuration** in Supabase dashboard (user needs to apply fix)

**Issues Encountered:**
- "new row violates row-level security policy" error on image uploads
- User lacks table owner permissions to run SQL policies directly
- Supabase storage bucket exists and is public, but missing RLS policies for anonymous users

**Next Session Goals:**
- **Apply RLS policy fix** using Supabase Dashboard Storage Policies UI
- **Test image upload functionality** after policies are configured
- **Admin team can start creating course content** with full functionality including images
- Consider implementing file upload functionality for Download blocks

**Code Changes:**
- `/pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx` - Complete rewrite with clean sidebar, professional icons, fixed TypeScript issues
- `/types/blocks.ts` - Added optional `title` property to all block payload interfaces
- `/components/blocks/ExternalLinkBlockEditor.tsx` - Fixed block.title → block.payload.title references
- `/components/blocks/FileDownloadBlockEditor.tsx` - Fixed block.title → block.payload.title references
- `/components/blocks/ImageBlockEditor.tsx` - Fixed block.title → block.payload.title references
- `/components/blocks/QuizBlockEditor.tsx` - Fixed block.title → block.payload.title references
- `/components/blocks/VideoBlockEditor.tsx` - Fixed block.title → block.payload.title references
- `/components/ClientOnly.tsx` - Created client-only wrapper (no longer needed after refactor)
- `/scripts/simple-storage-fix.js` - Created storage diagnostics script to test bucket configuration
- `STORAGE_FIX_GUIDE.md` - Comprehensive guide for fixing Supabase RLS policies

**Notes:**
- **The Enhanced Quiz Block was already fully implemented** and exceeded our requirements specification
- **All block editors are production-ready** with professional UI and FNE branding
- **The lesson editor is now stable** and ready for admin team to start content creation
- **No more console errors** - clean development experience
- **Image upload requires RLS policy fix** - use Storage Policies UI in Supabase Dashboard
- **Storage bucket 'resources' confirmed working** with service role key
- **Lesson editor will serve as content authoring tool** for future WordPress/LearnDash integration

**Critical Action Required:**
1. Go to Supabase Dashboard → Storage → Policies
2. Create 4 RLS policies for 'resources' bucket (INSERT/SELECT/UPDATE/DELETE for public role)
3. Test image upload functionality
4. Begin content creation with admin team

---

## QUICK START COMMANDS

```bash
# Navigate to project
cd ~/Documents/fne-lms-v2

# Install dependencies (if needed)
npm install

# Start development server (MUST BE PORT 3000)
npm run dev
# OR explicitly set port if needed:
npm run dev -- -p 3000

# Supabase operations
npx supabase start
npx supabase db reset --local
npx supabase db push

# Build for production
npm run build
```

### Environment Setup
1. Create `.env.local` file in project root
2. Add the Supabase environment variables listed above
3. Ensure dev server runs on port 3000 (critical for Supabase connection)
4. Verify Supabase connection in browser console

## IMPORTANT REMINDERS
- **🚨 CRITICAL**: Server MUST run on port 3000 for Supabase integration - other ports will break the connection
- All UI text should be in Spanish
- Follow FNE brand colors consistently
- Implement proper error handling and validation
- Maintain mobile responsiveness
- Check `.env.local` file has correct Supabase credentials
- Verify Supabase connection in browser console on startup
- This lesson editor will eventually integrate with the WordPress LMS platform

---

## CONTACT INFORMATION
**Technical Support**: Brent Curtis  
**Phone**: +56941623577  
**Email**: bcurtis@nuevaeducacion.org

---

*Last Updated: 2025-05-26 by Claude Code*

# LMS Test Suite

This test suite verifies the core functionality of the course-related operations in the FNE LMS.

## 🧪 Test Files Overview

### ✅ `course.insert.success.test.ts`
Inserts a valid course with all required fields.
- Expected Result: Insert succeeds.

### 🚨 `insert-course-missing-fields.ts`
Attempts to insert a course without `instructor_id`.
- Expected Result: Insert fails due to `NOT NULL` constraint.

### 🔄 `course.update.test.ts`
Finds a course with the test description and updates its title.
- Expected Result: Update succeeds.

### 🗑️ `course.delete.test.ts`
Finds a test course and deletes it.
- Expected Result: Delete succeeds.

### 📋 `course.fetch.all.test.ts`
Fetches and logs all current courses.
- Expected Result: At least one course returned.

### 🧹 `cleanup.test.ts`
Deletes all test courses with the known test description.
- Expected Result: Deletes all matching entries.

## 🚀 Run All Tests
Use the included shell script to run all course-related tests:
```bash
./run-course-tests.sh