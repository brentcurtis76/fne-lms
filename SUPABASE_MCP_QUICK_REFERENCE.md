# Supabase MCP Quick Reference

## ✅ Setup Complete!

Your Supabase MCP server is now configured with:
- **Scope**: User (available in all projects)
- **Mode**: Full read/write access
- **Project**: FNE LMS (sxlogxqzmarhqsblxmtj)
- **Token**: sbp_339...de3f (stored securely)

## 🚀 Next Steps

1. **Restart Claude Code** for changes to take effect
2. **Verify connection** with `/mcp` command
3. **Test with a query** like "Show me all tables in my Supabase database"

## 📝 Common Commands

Once restarted, you can ask me to:
- List all tables in the database
- Show table schemas
- Query data (SELECT statements)
- Create/modify tables and schemas
- Insert, update, or delete data
- Manage indexes and constraints
- Execute migrations
- Manage RLS policies
- Create database functions
- Anything you can do in Supabase!

## 🔧 Modifications

### Enable Write Access (When Ready)
```bash
# Remove current server
claude mcp remove supabase

# Add with write access
claude mcp add supabase -s user \
  -e SUPABASE_ACCESS_TOKEN=sbp_3391ef366566917063e20745f0b44f3b5c78de3f \
  -- npx -y @supabase/mcp-server-supabase@latest \
  --project-ref=sxlogxqzmarhqsblxmtj
```

### Switch Projects
To use with a different Supabase project, update the project-ref:
```bash
claude mcp remove supabase
claude mcp add supabase -s user \
  -e SUPABASE_ACCESS_TOKEN=sbp_3391ef366566917063e20745f0b44f3b5c78de3f \
  -- npx -y @supabase/mcp-server-supabase@latest \
  --project-ref=YOUR_OTHER_PROJECT_REF
```

## 🔐 Security Notes

- Your token is stored in your user configuration (not in project files)
- Full read/write access enabled
- Token is scoped to your Supabase account
- Never share this token or commit it to version control

## 🛠 Troubleshooting

If MCP doesn't appear after restart:
1. Check with `claude mcp list`
2. Try `claude mcp status`
3. Ensure you have Node.js installed: `node --version`
4. Check logs: `~/Library/Logs/Claude/` (macOS)

## 📊 Current Database Status

Based on our earlier check:
- Instagram feed tables: ✅ Created and functional
- Posts in database: 1 (image post from June 2025)
- Storage bucket: ✅ post-media configured
- RLS policies: ✅ Working correctly

---
*Configuration completed on: January 23, 2025*