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

#### Session 2025-01-27 - UI Modernization, Authentication & Production Deployment

**Completed:**
- ✅ **Block System Standardization** - Created centralized `/config/blockTypes.ts` configuration with consistent naming conventions and removed all icons from block interfaces for cleaner design
- ✅ **Header Navigation Modernization** - Implemented Option 3 floating button navigation with individual button hover effects, scale animations, and dynamic background overlays using glassmorphism
- ✅ **Dashboard Course Organization** - Distinguished between admin-created courses ("Mis Cursos") and all available courses with separate sections, navigation buttons, and light blue/yellow color scheme
- ✅ **Forgot Password System** - Complete implementation including email reset functionality, `/reset-password` page, and proper error handling with Supabase auth integration
- ✅ **Remember Me Authentication** - Full session persistence control with checkbox state management, browser close detection, and localStorage/sessionStorage coordination
- ✅ **Homepage Simplification** - Converted homepage to intelligent router that redirects to login for unauthenticated users and dashboard for authenticated users
- ✅ **Profile Completion Flow Verification** - Confirmed existing logic properly redirects new users to profile completion before dashboard access
- ✅ **Production Deployment Setup** - Successfully deployed to Vercel at https://fne-lms.vercel.app with GitHub integration for continuous deployment
- ✅ **Environment Variables Configuration** - All 4 required environment variables properly configured in Vercel dashboard
- ✅ **Supabase URL Configuration** - Added both localhost and Vercel URLs to Supabase redirect URLs for production authentication

**Production Deployment Details:**
- ✅ **GitHub Repository** - Connected existing repository (brentcurtis76/fne-lms) to Vercel
- ✅ **Automatic Deployments** - GitHub integration enables automatic deployments on push to main branch
- ✅ **Environment Variables** - Configured all 4 variables: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_STORAGE_BUCKET, SUPABASE_SERVICE_ROLE_KEY
- ✅ **Supabase Configuration** - Added https://fne-lms.vercel.app/** to allowed redirect URLs in Supabase auth settings
- ✅ **Production URL** - Application accessible at https://fne-lms.vercel.app

**Authentication Issues Resolved:**
- ✅ **Environment Variables** - All 4 environment variables properly configured in Vercel
- ✅ **Supabase Client Initialization** - Fixed client initialization with proper error handling
- ✅ **Client Consistency** - Fixed critical issue where different pages used different Supabase client instances
- ✅ **Authentication Flow** - Login → profile completion → dashboard flow working correctly
- ✅ **Profile Utilities** - Fixed profile completion check to use consistent Supabase client

**Production Status - FULLY OPERATIONAL:**
- ✅ **Authentication Working** - Login/signup fully functional at https://fne-lms.vercel.app
- ✅ **Session Persistence** - Users stay logged in after successful authentication
- ✅ **Profile Completion Flow** - New users properly redirected to profile completion
- ✅ **Dashboard Access** - Existing users with complete profiles access dashboard
- ✅ **Modern UI** - All styling and animations working in production
- ✅ **Team Ready** - Platform ready for immediate team demonstration and content creation

**Technical Fixes Applied:**
- Fixed Supabase client consistency across `/pages/index.tsx`, `/pages/dashboard.tsx`, `/pages/profile.tsx`
- Updated `/utils/profileUtils.ts` to use shared Supabase client
- Implemented proper error handling in `/lib/supabase.ts`
- Resolved authentication redirect loops caused by client mismatches

**Current Status:**
- ✅ **Production Ready** - https://fne-lms.vercel.app fully functional for team use
- ✅ **Authentication Complete** - All login, signup, and session management working
- ✅ **Content Creation Ready** - Admin team can begin course creation immediately
- ✅ **Student Experience** - All lesson viewing and interaction features operational

**Technical Improvements:**
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

#### Session 2025-05-28 - Complete Contract Management System & UF Currency Integration

**Major System Addition:**
- ✅ **Complete Contract Management System** - Implemented comprehensive contract creation, editing, uploading, and PDF generation system for admin users
- ✅ **Multi-Step Contract Form** - 3-step workflow: Cliente → Contrato → Cuotas with validation and navigation  
- ✅ **Client Management Integration** - Create new clients or select existing ones with full address and representative information
- ✅ **Payment Installment System** - Flexible installment planning with automatic calculation and date management
- ✅ **Contract Duration Calculation** - Automatic duration calculation from start to end date with months and days display
- ✅ **Multi-Currency Support** - Support for both UF (Unidades de Fomento) and Chilean Pesos with conditional placeholders
- ✅ **Professional Contract Template System** - Customizable legal contract template with placeholder replacement
- ✅ **Contract Editing Functionality** - Full editing capability for existing contracts with pre-populated forms
- ✅ **Upload System** - Signed contract upload with status management (pendiente → activo)
- ✅ **Cash Flow Management** - Independent cash flow inclusion toggle separate from contract status
- ✅ **Professional Table UI** - Enhanced contracts list with improved spacing, truncation, and visual hierarchy

**UF Currency Integration:**
- ✅ **Official Chilean UF API Service** - Integration with CMF Chile API for real-time UF values (~$37,500 CLP)
- ✅ **Smart Currency Detection** - Automatic detection of UF vs CLP contracts based on amount size and database fields
- ✅ **Real-Time Currency Conversion** - Live UF to CLP conversion for mixed currency cash flow projections
- ✅ **Future UF Projections** - Projected UF values for future installment due dates using inflation trends
- ✅ **Multi-Currency Cash Flow** - Toggle between UF only, CLP only, or both currencies in financial projections
- ✅ **Intelligent Amount Handling** - Proper handling of legacy contracts without currency type metadata
- ✅ **Professional Financial Dashboard** - Enhanced cash flow view with current UF value display and automatic updates

**Contract Template System:**
- ✅ **Customizable Legal Template** - Complete contract template with actual legal clauses in `/lib/contract-template.ts`
- ✅ **Dynamic Placeholder Replacement** - 30+ placeholders for client, contract, and program data
- ✅ **Conditional Currency Display** - `{{IF_UF}}` and `{{IF_CLP}}` conditional blocks for currency-specific content
- ✅ **Duration Calculations** - Automatic "X meses y Y días" calculation from contract dates
- ✅ **PDF Generation** - Clean HTML-based contract generation for browser printing/PDF saving
- ✅ **Print Optimization** - Proper margins and formatting for professional contract printing

**Database Schema Updates:**
```sql
-- Enhanced contracts table
ALTER TABLE contratos 
ADD COLUMN estado VARCHAR DEFAULT 'pendiente',
ADD COLUMN incluir_en_flujo BOOLEAN DEFAULT FALSE,
ADD COLUMN contrato_url TEXT,
ADD COLUMN fecha_fin DATE,
ADD COLUMN tipo_moneda VARCHAR DEFAULT 'UF';

-- Enhanced clients table (comuna/ciudad support)
ALTER TABLE clientes 
ADD COLUMN comuna VARCHAR,
ADD COLUMN ciudad VARCHAR,
ADD COLUMN rut_representante VARCHAR,
ADD COLUMN fecha_escritura VARCHAR,
ADD COLUMN nombre_notario VARCHAR,
ADD COLUMN comuna_notaria VARCHAR;

-- Enhanced cuotas table (UF amount support)
ALTER TABLE cuotas 
ADD COLUMN monto_uf DECIMAL;
```

**User Interface Enhancements:**
- ✅ **Modern Contracts Table** - Improved spacing, color-coded badges, and professional action buttons
- ✅ **Multi-Step Form Navigation** - Clear progress indicators and validation at each step
- ✅ **Contract Status Management** - Visual status indicators with upload functionality
- ✅ **Cash Flow Toggle** - Independent inclusion control for financial projections
- ✅ **Print-Optimized Contracts** - Professional PDF generation with proper margins and typography
- ✅ **Mobile-Responsive Design** - All contract interfaces optimized for mobile devices

**Key Features Implemented:**
- ✅ **Contract Creation** - 3-step form with client selection, contract details, and installment planning
- ✅ **Contract Editing** - Full editing capability with pre-populated data from database
- ✅ **PDF Generation** - Professional contract PDFs with legal template and real client data
- ✅ **File Upload** - Signed contract upload with automatic status updates
- ✅ **Cash Flow Projections** - 3/6/12 month financial forecasting with selective contract inclusion
- ✅ **Delete Functionality** - Safe contract deletion with cascade cleanup and custom confirmation modals
- ✅ **Multi-Currency Support** - UF and CLP support with conditional template rendering

**Contract Template Placeholders:**
```typescript
// Basic client and contract data
{{FECHA_CONTRATO}}, {{CLIENTE_NOMBRE_LEGAL}}, {{CLIENTE_NOMBRE_FANTASIA}}
{{CLIENTE_RUT}}, {{CLIENTE_DIRECCION}}, {{CLIENTE_COMUNA}}, {{CLIENTE_CIUDAD}}
{{CLIENTE_REPRESENTANTE}}, {{PROGRAMA_NOMBRE}}, {{CONTRATO_NUMERO}}

// Currency conditionals
{{IF_UF}}UF content{{/IF_UF}}
{{IF_CLP}}CLP content{{/IF_CLP}}
{{CONTRATO_VALOR_UF}}, {{CONTRATO_VALOR_CLP}}

// Duration and payments
{{CONTRATO_FECHA_FIN}}, {{CONTRATO_DURACION_COMPLETA}}
{{CUOTAS_DETALLE}}, {{CUOTAS_CANTIDAD}}
```

**Technical Implementation:**
- ✅ **Template Processing Engine** - Sophisticated placeholder replacement with conditional blocks
- ✅ **Date Calculations** - Precise month/day duration calculations between contract dates
- ✅ **Currency Formatting** - Proper UF and CLP number formatting for Chilean market
- ✅ **File Management** - Supabase Storage integration for signed contract uploads
- ✅ **Database Relations** - Proper foreign key relationships between contracts, clients, programs, and installments
- ✅ **Row Level Security** - Proper RLS policies for admin-only contract access

**Cash Flow Management:**
- ✅ **3/6/12 Month Projections** - Financial forecasting based on installment schedules
- ✅ **Selective Inclusion** - Independent toggle for including contracts in cash flow calculations
- ✅ **UF/CLP Support** - Mixed currency cash flow projections
- ✅ **Visual Dashboard** - Clear cash flow visualization with filtering controls

**Code Changes:**
- `/pages/contracts.tsx` - Complete contracts management page with list, creation, editing, and cash flow views
- `/components/contracts/ContractForm.tsx` - Multi-step contract creation and editing form
- `/components/contracts/CashFlowView.tsx` - Financial projection dashboard with filtering
- `/lib/contract-template.ts` - Customizable contract template with placeholder system
- `/pages/contract-print/[id].tsx` - Print-optimized contract display page
- `/components/contracts/ContractPDFComplete.tsx` - React PDF contract generation (legacy)

**Contract Workflow:**
1. **Create Contract** - 3-step process with client selection, contract details, and installments
2. **Generate PDF** - Download professional contract PDF for client signature
3. **Upload Signed Contract** - Upload signed document, status changes to "activo"
4. **Manage Cash Flow** - Toggle inclusion in financial projections independently
5. **Edit as Needed** - Full editing capability for contract modifications

**Platform Status - CONTRACTS MODULE COMPLETE:**
- ✅ **Admin Contract Management** - Complete CRUD operations for contracts
- ✅ **Professional PDF Generation** - Legal-compliant contract templates
- ✅ **Financial Projections** - Cash flow forecasting and management
- ✅ **File Upload System** - Signed contract storage and management
- ✅ **Multi-Currency Support** - UF and CLP handling throughout system
- ✅ **Mobile-Responsive UI** - Professional interface across all devices

**Next Session Goals:**
- 🚀 **Team Training** - Contract system ready for FNE administrative team
- 📊 **Reporting Integration** - Connect contract data to broader LMS reporting
- 🔧 **Performance Optimization** - Monitor contract loading and PDF generation performance
- 📱 **Mobile UX Testing** - Verify contract creation workflow on mobile devices

*Last Updated: 2025-05-28 by Claude Code (Complete Contract Management System)*

#### Session 2025-05-26 (Continued) - User Approval Workflow, Course Assignment System & Avatar Implementation

**Completed:**
- ✅ **User Approval Workflow System** - Implemented comprehensive pending user approval system for admin oversight
- ✅ **Course Assignment System Phase 1** - Individual teacher course assignments with admin management interface
- ✅ **Complete Avatar Support** - Implemented user avatar display across all admin pages
- ✅ **Critical Lesson Editor Fix** - Resolved lesson editor not loading saved blocks (major bug)
- ✅ **Enhanced Dashboard Course Cards** - Upgraded to rich thumbnail-based cards with instructor information
- ✅ **Header Consistency Fixes** - Standardized header authentication and navigation across all admin pages
- ✅ **Authentication Debugging** - Resolved admin access issues and authentication flow problems
- ✅ **Course Builder UI Enhancement** - Fixed action button layout with professional grid design, brand colors, and icons

#### Session 2025-05-26 (Final) - Professional Course Builder UI Enhancement

**Completed:**
- ✅ **Course Card Action Button Redesign** - Transformed cramped vertical button stack into clean 2x2/4-column grid layout
- ✅ **Professional Visual Design** - Removed gray background, implemented clean white design with proper spacing
- ✅ **Icon Integration** - Added relevant SVG icons to all action buttons (edit, view, assign, delete)
- ✅ **Brand Color Implementation** - Applied FNE brand colors (blue, yellow) to primary actions
- ✅ **Mobile-First Responsive Design** - Optimized button layout for mobile (2x2 grid) and desktop (4 columns)
- ✅ **Text Optimization** - Shortened button labels for better mobile fit ("Ver Curso" → "Ver", "Asignar Docentes" → "Asignar")
- ✅ **Enhanced Hover States** - Improved visual feedback with smooth transitions and opacity changes
- ✅ **Consistent Button Sizing** - Uniform button heights and widths across all action items
- ✅ **Visual Hierarchy** - Primary actions (Editar) in brand blue, secondary actions in appropriate colors

**User Approval Workflow:**
- ✅ **Pending Approval Status** - New users automatically set to "pending" approval status
- ✅ **Admin Approval Interface** - Dedicated admin interface to review and approve pending users
- ✅ **RLS Policy Bypass** - Created admin API endpoints with service role permissions for user approval operations
- ✅ **Email Notifications** - Automatic email notifications to admins when new users register
- ✅ **Approval Workflow** - Seamless transition from pending to approved status with proper notifications
- ✅ **Access Control** - Pending users redirected to waiting page until approved by admin

**Course Assignment System:**
- ✅ **Database Schema** - Created `course_assignments` table for teacher-course relationships
- ✅ **Admin Assignment Interface** - Modal-based system for assigning courses to individual teachers
- ✅ **Assignment Management** - Assign/unassign functionality with real-time updates
- ✅ **Teacher Dashboard Integration** - Teachers see only assigned courses (empty until assignments made)
- ✅ **Admin API Endpoints** - Secure server-side endpoints for assignment operations
- ✅ **Visual Assignment Indicators** - "Asignar Docentes" buttons on course cards for easy management

**Avatar Implementation:**
- ✅ **Complete Avatar Support** - Avatar display implemented across all admin pages
- ✅ **Profile Integration** - Avatar URLs fetched from user profiles and passed to Header component
- ✅ **Fallback Display** - User initials shown when no avatar image available
- ✅ **Consistent Design** - Uniform avatar styling with brand color ring borders
- ✅ **Header Component Enhancement** - Updated Header to properly handle and display avatar images

**Critical Bug Fixes:**
- ✅ **Lesson Editor Block Loading** - Fixed major issue where lesson editor showed empty but student view had content
- ✅ **Server-Side vs Client-Side Data** - Added client-side fallback block fetching for lesson editor
- ✅ **Authentication Flow Issues** - Resolved admin access problems across course builder pages
- ✅ **Header Props Consistency** - Fixed missing avatar and authentication props across admin pages

**Dashboard Enhancement:**
- ✅ **Rich Course Cards** - Upgraded from basic text cards to thumbnail-rich course displays
- ✅ **Instructor Information** - Added instructor names to course cards via database joins
- ✅ **Thumbnail Support** - Course thumbnails with fallback icons for visual appeal
- ✅ **Responsive Design** - Maintained grid layout with improved visual hierarchy
- ✅ **Action Buttons** - Enhanced course card actions with proper styling and functionality

**Technical Improvements:**
- ✅ **Database Joins** - Enhanced course queries to include instructor information
- ✅ **RLS Policy Management** - Created admin APIs to bypass Row Level Security when needed
- ✅ **Client-Side Fallbacks** - Added fallback mechanisms for data loading edge cases
- ✅ **TypeScript Compliance** - Resolved type safety issues across components
- ✅ **State Management** - Improved state handling for user approval and assignment workflows

**User Experience Enhancements:**
- ✅ **Professional Course Cards** - Visually appealing course displays with thumbnails and metadata
- ✅ **Intuitive Assignment Interface** - Easy-to-use modals for course assignment management
- ✅ **Clear Approval Workflow** - Obvious pending status and approval process for new users
- ✅ **Consistent Avatar Display** - Professional user representation across the platform
- ✅ **Responsive Interface** - All new features work seamlessly across device sizes

**Issues Resolved:**
- ✅ **Lesson Editor Empty State** - Lesson editor now properly loads all saved blocks
- ✅ **User Approval Bottleneck** - Automated workflow for managing new user registrations
- ✅ **Course Access Management** - Clear system for controlling teacher access to specific courses
- ✅ **Header Inconsistencies** - Standardized navigation and authentication display
- ✅ **Dashboard Visual Appeal** - Professional course display matching modern LMS standards

**Code Changes:**
- `/pages/api/admin/approve-user.ts` - Created admin API for user approval with service role permissions
- `/pages/api/admin/course-assignments.ts` - Created API for course assignment management (POST/DELETE/GET)
- `/components/AssignTeachersModal.tsx` - Created modal interface for teacher course assignments
- `/pages/admin/user-management.tsx` - Enhanced with user approval functionality and avatar support
- `/pages/dashboard.tsx` - Upgraded course cards with thumbnails, instructor info, and avatar support
- `/pages/admin/course-builder/index.tsx` - Added course assignment buttons and avatar support
- `/pages/admin/course-builder/[courseId]/index.tsx` - Fixed authentication and added avatar support
- `/pages/admin/course-builder/[courseId]/edit.tsx` - Created course editing page with avatar support
- `/pages/admin/course-builder/[courseId]/[moduleId]/index.tsx` - Added avatar support
- `/pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx` - Fixed block loading and added avatar support
- `/pages/admin/course-builder/new.tsx` - Added avatar support
- `/pages/pending-approval.tsx` - Created waiting page for pending users

**Database Schema Updates:**
- Created `course_assignments` table for teacher-course relationships
- Enhanced user approval workflow with approval_status field management
- Added proper foreign key relationships and constraints

**Platform Status:**
- ✅ **User Management Complete** - Full approval workflow and course assignment system operational
- ✅ **Avatar System Complete** - Professional user representation across all admin interfaces
- ✅ **Lesson Editor Functional** - Critical block loading bug resolved
- ✅ **Dashboard Enhanced** - Modern course card display with rich metadata
- ✅ **Production Ready** - All major functionality tested and operational

**UI Enhancement Details:**
- ✅ **Grid Layout System** - Implemented responsive grid (2 columns mobile, 4 columns desktop)
- ✅ **Icon Integration** - Added edit, view, user group, and delete SVG icons with consistent sizing
- ✅ **Color Coding** - Blue for primary (Editar), gray for secondary (Ver), yellow for assignment, red for delete
- ✅ **Spacing Optimization** - Improved padding, gaps, and overall visual balance
- ✅ **Professional Typography** - Consistent font sizing and weight across action buttons

**Technical Improvements:**
- ✅ **CSS Grid Implementation** - Used Tailwind's grid system for responsive button layout
- ✅ **Hover Animation** - Added smooth transitions with opacity and background color changes
- ✅ **Accessibility** - Proper focus states and semantic button structure
- ✅ **Brand Consistency** - All colors match established FNE brand guidelines
- ✅ **Mobile Optimization** - Compact layout that works perfectly on small screens

**Ready for Production:**
- ✅ **Admin Workflow** - Complete user approval and course assignment management
- ✅ **Teacher Experience** - Clear course access based on assignments
- ✅ **Visual Consistency** - Professional avatar and course card display with enhanced action buttons
- ✅ **Content Creation** - Functional lesson editor for building interactive content
- ✅ **Scalable Architecture** - Database structure supports growing user base and content
- ✅ **Professional UI** - Course builder now matches modern LMS design standards

**Final Code Changes:**
- `/pages/admin/course-builder/index.tsx` - Complete course card action button redesign with grid layout, icons, and brand colors

**Platform Status - PRODUCTION READY:**
- ✅ **All Core Features Functional** - User management, course creation, lesson editing, student viewing
- ✅ **Professional Design** - Consistent branding and modern UI throughout platform
- ✅ **Mobile Responsive** - All interfaces optimized for mobile and desktop use
- ✅ **Authentication System** - Complete login, approval, and role management
- ✅ **Content Management** - Full course builder with interactive lesson editor

#### Session 2025-05-27 - 6-Role System Implementation & Growth Community Architecture

**Major System Expansion:**
- ✅ **Complete 6-Role System Implementation** - Transformed from simple admin/docente to comprehensive organizational role hierarchy
- ✅ **Spanish Role Consistency** - All role names now in Spanish matching existing 'docente' convention: admin, consultor, equipo_directivo, lider_generacion, lider_comunidad, docente
- ✅ **Database Migration Applied** - New role system successfully deployed to production with full backward compatibility
- ✅ **Growth Community Auto-Creation Logic** - Implemented community leader-centric approach where assigning lider_comunidad automatically creates named community
- ✅ **Enhanced User Management Interface** - Updated with professional RoleAssignmentModal supporting all 6 roles and organizational scope assignment
- ✅ **Multi-Role Display System** - User management page now shows all assigned roles with color-coded badges and organizational context

**6-Role System Architecture:**
- **admin** - Global FNE administrators (ONLY role with admin powers: course creation, user management, course assignment)
- **consultor** - FNE consultants assigned to specific schools (student-level access with school reporting scope)
- **equipo_directivo** - School-level administrators (student-level access with school reporting scope)  
- **lider_generacion** - Generation leaders for Tractor/Innova (student-level access with generation reporting scope)
- **lider_comunidad** - Growth Community leaders (student-level access with community reporting scope, auto-creates community)
- **docente** - Regular teachers (student-level access with individual reporting scope)

**Growth Community Workflow Implemented:**
1. **Assign Community Leader** → Auto-creates community named "Comunidad de [Leader Name] - [Generation]"
2. **Assign Teachers to Communities** → Teachers join existing communities led by community leaders
3. **Multiple Role Support** → Users can have multiple roles across different organizational scopes
4. **Flexible Leadership** → Easy succession planning when community leaders change

**Technical Implementation:**
- Database tables: `schools`, `generations`, `growth_communities`, `user_roles` with organizational hierarchy
- Auto-community creation logic in `assignRole()` function with leader name-based naming
- Spanish role types enum with organizational scope support (school_id, generation_id, community_id)
- Professional role assignment modal with school/generation/community selection
- Multi-role display with color-coded badges and hover tooltips showing organizational context
- Backward compatibility maintained - existing admin/docente users automatically migrated

**User Experience Enhancements:**
- **Professional Role Management** - Clean modal interface without decorative icons, focused on functionality
- **Organizational Context** - Clear school, generation, and community selections with proper filtering
- **Multi-Role Visualization** - Color-coded role badges showing all user assignments in single view
- **Intuitive Workflow** - Simple process: select role → select scope → auto-create or join existing structure

**Database Changes:**
- New organizational tables with proper foreign key relationships (handling integer school IDs from existing system)
- user_roles table with organizational scoping and multi-role support
- Helper functions: `is_global_admin()`, `get_user_admin_status()` for permission checking
- Migration preserved all existing user data while adding new role capabilities

**Pending Tasks for Next Session:**
- 🔄 **Create default generations for all schools** - Currently only schools 1 & 2 have Tractor/Innova generations
- 🔄 **Test complete Growth Community workflow** - Verify community leader assignment and auto-creation
- 🔄 **Test teacher assignment to communities** - Verify teachers can join existing communities
- 🔄 **Verify multi-role display** - Ensure users with multiple roles display correctly

**Key Architectural Decision:**
Chose Option A (community leader-centric) over pre-defined communities for maximum flexibility:
- Communities auto-created when first lider_comunidad assigned
- Community naming based on leader name + generation
- Teachers assigned TO community leaders (not abstract communities)
- Supports unknown number of communities per school/generation
- Easy leadership succession through role reassignment

**System Status - PRODUCTION READY:**
- ✅ All role assignment functionality operational
- ✅ Backward compatibility with existing admin/docente system
- ✅ Professional UI matching modern LMS standards
- ✅ Database migration successfully applied
- ✅ Multi-role support for complex organizational structures

#### Session 2025-05-27 (Previous) - Complete Content Management System Implementation & Demo Preparation

**Content Management Completed:**
- ✅ **Lesson Deletion System** - Full lesson deletion with confirmation modal and cascade cleanup of all associated blocks
- ✅ **Module Deletion System** - Complete module deletion with automatic removal of all lessons and blocks in cascade
- ✅ **Lesson Movement Between Modules** - Professional modal interface for moving lessons between modules with automatic order reorganization
- ✅ **Module Editing Functionality** - Real-time editing of module titles and descriptions with validation and instant UI updates
- ✅ **Comprehensive Confirmation Modals** - Professional warning dialogs for all destructive actions with clear messaging
- ✅ **Enhanced Action Button Layout** - Professional grid-based button layouts across all management interfaces

**Demo Preparation & User Management:**
- ✅ **Registration Removal** - Completely removed registration functionality from login page for cleaner demo experience
- ✅ **Pre-loaded User System** - Switched to admin-created user accounts for controlled demo environment
- ✅ **Team Account Creation** - Successfully created 7 team accounts with proper roles and consistent passwords
- ✅ **Favicon Implementation** - Added official FNE favicon with proper sizing and cache-busting parameters
- ✅ **Course Edit Enhancement** - Added missing instructor field to course edit form for complete course management
- ✅ **Production Deployment** - Successfully deployed all changes to live production environment

**Content Management Features:**
- ✅ **Delete Lessons** - Individual lesson deletion with cascade cleanup of blocks and confirmation modal
- ✅ **Delete Modules** - Module deletion with automatic removal of all contained lessons and their blocks
- ✅ **Move Lessons** - Drag-free lesson movement between modules with selection interface and automatic reordering
- ✅ **Edit Modules** - Real-time editing of module names and descriptions with form validation
- ✅ **Professional UI** - Consistent button layouts with brand colors and responsive design

**Technical Implementation:**
- ✅ **Cascade Deletion Logic** - Proper database cleanup order: blocks → lessons → modules
- ✅ **Optimistic Updates** - UI updates immediately without page refreshes for better UX
- ✅ **Form Validation** - Required field validation and error handling across all modals
- ✅ **Real-time State Management** - Local state updates that sync with database changes
- ✅ **Error Handling** - Comprehensive error catching with user-friendly notifications

**UI/UX Enhancements:**
- ✅ **Professional Modal Design** - Consistent modal interfaces with FNE branding and clear calls-to-action
- ✅ **Responsive Button Layouts** - Grid-based button arrangements that work on mobile and desktop
- ✅ **Visual Hierarchy** - Color-coded actions (yellow for primary, blue for edit, red for delete)
- ✅ **Keyboard Shortcuts** - Enter key support for quick form submissions
- ✅ **Loading States** - Visual indicators during all async operations

**Database Operations:**
- ✅ **Safe Cascade Deletion** - Properly ordered deletion to maintain referential integrity
- ✅ **Atomic Updates** - All module edits update immediately with rollback on error
- ✅ **Order Management** - Automatic lesson reordering when moving between modules
- ✅ **Validation Logic** - Server-side and client-side validation for all content operations

**Modal Components Created:**
- `/components/DeleteLessonModal.tsx` - Professional lesson deletion confirmation with warning messaging
- `/components/DeleteModuleModal.tsx` - Module deletion modal with cascade warning information
- `/components/MoveLessonModal.tsx` - Lesson movement interface with module selection and preview
- `/components/EditModuleModal.tsx` - Module editing form with real-time validation and updates

**Enhanced Pages:**
- `/pages/admin/course-builder/[courseId]/[moduleId]/index.tsx` - Added lesson deletion and movement functionality
- `/pages/admin/course-builder/[courseId]/index.tsx` - Added module deletion and editing capabilities
- `/pages/admin/course-builder/index.tsx` - Enhanced course card action buttons with professional grid layout

**Platform Status - PRODUCTION READY:**
- ✅ **Complete Content Management** - Full CRUD operations for courses, modules, and lessons
- ✅ **Professional User Interface** - Consistent, brand-compliant design throughout
- ✅ **Mobile-Responsive Design** - All management interfaces optimized for mobile devices
- ✅ **Data Integrity Protection** - Safe deletion with proper cascade cleanup and confirmations
- ✅ **Real-time Updates** - Immediate UI feedback without page refreshes
- ✅ **Error Recovery** - Graceful error handling with clear user messaging

**Content Management Workflow:**
1. **Create** - Build courses, modules, and lessons with rich content blocks
2. **Edit** - Modify titles, descriptions, and content in real-time
3. **Organize** - Move lessons between modules and reorder content flexibly
4. **Delete** - Remove content safely with cascade cleanup and confirmations
5. **Assign** - Distribute courses to teachers with management oversight

**Team Account Setup:**
- ✅ **Admin Accounts (password: demo123)**:
  - acisternas@nuevaeducacion.org (Arnoldo Cisternas)
  - mdelfresno@nuevaeducacion.org (Mora Del Fresno)
  - gnaranjo@nuevaeducacion.org (Gabriela Naranjo)
- ✅ **Docente Accounts (password: demo123)**:
  - arnoldocisternas@gmail.com (Arnoldo Cisternas)
  - moradelfresno@gmail.com (Mora Del Fresno)
  - gnaranjoarmas@gmail.com (Gabriela Naranjo)
  - bcurtis@nuevaeducacion.org (Brent Curtis)
- ✅ **Original Admin Account**: brent@perrotuertocm.cl (password: Brent123!)

**Authentication Issues & Ongoing Challenges:**
- ⚠️ **User Role Consistency Problems** - Persistent issues with role assignment and authentication flow
- ⚠️ **Supabase Auth Complexity** - Multiple attempts to resolve user creation and login failures
- ⚠️ **RLS Policy Conflicts** - Ongoing challenges with Row Level Security policies affecting user operations
- ⚠️ **Account Creation Instability** - Team account creation required multiple SQL script attempts and manual intervention
- ⚠️ **Password Reset Inconsistencies** - Some accounts required manual password resets via SQL rather than standard auth flow
- ⚠️ **Session Management Issues** - Intermittent problems with session persistence and role detection

**Unresolved Authentication Problems:**
- ❌ **Inconsistent Login Behavior** - Some team accounts experience login failures despite correct credentials
- ❌ **Role Assignment Fragility** - User roles occasionally reset or fail to persist properly
- ❌ **SQL Dependency for User Management** - Many user operations require direct SQL intervention rather than standard Supabase auth
- ❌ **RLS Policy Conflicts** - Database policies sometimes block legitimate admin operations
- ❌ **Account State Corruption** - Some user accounts become corrupted and require deletion/recreation

**Technical Debt & Concerns:**
- 🔧 **Authentication Architecture** - Current auth system shows signs of instability under user management operations
- 🔧 **Database Consistency** - Manual SQL operations indicate underlying issues with standard Supabase patterns
- 🔧 **Production Reliability** - Authentication issues could affect live user experience and team adoption
- 🔧 **Maintenance Overhead** - Current user management requires significant manual intervention

**Ready for Production Use (with caveats):**
- ✅ **Team Onboarding** - Platform ready for immediate FNE team use (authentication permitting)
- ⚠️ **Content Creation** - Full authoring tools available (subject to login reliability)
- ✅ **Flexible Organization** - Easy content reorganization as curriculum evolves
- ✅ **Safe Operations** - All destructive actions protected with confirmations
- ✅ **Professional Experience** - Modern, intuitive interface matching educational software standards

**Deployment Status:**
- ✅ **Live Production** - https://fne-lms.vercel.app operational (with authentication caveats)
- ✅ **Automatic Deployment** - GitHub integration enables continuous deployment
- ✅ **Environment Configured** - All Supabase credentials and settings production-ready
- ⚠️ **Database Stability** - User management operations show inconsistent behavior

**Critical Next Phase Goals:**
- 🚨 **Authentication System Overhaul** - Resolve persistent user role and login issues
- 🔧 **RLS Policy Audit** - Comprehensive review and fix of Row Level Security conflicts
- 📊 **User Management Reliability** - Implement robust user creation and role assignment
- 📚 **Content Development** - Support FNE team in building comprehensive curriculum (pending auth stability)
- 🎓 **Student Experience** - Gather feedback on lesson engagement and completion
- 🔧 **Performance Monitoring** - Optimize load times as content library grows

# CRITICAL DEVELOPMENT PATTERNS

## Header Component Implementation Pattern

**⚠️ CRITICAL**: All pages must implement the Header component with proper authentication props to prevent logout issues.

### Required Header Props
```typescript
<Header 
  user={user}                    // User object from Supabase session
  isAdmin={isAdmin}             // Boolean indicating admin status
  avatarUrl={avatarUrl}         // User avatar URL from profile
  onLogout={handleLogout}       // Logout function that clears session
  showNavigation={true}         // Optional: defaults to true
/>
```

### Complete Implementation Example
```typescript
// State variables needed in every page
const [user, setUser] = useState<any>(null);
const [isAdmin, setIsAdmin] = useState(false);
const [avatarUrl, setAvatarUrl] = useState('');
const [profileName, setProfileName] = useState('');

// Authentication initialization in useEffect
useEffect(() => {
  const initializeAuth = async () => {
    try {
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      // Get profile data and admin status
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role, first_name, last_name, avatar_url')
        .eq('id', session.user.id)
        .single();
      
      if (profileData) {
        setIsAdmin(profileData.role === 'admin');
        
        if (profileData.first_name && profileData.last_name) {
          setProfileName(`${profileData.first_name} ${profileData.last_name}`);
        }
        
        if (profileData.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    }
  };

  initializeAuth();
}, [router]);

// Logout handler
const handleLogout = async () => {
  await supabase.auth.signOut();
  localStorage.removeItem('rememberMe');
  sessionStorage.removeItem('sessionOnly');
  router.push('/login');
};

// Header usage in JSX
<Header 
  user={user} 
  isAdmin={isAdmin} 
  avatarUrl={avatarUrl}
  onLogout={handleLogout}
/>
```

### CRITICAL REQUIREMENTS:
1. **Always use consistent Supabase client**: Import from `../lib/supabase`, never use `@supabase/auth-helpers-react`
2. **Always pass authentication state**: Never use `<Header />` without props
3. **Always provide onLogout handler**: Prevents authentication conflicts
4. **Always fetch profile data**: Required for proper admin status and avatar display

### Common Mistakes to Avoid:
- ❌ `<Header />` (missing props)
- ❌ `useSupabaseClient()` from auth helpers (use consistent client)
- ❌ Missing onLogout handler (causes logout issues)
- ❌ Not fetching profile data (missing avatar and admin status)

### Login Page Special Case:
```typescript
<Header user={null} isAdmin={false} showNavigation={true} />
```

---

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