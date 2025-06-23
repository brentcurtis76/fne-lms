# Supabase MCP Server Capabilities and Limitations

## Overview

The Supabase MCP (Model Context Protocol) server enables AI assistants like Claude to interact directly with Supabase projects through standardized commands. However, there are important limitations to understand about how MCP servers work within Claude Code.

## Current Status (January 2025)

### ✅ MCP Server is Configured
- **Command**: `npx -y @supabase/mcp-server-supabase@latest --project-ref=sxlogxqzmarhqsblxmtj`
- **Scope**: User (available across all projects)
- **Access**: Full read/write permissions
- **Token**: Configured with personal access token

### ❌ BUT: Supabase-specific MCP Tools NOT Available in Claude Code

**IMPORTANT**: While the Supabase MCP server is configured, Claude Code does not currently expose Supabase-specific MCP tools/functions to the AI assistant. This is a known limitation.

## What CAN Be Done via MCP

### Theoretical Capabilities (When MCP Tools Are Available)

Based on Supabase MCP documentation, the server SHOULD provide:

1. **Database Operations**
   - Execute SQL queries
   - Create/modify tables and schemas
   - Manage indexes and constraints
   - Create database functions and triggers
   - Manage RLS (Row Level Security) policies
   - Run migrations

2. **Storage Management**
   - Create storage buckets
   - Set storage policies
   - Upload/download files
   - Manage file permissions

3. **Project Management**
   - Create new projects
   - Manage project configurations
   - Generate TypeScript types
   - Manage Edge Functions
   - View logs and debugging info

4. **Data Operations**
   - Query data with SELECT statements
   - Insert, update, delete records
   - Bulk operations
   - Transaction management

### Currently Available MCP Tools in Claude Code

As of January 2025, only these MCP tools are exposed:
- `mcp__ide__getDiagnostics` - Get language diagnostics from VS Code
- `mcp__ide__executeCode` - Execute Python code in Jupyter kernels

**NOTE**: No Supabase-specific MCP tools are currently available.

## What CANNOT Be Done via MCP

### Current Limitations in Claude Code

1. **No Direct Database Access via MCP**
   - Cannot execute SQL queries through MCP
   - Cannot create tables or modify schemas through MCP
   - Cannot manage RLS policies through MCP

2. **No Storage Operations via MCP**
   - Cannot create storage buckets through MCP
   - Cannot manage storage policies through MCP

3. **No Project Management via MCP**
   - Cannot create projects through MCP
   - Cannot manage configurations through MCP

### Why These Limitations Exist

1. **MCP Integration Architecture**
   - Claude Code needs to explicitly expose MCP server tools
   - Not all MCP server capabilities are automatically available
   - Tool exposure is controlled by Claude Code, not the MCP server

2. **Security Considerations**
   - Direct database access requires careful permission management
   - Claude Code may limit exposed tools for security reasons

3. **Platform Maturity**
   - MCP is a relatively new protocol
   - Integration between Claude Code and MCP servers is evolving

## Current Workarounds

Since Supabase MCP tools aren't available, use these approaches:

### 1. Manual SQL Files
```bash
# Create SQL files and apply manually
echo "CREATE TABLE example (id INT);" > migration.sql
# User must apply in Supabase dashboard
```

### 2. Supabase CLI (If Installed)
```bash
# Check if Supabase CLI is available
supabase --version

# If available, can use CLI commands
supabase db push
supabase storage create bucket-name
```

### 3. API-Based Operations
```javascript
// Use Supabase client in code
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(url, key)
// Perform operations through the client
```

### 4. Manual Dashboard Operations
For operations that require direct access:
- RLS policy creation
- Storage bucket configuration
- Database migrations
- User management

## How to Check MCP Availability

### 1. List Available MCP Servers
In Claude Code chat:
```
/mcp
```

### 2. Check MCP Status
```bash
claude mcp list
claude mcp status
```

### 3. Verify Tool Availability
Ask Claude to list available tools - if Supabase-specific tools aren't listed, they're not available.

## Troubleshooting

### MCP Server Shows as Active but No Supabase Tools

**This is the current situation**. Even though:
- ✅ MCP server is configured
- ✅ Server shows as active
- ✅ Connection is established

The Supabase-specific tools are not exposed by Claude Code.

### What to Do Instead

1. **For Database Operations**
   - Create SQL files for review
   - Provide clear instructions for manual application
   - Use scripts with Supabase CLI if available

2. **For Storage Operations**
   - Document required bucket configurations
   - Provide policy examples
   - Guide through dashboard setup

3. **For Complex Operations**
   - Break down into steps
   - Provide both SQL and dashboard instructions
   - Create verification scripts

## Future Outlook

### Expected Improvements

1. **Full MCP Tool Integration**
   - Claude Code will likely expose more MCP tools over time
   - Supabase MCP server is actively developed

2. **OAuth Authentication**
   - Future versions will support OAuth flow
   - No need for manual token management

3. **Enhanced Security Models**
   - Granular permission controls
   - Project-specific tool exposure

### When to Check for Updates

- After Claude Code updates
- When new MCP server versions release
- Check Anthropic's documentation for MCP updates

## Best Practices

### 1. Always Verify Tool Availability
Don't assume MCP tools are available - check first.

### 2. Prepare Fallback Approaches
Have manual methods ready for all operations.

### 3. Document Requirements Clearly
When MCP isn't available, provide clear manual steps.

### 4. Use Hybrid Approaches
Combine available tools (File creation, bash commands) with manual steps.

## Summary

**Current Reality**: While the Supabase MCP server is configured and connected, Claude Code does not currently expose Supabase-specific MCP tools to AI assistants. All Supabase operations must be performed through:
- SQL file creation for manual application
- Supabase CLI commands (if available)
- API operations in code
- Manual dashboard configuration

**Action Items for Users**:
1. Continue using manual SQL files for database changes
2. Apply migrations through Supabase dashboard
3. Configure storage and policies manually
4. Wait for Claude Code updates that may expose MCP tools

**Key Takeaway**: The MCP server configuration is correct, but the integration layer in Claude Code doesn't yet expose the Supabase-specific functionality. This is a platform limitation, not a configuration issue.

---

*Last Updated: January 2025*
*Based on: Claude Code behavior and available documentation*