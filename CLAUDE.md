# FNE LMS Development Context

## 📚 **FNE LMS PROJECT** 

### **IMMEDIATE CONTEXT**
- **Project**: Custom Next.js 14 + Supabase LMS platform
- **Location**: ~/Documents/fne-lms-working  
- **Technology**: Next.js 14.2.28, Supabase, React 18, Tailwind CSS, Recharts
- **Port**: MUST run on port 3000 for Supabase integration
- **Language**: All UI text in Spanish
- **Production URL**: https://fne-lms.vercel.app

### **ENVIRONMENT CONFIGURATION**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://sxlogxqzmarhqsblxmtj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI
```

### **QUICK START**
```bash
cd ~/Documents/fne-lms-working
npm install
npm run dev  # MUST be port 3000
```

### **PROJECT STATUS - STABLE & PRODUCTION-READY**
- **Core Features**: ✅ Complete and operational
- **User Management**: ✅ 7-role system functional
- **Course System**: ✅ Full CRUD with assignments
- **Collaborative Tools**: ✅ Workspace, messaging, groups
- **Reporting**: ✅ Analytics and export functionality 
- **Network Management**: ✅ Supervisor de Red role with network-based access control
- **Flexible Course Structure**: ✅ Simple and structured course types supported

### **RECENT CRITICAL FIXES (2025)**

#### **FLEXIBLE COURSE STRUCTURE - COMPLETE**
- Database supports both simple and structured course types
- Admin UI for safe conversion between structure types
- E2E tests with proper test isolation (no production data affected)
- Files: `/components/ConvertStructureModal.tsx`, `/e2e/course-structure*.spec.ts`

#### **CRITICAL SECURITY FIX: HARDCODED ADMIN PRIVILEGES**
- Fixed vulnerability where ALL users received admin navigation
- Implemented dynamic role detection with fallback strategies
- Files: `/utils/authHelpers.ts`, `/pages/api/auth/session.ts`

#### **COMMUNITY LEADER ROLE ASSIGNMENT FIX**
- Fixed database constraint validation for schools with generations
- Added proper frontend validation with Spanish error messages
- Files: `/pages/api/admin/assign-role.ts`, `/components/RoleAssignmentModal.tsx`

#### **UNIFIED LEARNING HUB**
- Consolidated "Mis Rutas" and "Mis Cursos" into single "Mi Aprendizaje" interface
- Automatic redirects from old URLs maintain backwards compatibility
- Files: `/pages/mi-aprendizaje.tsx`, `/components/layout/Sidebar.tsx`

### **MAINTENANCE TASKS**
- ⏳ Quiz review system testing pending
- ⏳ Group assignments role corrections need SQL application
- ⏳ Final testing of open-ended quiz workflow

---

## 🔧 **DEVELOPMENT STANDARDS**

### **Code Quality Requirements**
- **TypeScript**: Strict mode required
- **Testing**: 80%+ coverage minimum
- **Security**: Authentication, authorization, input validation
- **Performance**: <2s response time targets
- **Language**: All UI text must be in Spanish

### **Architecture Principles**
- **Separation of Concerns**: Service layer pattern
- **API-First Design**: RESTful with proper error handling
- **Maintainability**: Clear naming, comprehensive error handling
- **Test Isolation**: Never affect production data in tests

---

## 📊 **REPORTING GUIDELINES**

### **Progress Report Structure**

#### **1. Status**
- **Phase:** Current phase (e.g., "Bug Fix", "Feature Implementation")
- **Task:** Specific task being worked on
- **Progress:** One-line summary of current state

#### **2. Summary of Work**
- Brief description of actions taken
- Explain *what* was done and *why*

#### **3. Key Artifacts for Review**
- File paths to specific code changes
- Database migration files if applicable

#### **4. Alignment Check**
- How work aligns with project goals

#### **5. Next Step**
- Proposed next action

---

## 📞 **DEVELOPMENT CONTACT**
**Technical Support**: Brent Curtis  
**Phone**: +56941623577  
**Email**: bcurtis@nuevaeducacion.org