#!/usr/bin/env bash
# GENERA — Claude Code PreToolUse hook (Fase 0).
# Blocks any Edit/Write/MultiEdit/Bash tool call that would introduce
# "DISABLE ROW LEVEL SECURITY" into supabase/migrations/.
# Registered in .claude/settings.json. Exit 2 = block (stderr shown to agent).
# Guardrails live in hooks + CI, not in memory-file prose (itinerario §2.2).

node -e '
let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let payload;
  try { payload = JSON.parse(raw); } catch { process.exit(0); }
  const ti = (payload && payload.tool_input) || {};
  const pattern = /disable\s+row\s+level\s+security/i;

  // Edit/Write/MultiEdit: block if target is a migration and content matches
  const filePath = ti.file_path || "";
  if (/supabase\/migrations\//.test(filePath)) {
    const text = [ti.content, ti.new_string, ...(Array.isArray(ti.edits) ? ti.edits.map(e => e.new_string) : [])]
      .filter(Boolean).join("\n");
    if (pattern.test(text)) {
      console.error("BLOQUEADO (GENERA hard rule): esta migración deshabilita ROW LEVEL SECURITY. Toda tabla de public mantiene RLS. Ver CLAUDE.md / PROJECT_STATE.md. Si crees que hay una excepción legítima, pídesela explícitamente a Brent.");
      process.exit(2);
    }
  }

  // Bash: block commands that write that pattern into migrations
  const cmd = ti.command || "";
  if (/supabase\/migrations/.test(cmd) && pattern.test(cmd)) {
    console.error("BLOQUEADO (GENERA hard rule): el comando escribiría DISABLE ROW LEVEL SECURITY en una migración. Ver CLAUDE.md.");
    process.exit(2);
  }

  process.exit(0);
});
'
