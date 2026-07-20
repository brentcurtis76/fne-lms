# Growth Community Member Visibility Root Cause Report

Date: 2026-06-04

## Executive summary

User `voro@colegiosantamartacoquimbo.cl` is correctly assigned as `lider_comunidad` for growth community `d75e23ca-621c-4b06-84df-2c61fb779dfb` ("Comunidad Vania Macarena Oro Jofre"). That community has 14 active unique members in `user_roles`.

The community workspace overview does not render those 14 members because it loads member profiles directly from the browser with a Supabase embedded join:

`growth_communities -> user_roles -> profiles`

When authenticated as Vania, Supabase returns all 14 `user_roles` membership rows, but the embedded `profiles` object is `null` for the 13 other users because profile visibility is RLS-limited. The React reducer then drops every row whose embedded profile is null:

```ts
const userId = member.user?.id;
if (!userId) return acc;
```

That leaves only Vania's own row visible. This explains the reported symptom and is expected to affect other non-admin/non-service browser member-list paths that use the same `user_roles -> profiles` direct join.

Confidence: >98%. The diagnosis is based on live production data, an authenticated read-only reproduction as the affected user, and the exact frontend code path that transforms the query result.

## Reported problem

Vania Macarena Oro Jofre (`voro@colegiosantamartacoquimbo.cl`) reports that she cannot see any other members of her growth community. She is a `Lider de Comunidad`, and admins can confirm that other users are assigned to her growth community. The same pattern is suspected across groups.

## Affected user and data state

Live profile row found:

```json
{
  "id": "9231cc75-2a4d-4ae2-8996-2dccaca6e37e",
  "email": "voro@colegiosantamartacoquimbo.cl",
  "first_name": "Vania Macarena",
  "last_name": "Oro Jofre",
  "school_id": 7,
  "generation_id": null,
  "community_id": null,
  "approval_status": "approved"
}
```

Active role row:

```json
{
  "id": "2c973f5b-07fd-4750-bd07-814a789c339d",
  "user_id": "9231cc75-2a4d-4ae2-8996-2dccaca6e37e",
  "role_type": "lider_comunidad",
  "school_id": 7,
  "generation_id": null,
  "community_id": "d75e23ca-621c-4b06-84df-2c61fb779dfb",
  "is_active": true
}
```

Service-role count for community `d75e23ca-621c-4b06-84df-2c61fb779dfb`:

```json
{
  "active_role_rows_service": 14,
  "unique_user_ids_service": 14,
  "community_name": "Comunidad Vania Macarena Oro Jofre",
  "school_name": "Santa Marta de Coquimbo"
}
```

This proves the data assignment exists and is not the root problem.

## Code path that causes the bug

The visible member panel in the workspace overview is rendered from `communityMembers.length` in `pages/community/workspace.tsx`.

Relevant code:

- `pages/community/workspace.tsx:158-231` loads members when `currentWorkspace` changes.
- `pages/community/workspace.tsx:168-186` performs a browser-side Supabase join from `growth_communities` to `user_roles` to `profiles`.
- `pages/community/workspace.tsx:195-197` discards each membership row when `member.user` is null.
- `pages/community/workspace.tsx:586-589` displays the resulting `communityMembers.length`.

The critical reducer logic:

```ts
const membersList = (members?.members || []).reduce((acc: any[], member: any) => {
  const userId = member.user?.id;
  if (!userId) return acc;
  // ...
}, []);
```

Because RLS hides other users' `profiles` rows from Vania's browser session, `member.user` is null for other community members, so those members are silently filtered out.

## Live reproduction as the affected user

I generated an authenticated Supabase session for `voro@colegiosantamartacoquimbo.cl` using the service-role admin magic-link flow, then ran the same browser-side query used by `pages/community/workspace.tsx`. No access or refresh tokens were printed or stored in the report.

Observed result:

```json
{
  "auth_user_id": "9231cc75-2a4d-4ae2-8996-2dccaca6e37e",
  "community_id": "d75e23ca-621c-4b06-84df-2c61fb779dfb",
  "active_role_rows_service": 14,
  "unique_user_ids_service": 14,
  "profiles_visible_to_user_count": 1,
  "profiles_visible_to_service_count": 14,
  "profiles_visible_to_user_emails": [
    "voro@colegiosantamartacoquimbo.cl"
  ],
  "browser_page_query_member_rows": 14,
  "browser_page_query_non_null_profiles": 1,
  "browser_page_query_null_profiles": 13,
  "browser_reducer_visible_member_count": 1,
  "service_page_query_member_rows": 14,
  "service_page_query_non_null_profiles": 14
}
```

Interpretation:

1. The affected user's browser session can see all 14 `user_roles` rows for the community.
2. The same session can see only 1 of the 14 `profiles` rows: her own.
3. The exact workspace query returns 14 member rows, but 13 have `user: null`.
4. The workspace reducer drops those 13 rows.
5. The same query with service role returns non-null profiles for all 14 rows.

That combination isolates the root cause to profile RLS interacting with the browser-side embedded profile join, not to missing community assignments.

## Why this is likely cross-group

This is not specific to Vania's data. The same failure occurs for any non-admin browser session where:

1. The user can see community membership rows in `user_roles`.
2. The user cannot directly read other members' `profiles` rows.
3. The frontend member list requires the embedded `profiles` object to be non-null.

The workspace overview meets all three conditions. Additional code paths with the same risk:

- `pages/community/workspace.tsx:1839-1909` loads messaging mention suggestions with a direct `user_roles -> profiles` join.
- `components/assignments/CreateGroupModal.tsx:40-73` loads available group members with a direct `user_roles -> profiles` join and filters out rows without `member.user`.

By contrast, `utils/roleUtils.ts:886-897` already uses `/api/community/members`, which is the safer pattern because the server verifies membership and then uses the service role to fetch member profiles.

## Existing safe endpoint

The repo already contains a purpose-built endpoint:

`pages/api/community/members.ts`

Important details:

- `pages/api/community/members.ts:43-50` requires an authenticated session.
- `pages/api/community/members.ts:57-73` verifies the requester is an admin or belongs to the requested community.
- `pages/api/community/members.ts:76-98` fetches community role rows and profiles with the service-role client.
- `pages/api/community/members.ts:105-136` returns member objects shaped for frontend use.

This endpoint is already aligned with the needed fix: enforce access on the server, then bypass RLS only for the authorized community member list.

## Root cause

The root cause is not incorrect assignments. It is an inconsistent data access path:

The workspace overview uses a browser-side Supabase embedded join that depends on direct `profiles` table visibility, while profile RLS only exposes the current user's own profile to this user. The frontend then treats `null` embedded profiles as absent members and discards them.

This is why admins/service-role queries see the full community and Vania sees only herself in the workspace UI.

## Proposed fix

Use the existing `/api/community/members` endpoint for every UI path that needs a community member directory.

Minimum hotfix:

1. Replace the direct Supabase join in `pages/community/workspace.tsx:158-231` with:

```ts
const response = await fetch(`/api/community/members?community_id=${encodeURIComponent(currentWorkspace.community_id)}`);
const json = await response.json();
setCommunityMembers(json.members ?? []);
```

2. Preserve the current display shape. The endpoint already returns:

```ts
{
  id,
  email,
  first_name,
  last_name,
  avatar_url,
  user_roles: [{ role_type, ... }]
}
```

3. Update messaging mention suggestions in `pages/community/workspace.tsx` to reuse the same endpoint or the existing `getCommunityMembers` helper from `utils/roleUtils.ts`.

4. Update `components/assignments/CreateGroupModal.tsx` to use the same endpoint/helper before filtering out the current user and users already in a group.

Recommended hardening:

1. Deduplicate `/api/community/members` by `user_id`, merging `user_roles`, so users with multiple active rows do not appear twice.
2. Add deterministic ordering by first name, last name, and email.
3. Add a regression test for the workspace overview transform where the browser query returns 14 role rows but 13 embedded profiles are null; the old reducer renders 1, while the fixed API path renders 14.
4. Add API tests for `/api/community/members` verifying:
   - community members can fetch their own community's members;
   - members cannot fetch another community;
   - admins can fetch any community;
   - returned members include profile fields for all active community role rows.

Do not fix this by broadly relaxing `profiles` RLS unless product/security explicitly wants community members to read each other's profiles directly from the client. The safer, more localized fix is the existing server endpoint because it exposes only the authorized community directory.

## Verification plan after fix

1. Log in as `voro@colegiosantamartacoquimbo.cl`.
2. Open `/community/workspace?section=overview`.
3. Confirm "Miembros de la Comunidad" shows 14 for community `d75e23ca-621c-4b06-84df-2c61fb779dfb`.
4. Expand the member panel and confirm the 13 docente users plus Vania are visible.
5. Confirm an unrelated community id cannot be fetched from `/api/community/members`.
6. Check mention suggestions and group creation member pickers, if those flows are in scope for the patch.

## Final assessment

The evidence proves with >98% certainty that the visible bug is caused by browser-side profile RLS in the workspace member query, followed by frontend filtering of null embedded profiles. The full member data exists and is retrievable through service-role access after server-side authorization; the workspace overview simply is not using that safe path.
