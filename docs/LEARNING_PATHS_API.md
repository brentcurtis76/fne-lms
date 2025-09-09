# Learning Paths API Documentation

## Overview

The Learning Paths API provides endpoints for creating, managing, and assigning learning paths in the FNE LMS system. All endpoints require authentication and respect Row Level Security policies.

## Authentication

All endpoints require a valid session token. The API uses Supabase Auth for authentication.

## Permissions

- **Create/Update/Delete**: Requires `admin`, `equipo_directivo`, or `consultor` role
- **View**: All authenticated users can view learning paths
- **Assign**: Requires `admin`, `equipo_directivo`, or `consultor` role

## API Endpoints

### 1. Learning Paths Management

#### GET /api/learning-paths
Get all learning paths with creator names and course counts.

**Response:**
```json
[
  {
    "id": "uuid",
    "name": "Introduction to Teaching",
    "description": "A comprehensive path for new teachers",
    "created_by": "user-uuid",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "created_by_name": "John Doe",
    "course_count": 5
  }
]
```

#### POST /api/learning-paths
Create a new learning path with courses.

**Request Body:**
```json
{
  "name": "Introduction to Teaching",
  "description": "A comprehensive path for new teachers",
  "courseIds": ["course-id-1", "course-id-2", "course-id-3"]
}
```

**Response:**
```json
{
  "id": "uuid",
  "name": "Introduction to Teaching",
  "description": "A comprehensive path for new teachers",
  "created_by": "user-uuid",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

### 2. Individual Learning Path Operations

#### GET /api/learning-paths/[id]
Get a single learning path with all its courses.

**Response:**
```json
{
  "id": "uuid",
  "name": "Introduction to Teaching",
  "description": "A comprehensive path for new teachers",
  "created_by": "user-uuid",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "courses": [
    {
      "course_id": "course-uuid",
      "course_title": "Teaching Fundamentals",
      "course_description": "Basic principles of education",
      "sequence": 1
    },
    {
      "course_id": "course-uuid-2",
      "course_title": "Classroom Management",
      "course_description": "Effective classroom strategies",
      "sequence": 2
    }
  ]
}
```

#### PUT /api/learning-paths/[id]
Update a learning path (name, description, and courses).

**Request Body:**
```json
{
  "name": "Updated Path Name",
  "description": "Updated description",
  "courseIds": ["course-id-1", "course-id-3", "course-id-4"]
}
```

**Notes:**
- This operation replaces ALL courses in the path
- Course sequence is determined by the order in the courseIds array
- Only the path creator or admins can update a path

#### DELETE /api/learning-paths/[id]
Delete a learning path. This will cascade delete all assignments.

**Response:** 204 No Content

**Notes:**
- Only the path creator or admins can delete a path
- All assignments will be automatically removed

### 3. Assignment Operations

#### POST /api/learning-paths/assign
Assign a learning path to a user or group (atomic operation).

**Request Body (User Assignment):**
```json
{
  "pathId": "path-uuid",
  "userId": "user-uuid"
}
```

**Request Body (Group Assignment):**
```json
{
  "pathId": "path-uuid",
  "groupId": "group-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "assignment": {
    "id": "assignment-uuid",
    "path_id": "path-uuid",
    "user_id": "user-uuid",
    "group_id": null,
    "assigned_by": "assigner-uuid",
    "assigned_at": "2024-01-01T00:00:00Z"
  },
  "message": "Learning path assigned to user successfully"
}
```

**Error Responses:**
- 409 Conflict: If the path is already assigned to the user/group

#### POST /api/learning-paths/batch-assign
Assign a learning path to multiple users and/or groups in a single atomic operation.

**Request Body:**
```json
{
  "pathId": "path-uuid",
  "userIds": ["user-uuid-1", "user-uuid-2", "user-uuid-3"],
  "groupIds": ["group-uuid-1", "group-uuid-2"]
}
```

**Response:**
```json
{
  "success": true,
  "pathName": "Introduction to Teaching",
  "assignments_created": 4,
  "assignments_skipped": 1,
  "assignment_ids": ["assignment-uuid-1", "assignment-uuid-2", ...],
  "message": "4 assignments created, 1 skipped (already assigned)"
}
```

**Notes:**
- Automatically skips users/groups that are already assigned
- Entire operation is atomic - if any assignment fails, all are rolled back
- Returns detailed statistics about created vs skipped assignments

#### GET /api/learning-paths/assignments/[pathId]
Get all assignments for a specific learning path.

**Response:**
```json
[
  {
    "id": "assignment-uuid",
    "path_id": "path-uuid",
    "user_id": "user-uuid",
    "group_id": null,
    "assigned_by": "assigner-uuid",
    "assigned_at": "2024-01-01T00:00:00Z",
    "user": {
      "id": "user-uuid",
      "first_name": "Jane",
      "last_name": "Smith"
    },
    "assignee": {
      "id": "assigner-uuid",
      "first_name": "John",
      "last_name": "Doe"
    }
  }
]
```

#### DELETE /api/learning-paths/assignments/[pathId]
Remove an assignment.

**Request Body:**
```json
{
  "assignmentId": "assignment-uuid"
}
```

**Response:** 204 No Content

### 4. User Learning Paths

#### GET /api/learning-paths/user/[userId]
Get all learning paths assigned to a specific user (both direct and group assignments).

**Response:**
```json
[
  {
    "path_id": "path-uuid",
    "path_name": "Introduction to Teaching",
    "path_description": "A comprehensive path for new teachers",
    "assigned_at": "2024-01-01T00:00:00Z",
    "assignment_type": "direct",
    "course_count": 5
  },
  {
    "path_id": "path-uuid-2",
    "path_name": "Advanced Pedagogy",
    "path_description": "Advanced teaching techniques",
    "assigned_at": "2024-01-02T00:00:00Z",
    "assignment_type": "group",
    "course_count": 8
  }
]
```

**Notes:**
- Users can view their own learning paths
- Admins and authorized roles can view any user's learning paths

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:
- 200 OK: Successful GET/PUT
- 201 Created: Successful POST
- 204 No Content: Successful DELETE
- 400 Bad Request: Invalid input
- 401 Unauthorized: No valid session
- 403 Forbidden: Insufficient permissions
- 404 Not Found: Resource not found
- 409 Conflict: Resource already exists
- 500 Internal Server Error: Server error

## Transaction Safety

All multi-table operations use PostgreSQL stored procedures for true atomic transactions:
- **Creating a learning path**: Uses `create_full_learning_path` function - guarantees atomic creation of path + courses
- **Updating a learning path**: Uses `update_full_learning_path` function - atomic replacement of all courses
- **Batch assignments**: Uses `batch_assign_learning_path` function - atomic assignment to multiple users/groups

These database-level transactions provide fail-safe atomicity. If any part of the operation fails (including network issues), the entire transaction is automatically rolled back by PostgreSQL, ensuring zero data corruption risk.

## Rate Limiting

Currently, there are no specific rate limits on these endpoints, but they are subject to Supabase's general rate limiting policies.

## Examples

### Creating a Complete Learning Path

```bash
curl -X POST https://your-domain.com/api/learning-paths \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "New Teacher Onboarding",
    "description": "Essential courses for new teachers",
    "courseIds": [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
      "550e8400-e29b-41d4-a716-446655440003"
    ]
  }'
```

### Assigning to a Group

```bash
curl -X POST https://your-domain.com/api/learning-paths/assign \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "pathId": "550e8400-e29b-41d4-a716-446655440000",
    "groupId": "660e8400-e29b-41d4-a716-446655440000"
  }'
```