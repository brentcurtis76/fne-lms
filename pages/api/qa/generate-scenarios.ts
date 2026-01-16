/**
 * Generate QA Scenarios API
 *
 * Uses codebase index and Anthropic API to generate QA test scenarios.
 * Admin-only endpoint.
 */

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GenerateRequest {
  feature_area: string;
  description?: string;
  role?: string;
  is_multi_user?: boolean; // If true, generate scenarios with actor/tab indicators
}

interface GeneratedScenario {
  name: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  is_multi_user?: boolean;
  steps: Array<{
    instruction: string;
    expected_outcome: string;
    capture_on_pass?: boolean;
    capture_on_fail?: boolean;
    actor?: string; // e.g., 'Usuario A - Pestaña 1'
    tab_indicator?: number; // 1, 2, 3
  }>;
}

// Helper function to extract complete scenarios from potentially truncated JSON
function extractCompleteScenarios(text: string): GeneratedScenario[] {
  const extracted: GeneratedScenario[] = [];

  // Find the start of the scenarios array
  const scenariosStart = text.indexOf('"scenarios"');
  if (scenariosStart === -1) return extracted;

  const arrayStart = text.indexOf('[', scenariosStart);
  if (arrayStart === -1) return extracted;

  // Find each complete scenario object
  let depth = 0;
  let scenarioStart = -1;

  for (let i = arrayStart + 1; i < text.length; i++) {
    const char = text[i];

    if (char === '{') {
      if (depth === 0) {
        scenarioStart = i;
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && scenarioStart !== -1) {
        // Found a complete scenario object
        const scenarioText = text.substring(scenarioStart, i + 1);
        try {
          const scenario = JSON.parse(scenarioText);
          if (scenario.name && scenario.steps && Array.isArray(scenario.steps)) {
            extracted.push(scenario);
          }
        } catch {
          // Skip malformed scenario
        }
        scenarioStart = -1;
      }
    }
  }

  return extracted;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authorization
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Check admin role
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role_type')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const isAdmin = roles?.some(r => r.role_type === 'admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Validate request
    const { feature_area, description, role, is_multi_user } = req.body as GenerateRequest;

    if (!feature_area) {
      return res.status(400).json({ error: 'feature_area is required' });
    }

    // Fetch codebase index entries for this feature area
    const { data: indexEntries, error: indexError } = await supabaseAdmin
      .from('codebase_index')
      .select('*')
      .eq('feature_area', feature_area);

    if (indexError) {
      console.error('Error fetching codebase index:', indexError);
      return res.status(500).json({ error: 'Error fetching codebase index' });
    }

    if (!indexEntries || indexEntries.length === 0) {
      return res.status(404).json({
        error: `No codebase index found for feature_area: ${feature_area}`,
        suggestion: 'Run the index refresh command in Claude Code to analyze this feature area.'
      });
    }

    // Check for Anthropic API key
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      return res.status(500).json({
        error: 'ANTHROPIC_API_KEY not configured',
        suggestion: 'Add ANTHROPIC_API_KEY to your environment variables.'
      });
    }

    // Build context from index entries
    const contextSections = indexEntries.map(entry => `
## Route: ${entry.route}
**File:** ${entry.file_path}
**Roles Allowed:** ${Array.isArray(entry.roles_allowed) ? entry.roles_allowed.join(', ') : entry.roles_allowed}

### Summary
${entry.component_summary}

### Key Behaviors
${JSON.stringify(entry.key_behaviors, null, 2)}

### Expected Outcomes
${JSON.stringify(entry.expected_outcomes, null, 2)}
`).join('\n\n---\n\n');

    // Build multi-user instructions if needed
    const multiUserInstructions = is_multi_user ? `

IMPORTANT - Multi-User Scenario Mode:
This scenario involves multiple users interacting simultaneously. You MUST:
1. Include "actor" and "tab_indicator" fields for each step
2. Actor format: "Usuario A - Pestaña 1", "Usuario B - Pestaña 2", etc.
3. Tab indicators: 1, 2, 3 (corresponding to different browser tabs)
4. Add preconditions explaining which user should be logged in to which tab
5. Include steps showing what each user should see after another user's action (real-time sync verification)
6. Set is_multi_user: true on the scenario

Example step for multi-user:
{
  "instruction": "Enviar un mensaje en el hilo de discusión",
  "expected_outcome": "El mensaje aparece en el hilo",
  "actor": "Usuario A - Pestaña 1",
  "tab_indicator": 1,
  "capture_on_fail": true
}
Then the next step might be:
{
  "instruction": "Verificar que el mensaje de Usuario A aparece en tiempo real",
  "expected_outcome": "El mensaje aparece sin necesidad de recargar la página",
  "actor": "Usuario B - Pestaña 2",
  "tab_indicator": 2,
  "capture_on_fail": true
}` : '';

    // Build the prompt
    const systemPrompt = `You are a QA scenario generator for a Spanish-language LMS (Learning Management System) called FNE LMS.

Your task is to generate comprehensive QA test scenarios based on the codebase analysis provided.

Rules:
1. All scenario names and descriptions must be in Spanish
2. All step instructions and expected outcomes must be in Spanish
3. Focus on user-facing functionality that can be manually tested
4. Include both happy path and error scenarios
5. Prioritize scenarios based on business impact
6. Each scenario should test ONE specific flow or feature
7. Steps should be atomic and verifiable
8. Expected outcomes should be specific and measurable
${multiUserInstructions}

Output format: Return a JSON array of scenarios with this structure:
{
  "scenarios": [
    {
      "name": "Nombre del escenario en español",
      "description": "Descripción breve del escenario",
      "priority": "critical|high|medium|low",
      ${is_multi_user ? '"is_multi_user": true,' : ''}
      "steps": [
        {
          "instruction": "Paso específico a realizar",
          "expected_outcome": "Resultado esperado verificable",
          "capture_on_pass": false,
          "capture_on_fail": true${is_multi_user ? ',\n          "actor": "Usuario A - Pestaña 1",\n          "tab_indicator": 1' : ''}
        }
      ]
    }
  ]
}

Priority guidelines:
- critical: Core functionality, authentication, data integrity
- high: Main user workflows, key features
- medium: Secondary features, edge cases
- low: Nice-to-have validations, UI polish`;

    const multiUserContext = is_multi_user ? `

MULTI-USER TESTING MODE ENABLED:
- Generate scenarios that test interactions between 2-3 users
- Include real-time sync verification steps
- Each step must specify which user (actor) and tab (tab_indicator)
- Focus on:
  * What happens when User A performs an action
  * What User B should see as a result (without page refresh)
  * Conflict scenarios (both users try same action)
  * Access control (user removed while in session)
` : '';

    const userPrompt = `Generate QA test scenarios for the following feature area: **${feature_area}**

${description ? `Additional context from admin: ${description}` : ''}
${role ? `Focus on testing as role: ${role}` : ''}
${multiUserContext}

## Codebase Analysis

${contextSections}

---

Generate 5-10 comprehensive test scenarios covering:
1. Main happy path workflows
2. Permission/authorization checks
3. Form validation and error handling
4. Edge cases and boundary conditions
5. Error recovery scenarios
${is_multi_user ? '6. Real-time synchronization between users\n7. Concurrent action handling' : ''}

Return ONLY valid JSON with the scenarios array.`;

    // Call Anthropic API
    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    console.log('[generate-scenarios] Calling Anthropic API...');
    console.log('[generate-scenarios] Feature area:', feature_area);
    console.log('[generate-scenarios] Is multi-user:', is_multi_user);
    console.log('[generate-scenarios] System prompt length:', systemPrompt.length);
    console.log('[generate-scenarios] User prompt length:', userPrompt.length);

    let message;
    try {
      message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8192,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ],
        system: systemPrompt
      });
      console.log('[generate-scenarios] Anthropic API call succeeded');
      console.log('[generate-scenarios] Stop reason:', message.stop_reason);
      console.log('[generate-scenarios] Usage:', JSON.stringify(message.usage));
    } catch (apiError: any) {
      console.error('[generate-scenarios] Anthropic API error:', apiError.message);
      console.error('[generate-scenarios] API error details:', JSON.stringify(apiError, null, 2));
      return res.status(500).json({
        error: 'Anthropic API call failed',
        details: apiError.message
      });
    }

    // Extract the response text
    if (!message.content || message.content.length === 0) {
      console.error('[generate-scenarios] Empty response from Anthropic API');
      return res.status(500).json({
        error: 'Empty response from AI',
        details: 'The API returned no content'
      });
    }

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    console.log('[generate-scenarios] Response text length:', responseText.length);
    console.log('[generate-scenarios] Response preview (first 500 chars):', responseText.substring(0, 500));
    console.log('[generate-scenarios] Response preview (last 500 chars):', responseText.substring(Math.max(0, responseText.length - 500)));

    if (!responseText || responseText.trim().length === 0) {
      console.error('[generate-scenarios] Response text is empty or whitespace only');
      return res.status(500).json({
        error: 'Empty response text from AI',
        content_type: message.content[0].type
      });
    }

    // Check if response was truncated due to max_tokens
    const wasTruncated = message.stop_reason === 'max_tokens';
    if (wasTruncated) {
      console.warn('[generate-scenarios] Response was truncated due to max_tokens limit');
    }

    // Parse JSON from response
    let scenarios: GeneratedScenario[] = [];
    try {
      // Method 1: Try to find JSON block with ```json markers
      const jsonBlockMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonBlockMatch) {
        console.log('[generate-scenarios] Found JSON block with markers');
        const parsed = JSON.parse(jsonBlockMatch[1]);
        scenarios = parsed.scenarios || [];
        console.log('[generate-scenarios] Parsed', scenarios.length, 'scenarios from JSON block');
      } else {
        // Method 2: Try to extract JSON object containing "scenarios"
        const jsonMatch = responseText.match(/\{[\s\S]*"scenarios"\s*:\s*\[[\s\S]*\]\s*\}/);
        if (jsonMatch) {
          console.log('[generate-scenarios] Found JSON via regex match');
          const parsed = JSON.parse(jsonMatch[0]);
          scenarios = parsed.scenarios || [];
          console.log('[generate-scenarios] Parsed', scenarios.length, 'scenarios from regex');
        } else {
          // Method 3: Try parsing the whole response as JSON
          console.log('[generate-scenarios] Attempting to parse entire response as JSON');
          const parsed = JSON.parse(responseText);
          scenarios = parsed.scenarios || parsed || [];
          console.log('[generate-scenarios] Parsed', scenarios.length, 'scenarios from full response');
        }
      }
    } catch (parseError: any) {
      console.error('[generate-scenarios] JSON parse error:', parseError.message);

      // If truncated, try to extract complete scenarios from partial response
      if (wasTruncated) {
        console.log('[generate-scenarios] Attempting to salvage complete scenarios from truncated response');
        scenarios = extractCompleteScenarios(responseText);
        if (scenarios.length > 0) {
          console.log('[generate-scenarios] Salvaged', scenarios.length, 'complete scenarios from truncated response');
        }
      }

      // If still no scenarios, try substring extraction
      if (scenarios.length === 0) {
        console.error('[generate-scenarios] Raw response (full):', responseText);
        try {
          const firstBrace = responseText.indexOf('{');
          const lastBrace = responseText.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            const jsonSubstring = responseText.substring(firstBrace, lastBrace + 1);
            console.log('[generate-scenarios] Trying substring extraction from', firstBrace, 'to', lastBrace);
            const parsed = JSON.parse(jsonSubstring);
            scenarios = parsed.scenarios || [];
            console.log('[generate-scenarios] Successfully parsed via substring:', scenarios.length, 'scenarios');
          } else {
            throw new Error('No valid JSON boundaries found');
          }
        } catch (fallbackError: any) {
          console.error('[generate-scenarios] Fallback parse also failed:', fallbackError.message);

          // Last resort: try salvage function even without truncation flag
          scenarios = extractCompleteScenarios(responseText);
          if (scenarios.length === 0) {
            return res.status(500).json({
              error: wasTruncated
                ? 'AI response was truncated and no complete scenarios could be extracted. Try generating fewer scenarios.'
                : 'Failed to parse AI response',
              parseError: parseError.message,
              raw_response: responseText.substring(0, 1000),
              raw_response_length: responseText.length,
              truncated: wasTruncated
            });
          }
          console.log('[generate-scenarios] Last resort salvage found', scenarios.length, 'scenarios');
        }
      }
    }

    // Return generated scenarios
    return res.status(200).json({
      success: true,
      feature_area,
      truncated: wasTruncated,
      warning: wasTruncated ? `Response was truncated. Retrieved ${scenarios.length} complete scenarios.` : undefined,
      index_entries_used: indexEntries.length,
      last_indexed: indexEntries[0]?.last_indexed,
      scenarios
    });

  } catch (error: any) {
    console.error('Generate scenarios error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
