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