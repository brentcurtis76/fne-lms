# FNE LMS - Reporting Access Control

## Overview
The reporting system now implements strict role-based access control to ensure users only see data within their scope of responsibility.

## Access Levels by Role

### 1. Admin
- **Access**: Complete platform visibility
- **Data Scope**: All users, schools, generations, and communities
- **Filters Available**: All filters (schools, generations, communities, courses)

### 2. Consultor (Consultant)
- **Access**: Only students assigned to them
- **Data Scope**: Individual students under their supervision
- **Filters Available**: Limited to their assigned students' schools/communities
- **Use Case**: Monitor progress of specific students they mentor

### 3. Equipo Directivo (School Leadership)
- **Access**: All users within their school
- **Data Scope**: All students and teachers in their assigned school
- **Filters Available**: Their school only, all generations and communities within
- **Use Case**: School-wide performance monitoring

### 4. Líder de Generación (Generation Leader)
- **Access**: Users within their school and generation
- **Data Scope**: Students and teachers in their specific generation
- **Filters Available**: Their school and generation only
- **Use Case**: Generation-specific progress tracking

### 5. Líder de Comunidad (Community Leader)
- **Access**: Members of their growth community
- **Data Scope**: All members of their assigned community
- **Filters Available**: Their community only
- **Use Case**: Community engagement and progress monitoring

### 6. Docente (Teacher)
- **Access**: NO ACCESS TO REPORTS
- **Redirect**: Automatically redirected to dashboard
- **Reason**: Teachers are students in the FNE system and don't need reporting access

## Implementation Details

### Frontend Changes

1. **Sidebar Navigation** (`/components/layout/Sidebar.tsx`)
   - Added `restrictedRoles` property to Reports menu item
   - Reports section hidden from Docentes

2. **Report Pages** (`/pages/enhanced-reports.tsx`, `/pages/detailed-reports.tsx`)
   - Immediate redirect for Docentes without showing any UI
   - Role-based data filtering implemented
   - Visual notice showing data access scope

3. **Filters Component** (`/components/reports/AdvancedFilters.tsx`)
   - Dynamic filter options based on user role
   - Prevents users from selecting data outside their scope

### Backend Services

1. **Report Service** (`/lib/services/reports.js`)
   - Implements role-based query filtering
   - Handles consultant assignments lookup
   - Returns only authorized data

2. **Filter Utilities** (`/utils/reportFilters.ts`)
   - Centralized role-based filter logic
   - Human-readable scope descriptions
   - Type-safe filter generation

## Security Considerations

1. **Client-Side Protection**: UI elements hidden based on role
2. **Server-Side Protection**: Queries filtered at service level
3. **Database-Level Protection**: RLS policies enforce access (pending implementation)

## Testing Checklist

- [ ] Admin can see all data across the platform
- [ ] Consultants see only their assigned students
- [ ] School leaders see only their school's data
- [ ] Generation leaders see only their generation's data
- [ ] Community leaders see only their community's data
- [ ] Docentes cannot access reports at all
- [ ] Filter dropdowns show appropriate options per role
- [ ] Data queries return only authorized records

## Future Enhancements

1. **Database Views**: Create materialized views for report data
2. **RLS Policies**: Implement row-level security for report tables
3. **Performance**: Add indexes for role-based filtering
4. **Caching**: Implement role-aware caching strategy