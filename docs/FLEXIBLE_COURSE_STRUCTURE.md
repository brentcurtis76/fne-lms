# Flexible Course Structure Documentation

## Overview

The Flexible Course Structure feature allows courses in the FNE LMS platform to be organized in two different ways:

1. **Simple Structure**: Lessons are organized directly under the course without modules
2. **Structured (Modular)**: Lessons are organized within modules for hierarchical organization

This feature provides flexibility for course creators to choose the most appropriate structure based on course complexity and content volume.

## Architecture

### Database Schema

#### Courses Table
```sql
courses
├── id (UUID, PK)
├── title (TEXT)
├── description (TEXT)
├── structure_type (TEXT) -- 'simple' or 'structured'
├── instructor_id (UUID, FK)
├── thumbnail_url (TEXT)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Modules Table
```sql
modules
├── id (UUID, PK)
├── course_id (UUID, FK) -- References courses.id
├── title (TEXT)
├── description (TEXT)
├── order_number (INTEGER)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

#### Lessons Table
```sql
lessons
├── id (UUID, PK)
├── course_id (UUID, FK) -- References courses.id
├── module_id (UUID, FK, NULLABLE) -- References modules.id (NULL for simple courses)
├── title (TEXT)
├── description (TEXT)
├── content (TEXT)
├── order_number (INTEGER)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

### Key Design Decisions

1. **Backward Compatibility**: Existing courses default to 'structured' type
2. **Data Integrity**: Foreign key constraints ensure referential integrity
3. **Flexible Migration**: Courses can be converted between structures without data loss
4. **Nullable module_id**: Allows lessons to exist directly under courses (simple structure)

## User Interface

### Admin Features

#### Course Creation
- Radio button selection for structure type during course creation
- Clear descriptions of each structure type
- Structure type cannot be changed after creation without explicit conversion

#### Course Management
- Visual badges indicating course structure type:
  - Green "Simple" badge for simple courses
  - Blue "Modular" badge for structured courses
- Structure type displayed in:
  - Course builder list
  - Dashboard course cards
  - Course detail pages

#### Structure Conversion
- Available in course edit page when structure differs from current
- Conversion modal with:
  - Clear explanation of changes
  - Warning for multi-module conversions
  - Reversibility notice
  - Progress indicator during conversion

### Student Experience

#### Simple Courses
- Direct lesson listing without module sections
- Linear navigation through lessons
- Simplified breadcrumbs: Course > Lesson

#### Structured Courses
- Lessons organized within collapsible module sections
- Module-based progress tracking
- Hierarchical breadcrumbs: Course > Module > Lesson

## API Endpoints

### Course Structure Management

#### Get Course Structure
```typescript
GET /api/courses/:courseId
Response: {
  id: string;
  title: string;
  structure_type: 'simple' | 'structured';
  // ... other course fields
}
```

#### Update Course Structure
```typescript
PUT /api/courses/:courseId
Body: {
  structure_type: 'simple' | 'structured';
  // ... other course fields
}
```

#### Convert Course Structure
```typescript
POST /api/courses/:courseId/convert
Body: {
  target_structure: 'simple' | 'structured';
}
Response: {
  success: boolean;
  message: string;
  course: Course;
}
```

## Conversion Process

### Simple to Structured

1. Create a default module titled "Módulo Principal"
2. Move all direct lessons to the new module
3. Preserve lesson order numbers
4. Update course structure_type to 'structured'

### Structured to Simple

1. Remove module_id from all lessons
2. Flatten lesson order numbers sequentially
3. Delete all modules
4. Update course structure_type to 'simple'

## Validation Rules

### Pre-Conversion Validation
- Course must exist and be accessible by user
- No orphaned lessons (lessons without course_id)
- No invalid module references
- No duplicate order numbers

### Structure Consistency Rules
- Simple courses cannot have modules
- Simple courses cannot have lessons with module_id
- Structured courses should have at least one module (recommended)

## Admin Tools

### Analysis Tool (`analyze-course-structure.js`)
Analyzes all courses and provides recommendations for structure optimization.

**Usage:**
```bash
node scripts/analyze-course-structure.js
```

**Output:**
- Course structure statistics
- Conversion recommendations
- Detailed analysis export (JSON)

### Conversion Tool (`convert-course-structure.js`)
Converts individual courses between structures.

**Usage:**
```bash
node scripts/convert-course-structure.js <course-id> <simple|structured>
```

**Features:**
- Validation before conversion
- Progress reporting
- Rollback capability
- Detailed logging

### Validation Tool (`validate-course-conversion.js`)
Validates course data integrity before conversion.

**Usage:**
```bash
node scripts/validate-course-conversion.js <course-id>
```

**Checks:**
- Course existence
- Lesson integrity
- Module integrity
- Order consistency
- Structure consistency

### Batch Conversion Tool (`batch-convert-courses.js`)
Converts multiple courses based on analysis recommendations.

**Usage:**
```bash
# Dry run (no changes)
node scripts/batch-convert-courses.js

# Apply changes
node scripts/batch-convert-courses.js --apply
```

**Features:**
- Dry-run mode for safety
- Progress tracking
- Error handling
- Results export

## Testing

### E2E Test Coverage

The feature includes comprehensive Playwright E2E tests covering:

1. **Admin Features**
   - Creating courses with both structures
   - Converting between structures
   - Validation and warnings
   - UI consistency

2. **Student Experience**
   - Navigation for both structures
   - Progress tracking
   - Content access

3. **Edge Cases**
   - Empty course conversion
   - Rapid conversions
   - Order preservation
   - Permission checks

### Running Tests

```bash
# Run all course structure tests
npm run test:e2e -- course-structure.spec.ts

# Run with specific browser
npm run test:e2e -- --project=chromium course-structure.spec.ts

# Run in headed mode for debugging
npm run test:e2e -- --headed course-structure.spec.ts
```

### Test Utilities

Located in `e2e/utils/course-structure-helpers.ts`:
- `createCompleteTestCourse()`: Creates test courses with data
- `convertCourseStructure()`: Performs UI-based conversion
- `verifyCourseStructure()`: Validates UI structure display
- `validateCourseStructureInDB()`: Database validation
- `cleanupAllTestCourses()`: Test data cleanup

## Migration Guide

### For Existing Courses

All existing courses automatically default to 'structured' type. To convert suitable courses to simple structure:

1. Run analysis to identify candidates:
   ```bash
   node scripts/analyze-course-structure.js
   ```

2. Review recommendations in `course-structure-analysis.json`

3. Convert individual courses:
   ```bash
   node scripts/convert-course-structure.js <course-id> simple
   ```

4. Or batch convert all recommended courses:
   ```bash
   node scripts/batch-convert-courses.js --apply
   ```

### Best Practices

#### When to Use Simple Structure
- Courses with 1-5 lessons
- Linear learning paths
- Quick tutorials or introductions
- Single-topic courses

#### When to Use Structured (Modular) Structure
- Courses with 6+ lessons
- Multiple distinct topics
- Complex learning paths
- Courses requiring prerequisite tracking

## Performance Considerations

### Database Queries
- Optimized queries using proper indexes
- Conditional joins based on structure type
- Efficient batch operations for conversions

### UI Rendering
- Lazy loading for module content
- Virtualization for large lesson lists
- Cached structure type badges

### Conversion Performance
- Batch updates minimize database round trips
- Transaction-based conversions ensure atomicity
- Progress indicators for user feedback

## Security Considerations

### Access Control
- Only admins can convert course structures
- Structure type changes logged for audit
- RLS policies respect course ownership

### Data Integrity
- Foreign key constraints prevent orphaned data
- Validation before any structure changes
- Atomic transactions prevent partial conversions

## Troubleshooting

### Common Issues

#### Issue: Conversion button not appearing
**Solution**: Ensure course has been saved with initial structure type

#### Issue: Lessons disappear after conversion
**Solution**: Check lesson course_id and module_id values in database

#### Issue: Cannot change structure type
**Solution**: Use conversion tool instead of direct edit

### Database Queries for Debugging

Check course structure:
```sql
SELECT id, title, structure_type 
FROM courses 
WHERE id = '<course-id>';
```

Find orphaned lessons:
```sql
SELECT * FROM lessons 
WHERE course_id IS NULL 
   OR (module_id IS NOT NULL 
       AND module_id NOT IN (SELECT id FROM modules));
```

Verify simple course consistency:
```sql
SELECT c.title, c.structure_type, 
       COUNT(DISTINCT m.id) as module_count,
       COUNT(DISTINCT l.id) as lesson_count,
       COUNT(DISTINCT CASE WHEN l.module_id IS NULL THEN l.id END) as direct_lessons
FROM courses c
LEFT JOIN modules m ON m.course_id = c.id
LEFT JOIN lessons l ON l.course_id = c.id
WHERE c.structure_type = 'simple'
GROUP BY c.id, c.title, c.structure_type
HAVING COUNT(DISTINCT m.id) > 0;
```

## Future Enhancements

### Planned Features
1. Bulk lesson reordering UI
2. Module templates for common structures
3. Structure recommendations based on content analysis
4. Import/export with structure preservation
5. Structure-specific progress tracking

### API Enhancements
1. GraphQL support for complex structure queries
2. Webhook notifications for structure changes
3. Batch conversion API endpoint
4. Structure analytics endpoints

## Support

For issues or questions regarding the flexible course structure feature:

1. Check this documentation
2. Review test files for implementation examples
3. Run validation tools for diagnostics
4. Contact technical support with:
   - Course ID
   - Current structure type
   - Error messages
   - Steps to reproduce issue