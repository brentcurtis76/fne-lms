# Schools-Clients Integration

This document describes the integration between the schools (educational view) and clients (business view) systems.

## Overview

The integration allows schools to be linked with clients, enabling:
- Contract creation directly from the schools management interface
- Client information display in the schools table
- Automatic client creation when creating new schools
- Contract count tracking for each school

## Database Changes

The integration adds the following to the database:

1. **Schools table**: Added `cliente_id` column to link schools with clients
2. **Clients table**: Added `school_id` column for reverse reference
3. **Functions**:
   - `sync_school_client_data()`: Syncs data between schools and clients (optional)
   - `link_existing_schools_clients()`: Links existing schools with clients by matching names
   - `create_client_from_school()`: Creates a new client from school data
4. **View**: `school_client_view` - Provides a unified view of school-client relationships

## UI Updates

### Schools Management Page (`/admin/schools`)

1. **Client Information Display**:
   - Shows linked client name with briefcase icon
   - Displays contract count for schools with clients

2. **Action Buttons**:
   - **"Vincular Cliente"**: Links an existing client to a school without a client
   - **"Crear Contrato"**: Creates a new contract with pre-filled client data (for schools with clients)

3. **School Creation/Editing**:
   - Option to select an existing client
   - Option to create a new client with the school
   - Client form fields when creating a new client

4. **Client Link Modal**:
   - Simple dropdown to select and link an existing client to a school

### Contracts Page Integration

When clicking "Crear Contrato" from the schools page:
- Automatically navigates to contracts page with "nuevo" tab active
- Pre-selects the client in the contract form
- Shows a success message with the school name

## How to Apply the Integration

1. **Run the SQL migration**:
   ```bash
   node scripts/apply-schools-clients-integration.js
   ```
   
   Or manually apply the SQL from `/database/integrate-schools-clients.sql` in your Supabase SQL editor.

2. **Link existing schools with clients** (optional):
   After applying the migration, you can run:
   ```sql
   SELECT * FROM link_existing_schools_clients();
   ```
   This will automatically link schools and clients with matching names.

## Key Relationships

- **School Name** ↔ **Cliente "Nombre de fantasía"**: These fields correspond to each other
- **School Code** ↔ **Cliente RUT**: Can be used for matching (optional)
- **School Region** ↔ **Cliente Ciudad**: Location information

## Usage Examples

### Creating a School with a New Client

1. Click "Nueva Escuela" in schools management
2. Fill in school information
3. Check "Crear nuevo cliente"
4. Fill in required client fields (Nombre Legal, RUT, Representante)
5. Save the school - client will be created automatically

### Linking an Existing Client to a School

1. Click "Vincular Cliente" button on a school row
2. Select the client from the dropdown
3. The school and client will be linked

### Creating a Contract from Schools Page

1. Click "Crear Contrato" on a school that has a linked client
2. You'll be redirected to the contracts page
3. The client will be pre-selected in the contract form
4. Complete the contract details and save

## Technical Notes

- The integration uses foreign key relationships with `ON DELETE SET NULL` to handle deletions gracefully
- Indexes are created on `cliente_id` and `school_id` for performance
- RLS policies ensure users can only see client data for their schools
- The sync triggers are commented out by default but can be enabled for automatic data synchronization