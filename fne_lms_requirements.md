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
- ❌ Quiz blocks (needs complete rebuild)

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

#### Session [DATE] - [DURATION]
**Completed:**
- [List completed tasks]

**In Progress:**
- [List ongoing work]

**Issues Encountered:**
- [Any blockers or problems]

**Next Session Goals:**
- [Priority tasks for next time]

**Code Changes:**
- [File paths and brief descriptions of changes]

**Notes:**
- [Any important observations or decisions]

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

## REFERENCE DOCUMENTATION
Save these files in your project root for Claude Code access:

1. **`fne-lms-glossary.md`** - Complete glossary of terms, roles, and requirements
2. **`fne-technical-requirements.md`** - Detailed technical specifications and implementation phases

These files contain all the organizational structure, user roles, technical requirements, and integration details needed for development.

---

## CONTACT INFORMATION
**Technical Support**: Brent Curtis  
**Phone**: +56941623577  
**Email**: bcurtis@nuevaeducacion.org

---

*Last Updated: [DATE] by Claude Code*