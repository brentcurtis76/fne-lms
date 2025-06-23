# Supabase MCP Server Setup Guide

This guide explains how to set up the Supabase MCP (Model Context Protocol) server for use with Claude Code across multiple projects.

## Table of Contents
1. [Where to Find Your Supabase Tokens](#where-to-find-your-supabase-tokens)
2. [Installation Options](#installation-options)
3. [Configuration for Multiple Projects](#configuration-for-multiple-projects)
4. [Security Best Practices](#security-best-practices)
5. [Verification and Testing](#verification-and-testing)
6. [Troubleshooting](#troubleshooting)

## Where to Find Your Supabase Tokens

### Option 1: Personal Access Token (Recommended for MCP)
1. Go to [https://supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
2. Click "Generate new token"
3. Give it a descriptive name (e.g., "Claude MCP Server")
4. Select the appropriate scopes (minimum: `projects:read`, `sql:execute`)
5. Copy the token immediately (it won't be shown again)

### Option 2: Project-Specific Keys (Already in your .env.local)
- **Service Role Key**: `SUPABASE_SERVICE_ROLE_KEY` in your `.env.local`
- **Project Reference**: Found in your Supabase dashboard URL: `https://supabase.com/dashboard/project/[PROJECT_REF]`
- **Project URL**: `NEXT_PUBLIC_SUPABASE_URL` in your `.env.local`

## Installation Options

### Option 1: User Scope (Recommended for Multiple Projects)

This makes the Supabase MCP server available across all your projects:

```bash
# Install globally for all projects
claude mcp add supabase -s user -e SUPABASE_ACCESS_TOKEN=your_personal_access_token npx -y @supabase/mcp-server-supabase@latest
```

**Pros:**
- Available in all projects
- Configure once, use everywhere
- Private to your user account

**Cons:**
- Requires manual project reference for each use

### Option 2: Project Scope (For Team Collaboration)

Create a `.mcp.json` file in each project root:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": [
        "-y",
        "@supabase/mcp-server-supabase@latest",
        "--project-ref=sxlogxqzmarhqsblxmtj"
      ],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

Then set the environment variable in your shell:
```bash
export SUPABASE_ACCESS_TOKEN="your_token_here"
```

**Pros:**
- Project-specific configuration
- Can be committed to version control (without token)
- Team members can use their own tokens

**Cons:**
- Must be configured per project

### Option 3: Hybrid Approach (Best for Multiple Projects)

1. Create a global configuration directory:
```bash
mkdir -p ~/.config/claude-mcp
```

2. Create a script to launch Supabase MCP with project switching:
```bash
cat > ~/.config/claude-mcp/supabase-launcher.sh << 'EOF'
#!/bin/bash
# Supabase MCP Launcher for Multiple Projects

# Set your personal access token
export SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-your_default_token}"

# Project configurations
declare -A PROJECTS=(
  ["fne-lms"]="sxlogxqzmarhqsblxmtj"
  ["project2"]="another_project_ref"
  # Add more projects as needed
)

# Get project ref from argument or environment
PROJECT_REF="${1:-${SUPABASE_PROJECT_REF}}"

# Launch with appropriate settings
if [ -n "$PROJECT_REF" ]; then
  npx -y @supabase/mcp-server-supabase@latest --project-ref="$PROJECT_REF"
else
  echo "Please specify a project ref or set SUPABASE_PROJECT_REF"
  echo "Available projects:"
  for key in "${!PROJECTS[@]}"; do
    echo "  $key: ${PROJECTS[$key]}"
  done
  exit 1
fi
EOF

chmod +x ~/.config/claude-mcp/supabase-launcher.sh
```

3. Add to Claude Code (user scope):
```bash
claude mcp add supabase-multi -s user -e SUPABASE_ACCESS_TOKEN=your_token ~/.config/claude-mcp/supabase-launcher.sh
```

## Configuration for Multiple Projects

### Recommended Setup Structure

```
~/.config/claude-mcp/
├── supabase-launcher.sh     # Multi-project launcher
├── tokens.env               # Store tokens securely (git-ignored)
└── project-configs.json     # Project reference mappings
```

### Environment Variables Management

Create `~/.config/claude-mcp/tokens.env`:
```bash
# Supabase Personal Access Token
SUPABASE_ACCESS_TOKEN="your_personal_access_token"

# Project-specific refs (optional)
FNE_LMS_PROJECT_REF="sxlogxqzmarhqsblxmtj"
```

Load in your shell profile (`~/.zshrc` or `~/.bashrc`):
```bash
# Load Claude MCP tokens if file exists
[ -f ~/.config/claude-mcp/tokens.env ] && source ~/.config/claude-mcp/tokens.env
```

## Security Best Practices

### 1. Token Security
- **Never commit tokens** to version control
- Use environment variables or secure token storage
- Rotate tokens regularly
- Use read-only mode when possible: `--read-only`

### 2. Scope Limitation
Enable only needed features:
```bash
# Example: Only database and docs access
npx @supabase/mcp-server-supabase@latest --features=database,docs
```

Available feature groups:
- `account` - Account management
- `docs` - Documentation access
- `database` - Database operations
- `debug` - Debugging tools
- `development` - Development tools
- `functions` - Edge Functions
- `storage` - Storage operations
- `branching` - Branch management

### 3. Project Isolation
For sensitive projects, use project-specific tokens with limited scopes.

## Verification and Testing

### 1. Check MCP Server Status
In Claude Code, use:
```
/mcp
```

You should see:
```
Available MCP servers:
- supabase (active) ✓
```

### 2. Test Connection
Try a simple query:
```
Can you list the tables in my Supabase database?
```

### 3. Verify Permissions
Test with a read operation first:
```
Show me the schema of the profiles table
```

## Troubleshooting

### Common Issues

1. **"MCP server not found"**
   - Restart Claude Code after configuration
   - Check if npx is in your PATH

2. **"Authentication failed"**
   - Verify token is correct
   - Check token hasn't expired
   - Ensure project ref matches your project

3. **"Permission denied"**
   - Check token scopes
   - Verify RLS policies in Supabase
   - Try with `--read-only` flag first

### Debug Mode
Enable debug output:
```bash
MCP_DEBUG=true claude
```

### Logs Location
MCP logs are typically found in:
- macOS: `~/Library/Logs/Claude/`
- Linux: `~/.local/share/claude/logs/`

## Quick Start Commands

```bash
# 1. Create personal access token at https://supabase.com/dashboard/account/tokens

# 2. Add to Claude Code (user scope, read-only)
claude mcp add supabase -s user \
  -e SUPABASE_ACCESS_TOKEN=your_token \
  npx -y @supabase/mcp-server-supabase@latest \
  --read-only \
  --project-ref=sxlogxqzmarhqsblxmtj

# 3. Restart Claude Code

# 4. Verify with /mcp command
```

## Next Steps

1. Set up the MCP server using one of the methods above
2. Test with read-only access first
3. Gradually enable write permissions as needed
4. Document project-specific configurations

Remember to keep your tokens secure and rotate them periodically!