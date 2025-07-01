# Invoice Deletion Tests

This directory contains comprehensive unit and integration tests for the invoice deletion functionality in the contracts module.

## Test Files

### 1. `invoice-deletion.test.tsx`
Main test file covering:
- UI rendering and interactions
- Delete button functionality
- Custom confirmation modal
- Optimistic UI updates
- File upload validation
- Error handling

### 2. `invoice-helpers.test.ts`
Helper function tests for:
- `formatFileSize()` - File size formatting (B, KB, MB, GB)
- `getFileIcon()` - File type icon selection
- `formatUploadDate()` - Relative date formatting
- URL path extraction logic
- File validation rules

### 3. `invoice-deletion.integration.test.tsx`
End-to-end integration tests:
- Complete deletion flow
- Optimistic update and rollback
- Database and storage interactions
- Keyboard navigation
- Accessibility features

### 4. `setup.ts`
Test configuration and mocks for:
- Browser APIs (matchMedia, IntersectionObserver, ResizeObserver)
- Jest DOM extensions
- Console error suppression

## Running the Tests

```bash
# Run all contract tests
npm test -- __tests__/contracts/

# Run specific test file
npm test -- __tests__/contracts/invoice-deletion.test.tsx

# Run with coverage
npm test -- __tests__/contracts/ --coverage

# Run in watch mode
npm test -- __tests__/contracts/ --watch
```

## Test Coverage

The tests cover:

### UI Components
- ✅ Delete button rendering
- ✅ Custom confirmation modal
- ✅ Loading states
- ✅ Error states
- ✅ File information display

### Business Logic
- ✅ File deletion from storage
- ✅ Database updates
- ✅ Optimistic UI updates
- ✅ Error recovery
- ✅ File path extraction

### Validation
- ✅ File type validation (PDF, JPG, PNG)
- ✅ File size limits (10MB)
- ✅ Upload error handling

### User Experience
- ✅ Keyboard shortcuts (Escape key)
- ✅ Loading indicators
- ✅ Success/error messages
- ✅ Accessibility features

## Mock Structure

The tests use Jest mocks for:
- `next/router` - Navigation
- `react-hot-toast` - Toast notifications
- `@supabase/supabase-js` - Database and storage operations
- Layout components - To isolate functionality

## Adding New Tests

When adding new tests:
1. Follow the existing mock patterns
2. Test both success and failure scenarios
3. Include accessibility tests
4. Verify optimistic updates
5. Check error recovery

## Debugging Tests

If tests fail:
1. Check mock implementations match actual API
2. Verify async operations with `waitFor`
3. Use `screen.debug()` to inspect DOM
4. Check for console errors/warnings
5. Ensure proper cleanup between tests