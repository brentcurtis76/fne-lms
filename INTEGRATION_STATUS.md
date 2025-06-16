# Schools-Clients Integration Status

## Issue
When trying to link a client to a school, getting error: "Error al vincular cliente"

## Root Cause
The database columns `school_id` in `clientes` table and `cliente_id` in `schools` table don't exist yet.

## Solution

### 1. Apply Database Migration
Run the following SQL in Supabase SQL Editor:

```sql
-- Use the fixed version that handles INTEGER school IDs
-- File: /database/integrate-schools-clients-fixed.sql
```

### 2. Code Updates Already Applied
- ✅ Updated School interface to use `id: number` instead of `id: string`
- ✅ Updated Generation interface to use `school_id: number`
- ✅ Updated expandedSchools Set to use numbers
- ✅ Updated ContractForm to handle integer school IDs
- ✅ Added bidirectional linking in handleSaveLinkClient

### 3. Features Implemented
- School management page shows client information
- "Crear Contrato" button for schools with linked clients
- "Vincular Cliente" button for schools without clients
- Contract form can select/create schools
- Automatic bidirectional linking

## Next Steps
1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj
2. Navigate to SQL Editor
3. Create new query
4. Copy and paste the SQL from `/database/integrate-schools-clients-fixed.sql`
5. Run the SQL
6. Test the linking functionality

## Testing
After applying the SQL:
1. Try linking a client to a school
2. Create a new school from contracts page
3. Create a contract from schools page
4. Verify bidirectional updates work