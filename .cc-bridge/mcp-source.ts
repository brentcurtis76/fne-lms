#!/usr/bin/env node
/**
 * CC Bridge MCP Server
 *
 * Enables bidirectional communication between Cowork (browser-based Claude)
 * and Claude Code (VS Code) via file-based messaging.
 *
 * Communication files:
 * - .cc-bridge/prompt.json - Cowork writes prompts here
 * - .cc-bridge/response.json - Claude Code writes responses here
 * - .cc-bridge/status.json - Status tracking (idle, working, done, error)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";

// Constants
const BRIDGE_DIR = ".cc-bridge";
const PROMPT_FILE = "prompt.json";
const RESPONSE_FILE = "response.json";
const STATUS_FILE = "status.json";

// Status enum
enum BridgeStatus {
  IDLE = "idle",
  PROMPT_PENDING = "prompt_pending",
  WORKING = "working",
  DONE = "done",
  ERROR = "error"
}

// Interfaces
interface PromptMessage {
  id: string;
  timestamp: string;
  prompt: string;
  context?: string;
}

interface ResponseMessage {
  id: string;
  prompt_id: string;
  timestamp: string;
  response: string;
  status: "success" | "error";
  error?: string;
}

interface StatusMessage {
  status: BridgeStatus;
  current_prompt_id?: string;
  last_updated: string;
  message?: string;
}

// Zod Schemas
const SendPromptInputSchema = z.object({
  prompt: z.string()
    .min(1, "Prompt cannot be empty")
    .describe("The prompt/task to send to Claude Code"),
  context: z.string()
    .optional()
    .describe("Optional additional context for the prompt"),
  working_directory: z.string()
    .optional()
    .describe("Working directory for the bridge files (defaults to current directory)")
}).strict();

const ReadResponseInputSchema = z.object({
  prompt_id: z.string()
    .optional()
    .describe("Specific prompt ID to get response for (defaults to latest)"),
  working_directory: z.string()
    .optional()
    .describe("Working directory for the bridge files (defaults to current directory)")
}).strict();

const CheckStatusInputSchema = z.object({
  working_directory: z.string()
    .optional()
    .describe("Working directory for the bridge files (defaults to current directory)")
}).strict();

const ClearBridgeInputSchema = z.object({
  working_directory: z.string()
    .optional()
    .describe("Working directory for the bridge files (defaults to current directory)")
}).strict();

type SendPromptInput = z.infer<typeof SendPromptInputSchema>;
type ReadResponseInput = z.infer<typeof ReadResponseInputSchema>;
type CheckStatusInput = z.infer<typeof CheckStatusInputSchema>;
type ClearBridgeInput = z.infer<typeof ClearBridgeInputSchema>;

// Utility functions
function getBridgePath(workingDir: string | undefined): string {
  const baseDir = workingDir || process.cwd();
  return path.join(baseDir, BRIDGE_DIR);
}

async function ensureBridgeDir(workingDir: string | undefined): Promise<string> {
  const bridgePath = getBridgePath(workingDir);
  await fs.mkdir(bridgePath, { recursive: true });
  return bridgePath;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Create MCP server
const server = new McpServer({
  name: "cc-bridge-mcp-server",
  version: "1.0.0"
});

// Tool: Send Prompt to Claude Code
server.registerTool(
  "cc_bridge_send_prompt",
  {
    title: "Send Prompt to Claude Code",
    description: `Send a prompt/task to Claude Code in VS Code for execution.

This tool writes a prompt to a shared file that Claude Code monitors. Use this to delegate coding tasks, bug fixes, or implementation work to Claude Code.

Args:
  - prompt (string, required): The task or prompt to send to Claude Code
  - context (string, optional): Additional context or background information
  - working_directory (string, optional): Directory for bridge files (defaults to cwd)

Returns:
  - prompt_id: Unique identifier for tracking this prompt
  - status: Confirmation that prompt was sent
  - file_path: Path to the prompt file

Example usage:
  - "Implement the user authentication feature in /pages/api/auth.ts"
  - "Fix the bug in the notification service - emails are not being sent"
  - "Add TypeScript types for the new API response format"

After sending, use cc_bridge_check_status to monitor progress and cc_bridge_read_response to get the result.`,
    inputSchema: SendPromptInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false
    }
  },
  async (params: SendPromptInput) => {
    try {
      const bridgePath = await ensureBridgeDir(params.working_directory);
      const promptPath = path.join(bridgePath, PROMPT_FILE);
      const statusPath = path.join(bridgePath, STATUS_FILE);

      const promptId = generateId();
      const now = new Date().toISOString();

      // Create prompt message
      const promptMessage: PromptMessage = {
        id: promptId,
        timestamp: now,
        prompt: params.prompt,
        ...(params.context ? { context: params.context } : {})
      };

      // Update status to prompt_pending
      const statusMessage: StatusMessage = {
        status: BridgeStatus.PROMPT_PENDING,
        current_prompt_id: promptId,
        last_updated: now,
        message: "New prompt waiting for Claude Code to pick up"
      };

      await writeJsonFile(promptPath, promptMessage);
      await writeJsonFile(statusPath, statusMessage);

      const output = {
        success: true,
        prompt_id: promptId,
        message: "Prompt sent successfully. Claude Code should pick it up shortly.",
        file_path: promptPath,
        instructions_for_cc: `
=== INSTRUCTIONS FOR CLAUDE CODE ===
A prompt has been sent via the CC Bridge. To process it:

1. Read the prompt from: ${promptPath}
2. Update status to "working" in: ${path.join(bridgePath, STATUS_FILE)}
3. Execute the requested task
4. Write your response to: ${path.join(bridgePath, RESPONSE_FILE)}
5. Update status to "done"

Status file format:
{
  "status": "working" | "done" | "error",
  "current_prompt_id": "${promptId}",
  "last_updated": "<ISO timestamp>",
  "message": "<optional status message>"
}

Response file format:
{
  "id": "<response_id>",
  "prompt_id": "${promptId}",
  "timestamp": "<ISO timestamp>",
  "response": "<your full response>",
  "status": "success" | "error",
  "error": "<error message if status is error>"
}
=====================================`
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(output, null, 2)
        }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Error sending prompt: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// Tool: Read Response from Claude Code
server.registerTool(
  "cc_bridge_read_response",
  {
    title: "Read Response from Claude Code",
    description: `Read the response from Claude Code after it has processed a prompt.

This tool reads the response file to get Claude Code's output. Use after sending a prompt and confirming status is "done".

Args:
  - prompt_id (string, optional): Specific prompt ID to match (defaults to latest response)
  - working_directory (string, optional): Directory for bridge files (defaults to cwd)

Returns:
  - response: Claude Code's full response text
  - prompt_id: The prompt this responds to
  - status: success or error
  - timestamp: When the response was written

Workflow:
1. cc_bridge_send_prompt - Send the task
2. cc_bridge_check_status - Wait for "done" status
3. cc_bridge_read_response - Get the result (this tool)`,
    inputSchema: ReadResponseInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: ReadResponseInput) => {
    try {
      const bridgePath = getBridgePath(params.working_directory);
      const responsePath = path.join(bridgePath, RESPONSE_FILE);

      const response = await readJsonFile<ResponseMessage>(responsePath);

      if (!response) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              found: false,
              message: "No response file found. Claude Code may not have responded yet. Use cc_bridge_check_status to verify status."
            }, null, 2)
          }]
        };
      }

      // If specific prompt_id requested, verify it matches
      if (params.prompt_id && response.prompt_id !== params.prompt_id) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              found: false,
              message: `Response found but for different prompt (${response.prompt_id}). Expected: ${params.prompt_id}`,
              available_response_for: response.prompt_id
            }, null, 2)
          }]
        };
      }

      const output = {
        found: true,
        prompt_id: response.prompt_id,
        response_id: response.id,
        timestamp: response.timestamp,
        status: response.status,
        response: response.response,
        ...(response.error ? { error: response.error } : {})
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(output, null, 2)
        }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Error reading response: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// Tool: Check Bridge Status
server.registerTool(
  "cc_bridge_check_status",
  {
    title: "Check CC Bridge Status",
    description: `Check the current status of the Claude Code bridge.

Returns the current state: idle, prompt_pending, working, done, or error.

Args:
  - working_directory (string, optional): Directory for bridge files (defaults to cwd)

Returns:
  - status: Current bridge status
    - "idle": No active prompt
    - "prompt_pending": Prompt sent, waiting for CC to pick up
    - "working": Claude Code is processing the prompt
    - "done": Claude Code finished, response ready
    - "error": An error occurred
  - current_prompt_id: ID of the current/last prompt
  - last_updated: When status was last changed
  - message: Optional status message

Use this after cc_bridge_send_prompt to monitor progress before reading the response.`,
    inputSchema: CheckStatusInputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: CheckStatusInput) => {
    try {
      const bridgePath = getBridgePath(params.working_directory);
      const statusPath = path.join(bridgePath, STATUS_FILE);

      const status = await readJsonFile<StatusMessage>(statusPath);

      if (!status) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: BridgeStatus.IDLE,
              message: "No status file found. Bridge not initialized or no prompts sent yet.",
              bridge_path: bridgePath
            }, null, 2)
          }]
        };
      }

      const output = {
        status: status.status,
        current_prompt_id: status.current_prompt_id,
        last_updated: status.last_updated,
        message: status.message,
        bridge_path: bridgePath,
        ready_for_response: status.status === BridgeStatus.DONE
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(output, null, 2)
        }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Error checking status: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// Tool: Clear Bridge
server.registerTool(
  "cc_bridge_clear",
  {
    title: "Clear CC Bridge",
    description: `Clear all bridge files to start fresh.

This removes the prompt, response, and status files to reset the communication channel.

Args:
  - working_directory (string, optional): Directory for bridge files (defaults to cwd)

Returns:
  - success: Whether clearing was successful
  - files_removed: List of files that were removed

Use this to:
- Start a new conversation
- Clear after errors
- Reset stuck state`,
    inputSchema: ClearBridgeInputSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false
    }
  },
  async (params: ClearBridgeInput) => {
    try {
      const bridgePath = getBridgePath(params.working_directory);
      const files = [PROMPT_FILE, RESPONSE_FILE, STATUS_FILE];
      const removed: string[] = [];

      for (const file of files) {
        const filePath = path.join(bridgePath, file);
        try {
          await fs.unlink(filePath);
          removed.push(file);
        } catch {
          // File doesn't exist, that's fine
        }
      }

      // Write fresh idle status
      const statusPath = path.join(bridgePath, STATUS_FILE);
      await ensureBridgeDir(params.working_directory);
      await writeJsonFile(statusPath, {
        status: BridgeStatus.IDLE,
        last_updated: new Date().toISOString(),
        message: "Bridge cleared and ready"
      });

      const output = {
        success: true,
        files_removed: removed,
        message: "Bridge cleared. Ready for new prompts.",
        bridge_path: bridgePath
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(output, null, 2)
        }],
        structuredContent: output
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `Error clearing bridge: ${error instanceof Error ? error.message : String(error)}`
        }]
      };
    }
  }
);

// Main function
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CC Bridge MCP Server running via stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
