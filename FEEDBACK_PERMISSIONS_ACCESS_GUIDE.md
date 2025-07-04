# How to Access Feedback Permissions

## Direct URL
As an admin, you can access the feedback permissions directly at:
**http://localhost:3000/admin/configuration**

Then click on the **"Usuarios y Permisos"** tab.

## Via Navigation

### 1. Check if you see "Configuración" in the sidebar
Look for this item in your sidebar menu:
- 🔧 **Configuración** (with a cog/gear icon)

### 2. If you DON'T see "Configuración":
This means you might not be logged in as an admin. Check your role:
- Your email should be: brentcurtis76@gmail.com
- Your role should be: admin

### 3. Once in Configuration page:
1. Click on **"Usuarios y Permisos"** tab (third tab)
2. You'll see the "Permisos para Reportar Problemas" section
3. Search for users and grant/revoke permissions

## Troubleshooting

### Can't see "Configuración" in sidebar?
Run this in the browser console to check your role:
```javascript
// Check your current user role
const { data: profile } = await window.supabase
  .from('profiles')
  .select('email, role')
  .eq('id', (await window.supabase.auth.getUser()).data.user.id)
  .single();
console.log('Your profile:', profile);
```

### Direct navigation not working?
Try clearing your browser cache and refreshing the page.

## Alternative: Quick Test
To quickly test if the system is working, you can:
1. Log out
2. Log in as a non-admin user
3. Check if the feedback button is visible (it shouldn't be)
4. Log back in as admin
5. Grant permission to that user
6. Log in as that user again
7. The feedback button should now appear