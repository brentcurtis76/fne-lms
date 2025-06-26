# Group Assignment Comment Count Tests

This directory contains comprehensive unit and integration tests for the comment count feature added to group assignments in the collaborative workspace.

## Test Files

### 1. `groupAssignmentComments.test.tsx`
**Main component tests** - Tests the GroupAssignmentsContent component functionality:
- Loading and displaying comment counts
- Handling singular/plural text correctly
- Navigation to discussion pages
- Error handling
- Consultant view (no discussion links)

### 2. `discussionCountsIntegration.test.ts`
**Database integration tests** - Tests the data loading logic:
- Querying threads with metadata filters
- Counting messages in threads
- Handling missing threads
- Performance with large datasets
- Error recovery

### 3. `discussionLinkUI.test.tsx`
**UI interaction tests** - Tests the user interface behavior:
- Visual styling based on comment count
- Click event handling and propagation
- Hover effects
- Keyboard navigation
- Dynamic updates

## Running Tests

```bash
# Run all workspace tests
npm test tests/workspace/

# Run specific test file
npm test tests/workspace/groupAssignmentComments.test.tsx

# Run with coverage
npm test tests/workspace/ -- --coverage

# Run using the test script
./scripts/test-comment-feature.sh
```

## Test Coverage Goals

- **Component Logic**: 90%+ coverage
- **Database Queries**: 85%+ coverage
- **UI Interactions**: 80%+ coverage
- **Error Handling**: 100% coverage

## Key Test Scenarios

1. **Zero Comments**: Shows "0 comentarios" with gray styling
2. **Single Comment**: Shows "1 comentario" (singular)
3. **Multiple Comments**: Shows "X comentarios" with yellow badge
4. **Navigation**: Clicking discussion link navigates to `/community/workspace/assignments/[id]/discussion`
5. **Event Isolation**: Discussion link click doesn't trigger assignment card click
6. **Error Recovery**: Handles database errors gracefully, defaults to 0
7. **Consultant View**: Hides discussion links for consultant role

## Mocking Strategy

- **Supabase Client**: Mocked to return predictable data
- **Router**: Mocked to verify navigation calls
- **Services**: Mocked to isolate component behavior
- **Console**: Error logging captured and verified

## Future Enhancements

1. Add real-time update tests when comments are added
2. Test loading states and skeletons
3. Add E2E tests with real browser interaction
4. Test with different user roles and permissions