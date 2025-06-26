# Toast Notification Migration Guide

## ⚠️ IMPORTANT: Toasts vs Modals

### Use Toast Notifications for:
- ✅ Status updates (success, error, info)
- ✅ Background operations feedback
- ✅ Non-critical information

### Use Modal Dialogs for:
- 🔲 Confirmations (delete, cancel, etc.)
- 🔲 User decisions
- 🔲 Critical warnings

**NEVER use toastConfirm() for important actions!** Use the `ConfirmModal` component instead.

## Overview
This guide helps migrate from direct `react-hot-toast` usage to our new branded toast system that follows FNE design standards.

## Quick Migration Steps

### 1. Update Imports
Replace:
```typescript
import { toast } from 'react-hot-toast';
```

With:
```typescript
import { toastSuccess, toastError, toastInfo, toastLoading } from '../utils/toastUtils';
import { TOAST_MESSAGES } from '../constants/toastMessages';
```

### 2. Basic Toast Replacements

#### Success Messages
```typescript
// Before
toast.success('Course created successfully');

// After
toastSuccess(TOAST_MESSAGES.CRUD.CREATE_SUCCESS('Curso'));
```

#### Error Messages
```typescript
// Before
toast.error(`Error: ${error.message}`);

// After
toastError(TOAST_MESSAGES.CRUD.CREATE_ERROR('curso', error.message));
// Or use handleApiError for API errors:
handleApiError(error, 'Error al crear el curso');
```

#### Loading Messages
```typescript
// Before
const toastId = toast.loading('Loading...');
// ... later
toast.dismiss(toastId);

// After
const toastId = toastLoading(TOAST_MESSAGES.CRUD.LOADING('datos'));
// ... later
dismissToast(toastId);
```

## Common Message Patterns

### CRUD Operations
```typescript
// Create
toastSuccess(TOAST_MESSAGES.CRUD.CREATE_SUCCESS('Usuario'));
toastSuccess(TOAST_MESSAGES.CRUD.CREATE_SUCCESS_FEMALE('Tarea')); // For feminine nouns

// Update
toastSuccess(TOAST_MESSAGES.CRUD.UPDATE_SUCCESS('Perfil'));

// Delete
toastSuccess(TOAST_MESSAGES.CRUD.DELETE_SUCCESS('Archivo'));

// Errors
toastError(TOAST_MESSAGES.CRUD.CREATE_ERROR('usuario', error.message));
```

### Authentication
```typescript
// Login/Logout
toastSuccess(TOAST_MESSAGES.AUTH.LOGIN_SUCCESS);
toastSuccess(TOAST_MESSAGES.AUTH.LOGOUT_SUCCESS);

// Errors
toastError(TOAST_MESSAGES.AUTH.UNAUTHORIZED);
toastError(TOAST_MESSAGES.AUTH.SESSION_EXPIRED);
```

### File Operations
```typescript
// Upload
toastSuccess(TOAST_MESSAGES.FILE.UPLOAD_SUCCESS(fileName));
toastError(TOAST_MESSAGES.FILE.SIZE_ERROR('10MB'));

// Loading
const toastId = toastLoading(TOAST_MESSAGES.FILE.UPLOADING);
```

### User Management
```typescript
// Profile
toastSuccess(TOAST_MESSAGES.USER.PROFILE_UPDATED);
toastError(TOAST_MESSAGES.USER.PROFILE_ERROR);

// Roles
toastSuccess(TOAST_MESSAGES.USER.ROLE_UPDATED);
```

## Gender-Aware Messages

For Spanish grammar correctness, use the helper function:
```typescript
import { getGenderedMessage, ENTITY_GENDERS } from '../constants/toastMessages';

// Masculine entity
toastSuccess(getGenderedMessage('Curso', 'CREATE', true, false));
// Output: "Curso creado exitosamente"

// Feminine entity
toastSuccess(getGenderedMessage('Tarea', 'CREATE', true, true));
// Output: "Tarea creada exitosamente"
```

## Promise-Based Operations
```typescript
// Before
toast.promise(
  saveData(),
  {
    loading: 'Saving...',
    success: 'Saved!',
    error: 'Error saving'
  }
);

// After
toastPromise(
  saveData(),
  {
    loading: TOAST_MESSAGES.CRUD.SAVING,
    success: TOAST_MESSAGES.CRUD.SAVE_SUCCESS,
    error: (err) => TOAST_MESSAGES.CRUD.SAVE_ERROR + ': ' + err.message
  }
);
```

## Custom Confirmations
```typescript
toastConfirm(
  '¿Estás seguro de que deseas eliminar este elemento?',
  () => {
    // On confirm
    deleteItem();
    toastSuccess(TOAST_MESSAGES.CRUD.DELETE_SUCCESS('elemento'));
  },
  () => {
    // On cancel
    toastInfo('Operación cancelada');
  }
);
```

## Testing Your Migration

1. Visit `/test-toast` to see all toast types in action
2. Verify colors match FNE branding:
   - Success: Golden Yellow accent (#fdb933)
   - Error: Red accent (#ef4044)
   - Info/Loading: Navy Blue accent (#00365b)
3. Check Spanish messages are grammatically correct
4. Test on mobile devices for responsive styling

## Files Already Migrated

✅ `/pages/profile.tsx`
✅ `/components/dev/RoleSwitcher.tsx`

## Priority Files for Migration

1. **Authentication Pages** (High Priority)
   - `/pages/login.tsx`
   - `/pages/change-password.tsx`
   - `/pages/reset-password.tsx`

2. **User Management** (High Priority)
   - `/pages/admin/user-management.tsx`
   - `/components/admin/BulkUserImportModal.tsx`

3. **Course Management** (Medium Priority)
   - `/pages/admin/course-builder/*.tsx`
   - `/pages/course-manager.tsx`

4. **Assignment System** (Medium Priority)
   - `/pages/assignments/*.tsx`
   - `/components/assignments/*.tsx`

## Migration Checklist

- [ ] Update imports
- [ ] Replace all `toast.success()` calls
- [ ] Replace all `toast.error()` calls
- [ ] Replace all `toast.loading()` calls
- [ ] Replace all `toast.promise()` calls
- [ ] Ensure all messages are in Spanish
- [ ] Use appropriate gendered messages
- [ ] Test the page functionality
- [ ] Verify toast styling matches FNE brand

## Need Help?

- Check `/constants/toastMessages.ts` for available message templates
- Review `/utils/toastUtils.ts` for utility functions
- Test your changes at `/test-toast`
- Use browser DevTools to verify proper styling is applied