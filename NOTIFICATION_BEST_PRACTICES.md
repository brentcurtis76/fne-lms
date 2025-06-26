# FNE LMS Notification Best Practices

## When to Use Each Notification Type

### 🍞 Toast Notifications (`toastSuccess`, `toastError`, `toastInfo`)
**Use for:**
- ✅ Success messages after actions (save, update, create)
- ❌ Error messages for failed operations
- ℹ️ Informational updates
- ⏳ Loading states for async operations

**Examples:**
```typescript
// Good uses
toastSuccess('Perfil actualizado correctamente');
toastError('Error al guardar los cambios');
toastInfo('Nuevas notificaciones disponibles');
const loadingId = toastLoading('Guardando...');
```

**DON'T use for:**
- ❌ Confirmations requiring user decision
- ❌ Complex error messages needing detailed explanation
- ❌ Critical warnings that need user acknowledgment

### 🔲 Modal Dialogs (`ConfirmModal`)
**Use for:**
- 🗑️ Destructive actions (delete, remove, cancel)
- ⚠️ Important confirmations
- 📋 Actions that need user attention
- 🔒 Security-related confirmations

**Examples:**
```typescript
// Good uses
<ConfirmModal
  isOpen={showDeleteConfirm}
  onClose={() => setShowDeleteConfirm(false)}
  onConfirm={handleDelete}
  title="Eliminar Usuario"
  message="¿Estás seguro de que deseas eliminar este usuario?"
  isDangerous={true}
/>
```

### ❌ NEVER Use Native Dialogs
**Don't use:**
- `window.confirm()` 
- `window.alert()`
- `window.prompt()`

These break the user experience and don't match the FNE design system.

## Implementation Guidelines

### For Status Messages (Toast)
1. Keep messages short and clear
2. Use Spanish language
3. Show success after completed actions
4. Show errors with helpful context
5. Auto-dismiss after 3-5 seconds

### For Confirmations (Modal)
1. Use clear, specific titles
2. Explain consequences in the message
3. Use "Cancelar" and action verb for buttons
4. Mark dangerous actions with red styling
5. Prevent accidental clicks with proper spacing

## Migration Checklist

When updating a component:
- [ ] Replace `alert()` with `toastInfo()` or modal
- [ ] Replace `confirm()` with `ConfirmModal`
- [ ] Replace `toast.success()` with `toastSuccess()`
- [ ] Replace `toast.error()` with `toastError()`
- [ ] Ensure all messages are in Spanish
- [ ] Test on mobile devices

## Common Patterns

### Delete Confirmation
```typescript
const [deleteConfirm, setDeleteConfirm] = useState({ 
  isOpen: false, 
  item: null 
});

// In your JSX
<button onClick={() => setDeleteConfirm({ isOpen: true, item })}>
  Eliminar
</button>

<ConfirmModal
  isOpen={deleteConfirm.isOpen}
  onClose={() => setDeleteConfirm({ isOpen: false, item: null })}
  onConfirm={() => {
    handleDelete(deleteConfirm.item);
    toastSuccess('Elemento eliminado');
  }}
  title="Confirmar Eliminación"
  message={`¿Eliminar ${deleteConfirm.item?.name}?`}
  isDangerous={true}
/>
```

### Save Success Pattern
```typescript
try {
  await saveData();
  toastSuccess(TOAST_MESSAGES.CRUD.SAVE_SUCCESS);
} catch (error) {
  toastError(TOAST_MESSAGES.CRUD.SAVE_ERROR);
}
```

## Remember
- Toasts = Temporary status updates
- Modals = User decisions and confirmations
- Never mix the two concepts!