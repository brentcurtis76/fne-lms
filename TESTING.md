# FNE LMS - Comprehensive Testing Suite

## 🎯 Overview

This project implements a **multi-layer automated testing strategy** that provides comprehensive coverage without requiring human intervention. All tests run automatically on code changes and cover every user role and component.

## 🏗️ Testing Architecture

### 1. **Unit & Integration Tests** (Vitest + React Testing Library)
- **Location**: `__tests__/`
- **Coverage**: Components, services, utilities, and business logic
- **Run Command**: `npm run test`
- **Coverage**: `npm run test:coverage`

### 2. **Role-Based Access Tests**
- **Location**: `__tests__/integration/role-based-access.test.tsx`
- **Coverage**: All 6 user roles with permission matrix testing
- **Run Command**: `npm run test:roles`

### 3. **End-to-End Tests** (Playwright)
- **Location**: `e2e/`
- **Coverage**: Complete user workflows across browsers
- **Run Command**: `npm run e2e`

### 4. **CI/CD Pipeline** (GitHub Actions)
- **Location**: `.github/workflows/`
- **Coverage**: Automated testing on every push/PR
- **Features**: Parallel execution, visual regression, performance testing

## 🔐 Role-Based Testing

### User Roles Tested
1. **Admin** (`admin`) - Full platform control
2. **Consultor** (`consultor`) - FNE instructors  
3. **Equipo Directivo** (`equipo_directivo`) - School administration
4. **Líder Generación** (`lider_generacion`) - Generation oversight
5. **Líder Comunidad** (`lider_comunidad`) - Community leadership
6. **Docente** (`docente`) - Teachers/Students

### Permission Patterns
- **Admin Only**: User management, system configuration
- **Admin + Consultants**: Course creation, assignments
- **School Leadership**: Reporting (excludes docentes)
- **All Authenticated**: Basic features like profile, courses

## 🏭 Test Data Factory

### UserFactory Features
```typescript
// Create complete test environment
const testData = UserFactory.createRoleBasedUsers();

// Create specific role users
const admin = UserFactory.createUser({ role: 'admin' });
const student = UserFactory.createUser({ role: 'docente', school_id: 'school-1' });

// Create test environments
const environment = UserFactory.createTestEnvironment();
```

### Test Scenarios
- **Full Environment**: All roles with realistic relationships
- **Consultant Scenario**: Consultant with assigned students
- **School Scenario**: Complete school hierarchy
- **Minimal**: Basic admin + student for simple tests

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
npm run e2e:install  # Install Playwright browsers
```

### 2. Set up Test Database (Optional)
```bash
# Set up test users and data
npm run test:setup-db

# Clean up test data
npm run test:cleanup-db
```

### 3. Run Tests

#### Quick Tests (Local Development)
```bash
# Unit tests only
npm run test

# Role-based tests only  
npm run test:roles

# Integration tests
npm run test:integration

# E2E tests (requires running app)
npm run e2e
```

#### Full Test Suite
```bash
# Complete automated test suite
npm run test:full-suite
```

## 🎭 End-to-End Testing

### Browser Coverage
- **Chromium** (Chrome/Edge)
- **Firefox**
- **WebKit** (Safari)
- **Mobile** (iOS/Android simulation)

### Test Categories

#### Authentication Tests (`@auth`)
- Login/logout flows for all roles
- Session persistence
- Role-based navigation verification
- Dev role switching functionality

#### Role-Specific Tests
- `@admin` - Administrative features
- `@consultant` - Course management, student assignments
- `@student` - Learning activities, assignments
- `@director` - School reporting and management

#### Cross-Browser Tests
```bash
# Specific browser testing
npx playwright test --project=chromium
npx playwright test --project=firefox  
npx playwright test --project=webkit
```

#### Visual Regression Tests
```bash
# Run visual tests
npx playwright test --project=visual
```

#### Performance Tests
```bash
# Run performance tests
npx playwright test --project=performance
```

## 🤖 CI/CD Automation

### GitHub Actions Workflows

#### Main Test Workflow (`.github/workflows/test.yml`)
- **Triggers**: Push to main/develop, PRs
- **Jobs**: 
  - Unit tests (Node 18 & 20)
  - Role-based tests
  - Database integration tests
  - Build verification
  - Security audit

#### E2E Workflow (`.github/workflows/e2e.yml`)  
- **Triggers**: Main branch, labeled PRs
- **Jobs**:
  - Cross-browser testing
  - Visual regression
  - Performance testing
  - Mobile testing
  - Accessibility testing

### Automated Features
- **Parallel Execution**: Multiple test jobs run simultaneously
- **Conditional Testing**: E2E only runs when needed
- **Artifact Collection**: Screenshots, videos, reports
- **Test Summaries**: Detailed GitHub step summaries

## 📊 Test Coverage & Quality

### Coverage Targets
- **Lines**: 80%
- **Functions**: 70%
- **Branches**: 70%
- **Statements**: 80%

### Quality Gates
- All tests must pass before deployment
- No TypeScript errors
- Linting passes
- Security audit clean
- Build succeeds

## 🔧 Advanced Testing Features

### Dev Role Impersonation Testing
```typescript
// Test dev user switching roles
const devUser = UserFactory.createUser({ role: 'admin' });
mockDevRoleImpersonation('docente', devUser);
```

### Component Permission Testing
```typescript
// Test component access across roles
await testComponentWithRoles(
  MyComponent,
  props,
  PermissionPatterns.adminOnly()
);
```

### API Access Testing
```typescript
// Test API endpoints with different roles
await testRoleBasedAPIAccess(
  apiFunction,
  PermissionPatterns.reportingAccess()
);
```

## 🐛 Debugging Tests

### Unit Tests
```bash
# Watch mode for development
npm run test:watch

# Debug specific test
npm run test -- --run __tests__/path/to/test.tsx
```

### E2E Tests
```bash
# Run with browser UI
npm run e2e:ui

# Run in headed mode (see browser)
npm run e2e:headed

# Debug mode (step through)
npm run e2e:debug
```

### Visual Tests
```bash
# Update snapshots
npx playwright test --project=visual --update-snapshots
```

## 📈 Performance & Monitoring

### Test Performance
- **Unit Tests**: ~5 seconds for 200+ tests
- **E2E Tests**: ~10-15 minutes for full browser matrix
- **Total Pipeline**: ~30 minutes for complete suite

### Monitoring
- Test results tracked in GitHub Actions
- Coverage reports generated automatically
- Performance metrics collected via Lighthouse
- Visual regression diffs stored as artifacts

## 🔍 Test Organization

### Directory Structure
```
__tests__/
├── components/           # Component unit tests
├── factories/           # Test data generation
├── integration/         # Integration tests
├── services/           # Service layer tests
└── utils/              # Testing utilities

e2e/
├── tests/              # E2E test specs
├── utils/              # E2E helpers
├── global-setup.ts     # E2E setup
└── global-teardown.ts  # E2E cleanup
```

### Naming Conventions
- **Unit Tests**: `*.test.{ts,tsx}`
- **Integration Tests**: `*.integration.test.{ts,tsx}`
- **E2E Tests**: `*.spec.ts`
- **Visual Tests**: `*.visual.spec.ts`
- **Performance Tests**: `*.perf.spec.ts`

## 🎯 Test Strategy by Feature

### User Management
- ✅ Role assignment and permissions
- ✅ User creation and approval workflows
- ✅ Profile completion flows
- ✅ Password reset functionality

### Course System
- ✅ Course creation (admin/consultant only)
- ✅ Lesson editor with all block types
- ✅ Quiz system with multiple question types
- ✅ Student progression tracking

### Assignment System
- ✅ Individual assignments
- ✅ Group assignments with collaboration
- ✅ Submission workflows
- ✅ Grading and feedback

### Reporting System
- ✅ Role-based data access
- ✅ Progress tracking
- ✅ Analytics dashboards
- ✅ Export functionality

### Collaborative Features
- ✅ Workspace access by role
- ✅ Messaging and mentions
- ✅ Document sharing
- ✅ Community management

## 🚨 Troubleshooting

### Common Issues

#### Tests Failing Locally
```bash
# Clear cache and reinstall
rm -rf node_modules .next
npm install

# Reset test database
npm run test:cleanup-db
npm run test:setup-db
```

#### E2E Tests Timing Out
```bash
# Increase timeout in playwright.config.ts
# Or run with more workers locally
npx playwright test --workers=1
```

#### Coverage Not Meeting Thresholds
```bash
# Run coverage report
npm run test:coverage

# Check coverage/index.html for details
```

## 📚 Resources

### Documentation
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)

### Project-Specific Guides
- `__tests__/factories/userFactory.ts` - Test data creation
- `__tests__/utils/roleTestUtils.ts` - Role testing utilities
- `e2e/utils/auth-helpers.ts` - E2E authentication helpers

## 🎉 Success Metrics

This comprehensive testing suite provides:

✅ **Zero Human Intervention** - All tests run automatically  
✅ **Complete Role Coverage** - Every user role tested in every scenario  
✅ **Cross-Browser Compatibility** - Verified across all major browsers  
✅ **Performance Monitoring** - Automated performance regression detection  
✅ **Visual Regression** - UI changes automatically detected  
✅ **Security Testing** - Automated dependency and code scanning  
✅ **Real-World Scenarios** - Complete user workflows validated  
✅ **Continuous Feedback** - Immediate detection of regressions

The result is a robust, maintainable codebase with confidence in every deployment.