# FNE LMS Technical Requirements Document

## 1. Project Overview

### Scope
Fundación Nueva Educación (FNE) seeks to develop a custom online training platform built from scratch leveraging:
- **Claude Code** as AI development assistant
- **Next.js 14** as the frontend framework
- **Supabase** for database management and authentication
- **GitHub** for repository management

### Main Objectives
1. Offer online courses and training programs to teachers (Project-Based Learning, Formative Assessment, Tutoring, etc.)
2. Facilitate collaboration spaces at different organizational levels (Growth Communities, Generations, Leadership Team, School)
3. Enable role assignment and group management with differentiated permissions
4. Provide metrics and progress reports at individual, Growth Community, Generation, and School levels
5. Support individual and group assignment submissions and user interaction
6. Ensure UX/UI and graphic design adherence to foundation's brand manual

## 2. Platform Structure

### Organization / "Spaces" Structure
- Each school has its own "Space" (Organization, School Space, or Team Space)
- Roles and groups are replicated within each Space
- Hierarchical permission system built with custom React components

### Base Technologies
- **Frontend**: Next.js 14 with React 18
- **Backend**: Supabase (PostgreSQL database, Auth, Storage)
- **Styling**: Tailwind CSS with FNE brand system
- **State Management**: React Context API / Zustand
- **File Upload**: Supabase Storage
- **Real-time**: Supabase Realtime subscriptions

## 3. Functional Requirements

### A. Course Creation and Management
- **Content Types**: Rich text, videos, quizzes, file attachments via custom React components
- **Content Editor**: Custom lesson editor (current focus) with rich formatting
- **Personalized Learning Paths**: 
  - FNE team (Global Administrator) assigns different courses/lessons to each user
  - Users may have multiple simultaneous course assignments
- **Progress Tracking**: 
  - Monitor advancement in each course with custom analytics
  - Completion records and certificate generation via PDF export

### B. Role and Permission Management

#### Authentication & Authorization
- **Supabase Auth**: Email/password authentication with row-level security (RLS)
- **Custom Roles**: Implemented through Supabase database roles and React context
- **Permission Guards**: React components that conditionally render based on user roles

#### Space-Specific Roles (by school)
1. **Leadership Team**: Global permission for entire school
2. **Generation Leader**: Permission within their generation  
3. **Growth Community Leader**: Permission within their community
4. **User-Student (Teacher)**: Personal and collaborative participation permissions

#### Role-Based Data Access
- **Supabase RLS Policies**: Database-level security for each role
- **React Permission Hooks**: Custom hooks for component-level permissions
- **API Route Protection**: Next.js middleware for API endpoint security

### C. Collaboration Spaces (Custom React Components)

#### Space Types
1. **Growth Community Space**: 
   - Custom forum components for teachers in that community and their Leader
   - Real-time chat via Supabase Realtime
   - File sharing through Supabase Storage
   - Private discussion threads

2. **Growth Community Leaders Space**: 
   - Exclusive dashboard for coordination among community leaders within same school
   - Leadership communication tools

3. **Leadership Team Space**: 
   - Executive dashboard for school leadership team management and information exchange
   - School-wide analytics and reporting

### D. Metrics and Reports (Custom Analytics Dashboard)

#### Report Types
1. **Individual Report**:
   - Progress tracking with custom React charts (Recharts)
   - Performance metrics for each teacher in assigned courses
   - Assignment submission history and feedback

2. **Growth Community Report**:
   - Aggregated progress dashboard for all teachers in community
   - Visible to Growth Community Leader and higher roles
   - Community engagement metrics

3. **Generation Report**:
   - Generation-wide analytics dashboard
   - Cross-community comparison charts
   - Visible to Generation Leader and higher roles

4. **School Report**:
   - Comprehensive school performance dashboard
   - Multi-generation analytics and trends
   - Visible to Leadership Team and Global Administrator

### E. Assignment Submissions (Custom File Management)

#### Individual Tasks
- **File Upload**: Supabase Storage integration for documents, videos, audio
- **Rich Text Editor**: Custom React editor for text submissions
- **Review System**: Custom workflow for Growth Community Leader feedback

#### Group Assignments
- **Collaborative Editor**: Real-time collaboration features
- **Version Control**: Assignment history and revision tracking
- **Grading System**: Individual or group assessment tools

#### Feedback System
- **Comment System**: Threaded comments on assignments
- **Real-time Notifications**: Supabase Realtime for instant updates
- **Email Notifications**: Automated email system for submission and feedback events

### F. Communication and Messaging (Custom Real-time System)

#### Internal Messaging
- **Real-time Chat**: Supabase Realtime integration for instant messaging
- **Thread Management**: Organized conversation threads within communities
- **File Sharing**: Direct file sharing in conversations

#### Notifications
- **In-app Notifications**: Real-time notification system with React components
- **Email Notifications**: Automated email service for key events
- **Push Notifications**: Browser notifications for important updates

#### Inter-Group Communication
- **Permission-based Messaging**: Role-based communication rules
- **Cross-community Collaboration**: Controlled interaction between different groups

### G. Social Network Features (Phase 2 - Custom Social Components)

#### Social Platform Features
- **User Profiles**: Custom profile pages with role information and activity
- **Activity Feed**: Social media-style updates and interactions
- **Content Sharing**: Share resources and insights across the platform

#### Visibility Controls
- **School-based Networks**: Default interaction within same school
- **Cross-school Features**: Administrator-approved inter-school collaboration
- **Privacy Management**: Granular privacy controls for users

## 4. Non-Functional Requirements

### Scalability
- **Next.js Performance**: Optimized React components with code splitting
- **Supabase Scaling**: Database optimization and connection pooling
- **CDN Integration**: Static asset optimization for global delivery

### Performance
- **React Optimization**: Memoization, lazy loading, and performance hooks
- **Database Optimization**: Efficient queries and indexing strategies
- **Caching Strategy**: Redis-compatible caching for frequently accessed data

### Security
- **Supabase RLS**: Row-level security for all database operations
- **Authentication**: Secure JWT-based authentication with refresh tokens
- **Data Encryption**: End-to-end encryption for sensitive data
- **API Security**: Rate limiting and request validation

### Usability and Responsive Design
- **Mobile-first Design**: Responsive Tailwind CSS implementation
- **Accessibility**: WCAG 2.1 AA compliance with proper ARIA labels
- **User Experience**: Intuitive navigation with FNE brand consistency

### Compatibility
- **Modern Browsers**: Support for all current browsers
- **Progressive Web App**: PWA features for mobile app-like experience
- **Cross-platform**: Consistent experience across devices

## 6. Implementation Phases

### Phase 1: Core Platform & Lesson Editor ✅ CURRENT
- ✅ **Next.js 14 project setup** with Supabase integration
- ✅ **Authentication system** implementation with role management
- ✅ **Complete lesson editor** with all block types (Text, Video, Image, Quiz, File Download, External Link)
- ✅ **User management system** with admin interface
- ✅ **File upload capabilities** with Supabase Storage
- 🔄 **Production deployment** preparation

### Phase 2: Course Structure & Organization
- Course creation and management interface
- Module organization within courses
- Lesson sequencing and prerequisites
- Course enrollment system
- Basic progress tracking

### Phase 3: Multi-Tenant School System
- School ("Spaces") creation and management
- Generation setup (Tractor/Innova) with flexible grade boundaries
- Growth Community creation (2-16 teachers each)
- School-specific branding and customization
- Multi-school data isolation

### Phase 4: Advanced Role Management
- Complete role hierarchy implementation:
  - Global Administrator (FNE)
  - Consultants (assigned schools)
  - Leadership Team (school-level)
  - Generation Leaders (Tractor/Innova)
  - Community Leaders (Growth Communities)
  - Teachers (course participants)
- Multi-role assignment capabilities
- Dynamic permission-based UI components

### Phase 5: Assignment & Assessment System
- Assignment creation and distribution
- Individual and group assignment workflows
- File submission management
- Grading and feedback system
- Assignment analytics and insights

### Phase 6: Collaboration & Communication
- Real-time messaging system (Supabase Realtime)
- Community discussion forums
- Inter-community communication tools
- File sharing within communities
- Activity feeds and notifications

### Phase 7: Analytics & Reporting Dashboard
- Individual progress tracking
- Community performance metrics
- Generation-wide analytics
- School-level reporting
- Global FNE insights
- Custom report generation (Excel/PDF export)

### Phase 8: External Integrations
- **Zoom Integration**: Live class scheduling and recording management
- **Google Drive**: File sharing and collaborative document editing
- **Padlet**: Embedded collaborative boards within lessons
- **Email Services**: Automated notifications and communications
- **Third-party Analytics**: Enhanced tracking and insights

### Phase 9: Mobile Optimization & PWA
- Progressive Web App (PWA) implementation
- Mobile-responsive design refinements
- Offline capability for lesson content
- Push notifications for mobile devices
- App store deployment considerations

### Phase 10: Advanced Features & Polish
- Social networking components
- Gamification elements (badges, achievements)
- Advanced search and filtering
- Bulk operations for administrators
- Performance optimization and scaling
- Comprehensive documentation and training materials

## 7. Current Status Summary

### ✅ **Completed (Phase 1)**
- **Lesson Editor**: Professional-grade course content creation tool
- **Block System**: Text, Video, Image, Enhanced Quiz, File Download, External Links
- **User Authentication**: Supabase Auth with role-based access
- **User Management**: Complete admin interface for user operations
- **File Storage**: Image and document upload capabilities
- **Database Schema**: Optimized PostgreSQL structure with RLS policies
- **Brand Integration**: FNE colors, typography, and design system

### 🔄 **In Progress**
- **Production Deployment**: Vercel deployment preparation
- **Team Onboarding**: Admin access for content creation
- **Content Creation**: Building first course modules

### 🚀 **Next Immediate Goals**
1. **Deploy to Production** (Vercel + Supabase)
2. **Course Structure Implementation** (Modules, sequencing)
3. **School Multi-tenancy Setup** (Spaces architecture)
4. **Role System Expansion** (Beyond admin/docente)
5. **Collaboration Features** (Messaging, forums)

## 8. Contact Information

**Technical Support**: Brent Curtis
- **Phone**: +56941623577
- **Email**: bcurtis@nuevaeducacion.org

## Conclusion

This LMS platform aims to unify online training and teacher collaboration into a single environment, aligned with cultural change and professional development goals. Through LearnDash and BuddyBoss, the platform enables customized courses, scalable role and permission assignment, and social and collaborative spaces suited to each school's organizational structure.