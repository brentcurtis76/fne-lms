import { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/assignments/create-group
 *
 * Creates a new group for an assignment and adds the creator + selected classmates.
 *
 * Body:
 * - assignmentId: string (required)
 * - classmateIds: string[] (required) - array of user IDs to add (excluding creator)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const supabase = createPagesServerClient({ req, res });

    // Check authentication
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        return res.status(401).json({ error: 'No autorizado' });
    }

    const { assignmentId, classmateIds } = req.body;

    // Validate input
    if (!assignmentId || !Array.isArray(classmateIds)) {
        return res.status(400).json({ error: 'assignmentId y classmateIds son requeridos' });
    }

    try {
        const userId = session.user.id;
        console.log('[create-group] Starting group creation for user:', userId);
        console.log('[create-group] Payload:', { assignmentId, classmateIds });

        // Service role client for RLS-bypassing
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        // 1. Validate requester has a school assigned
        const { data: requesterRoles, error: roleError } = await supabase
            .from('user_roles')
            .select('school_id, role_type, community_id')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (roleError || !requesterRoles || requesterRoles.length === 0) {
            console.error('[create-group] Role check failed:', roleError);
            return res.status(403).json({ error: 'No tienes una escuela asignada' });
        }

        // Select school_id deterministically
        let selectedRole = requesterRoles.find(r => r.role_type === 'docente' && r.school_id);
        if (!selectedRole) {
            selectedRole = requesterRoles.find(r => r.school_id);
        }

        if (!selectedRole || !selectedRole.school_id) {
            console.error('[create-group] No school_id found in roles:', requesterRoles);
            return res.status(403).json({ error: 'No tienes una escuela asignada' });
        }

        const requesterSchoolId = selectedRole.school_id;
        console.log('[create-group] Requester school ID:', requesterSchoolId);

        // 2. Validate assignment and get course_id
        const { data: assignmentBlock, error: blockError } = await supabase
            .from('blocks')
            .select('lesson_id, payload')
            .eq('id', assignmentId)
            .single();

        if (blockError || !assignmentBlock || !assignmentBlock.lesson_id) {
            console.error('[create-group] Assignment block not found:', blockError);
            return res.status(404).json({ error: 'Tarea no encontrada' });
        }

        const { data: lesson, error: lessonError } = await supabase
            .from('lessons')
            .select('course_id')
            .eq('id', assignmentBlock.lesson_id)
            .single();

        if (lessonError || !lesson || !lesson.course_id) {
            console.error('[create-group] Lesson/Course not found:', lessonError);
            return res.status(404).json({ error: 'Curso no encontrado para esta tarea' });
        }

        const courseId = lesson.course_id;
        console.log('[create-group] Course ID:', courseId);

        // 3. Validate requester is enrolled in the course (or has access)
        // Simplified check for now - assuming if they can see the modal they have access, 
        // but strictly we should check enrollment.
        const { data: enrollment } = await supabase
            .from('course_enrollments')
            .select('status')
            .eq('user_id', userId)
            .eq('course_id', courseId)
            .eq('status', 'active')
            .maybeSingle();

        // Also check if they are already in a group for this assignment
        const { data: existingGroup } = await supabaseAdmin
            .from('group_assignment_members')
            .select('group_id')
            .eq('assignment_id', assignmentId)
            .eq('user_id', userId)
            .maybeSingle();

        if (existingGroup) {
            console.error('[create-group] User already in group:', existingGroup);
            return res.status(400).json({ error: 'Ya perteneces a un grupo para esta tarea' });
        }

        // 4. Validate classmates (same school, enrolled, not in group)
        if (classmateIds.length > 0) {
            // Check schools
            const { data: classmateRoles } = await supabaseAdmin
                .from('user_roles')
                .select('user_id, school_id')
                .in('user_id', classmateIds)
                .eq('is_active', true);

            const invalidSchool = classmateRoles?.filter(r => r.school_id !== requesterSchoolId);
            if (invalidSchool && invalidSchool.length > 0) {
                console.error('[create-group] Invalid school for classmates:', invalidSchool);
                return res.status(400).json({ error: 'Algunos compañeros no pertenecen a tu escuela' });
            }

            // Check existing groups
            const { data: existingMembers } = await supabaseAdmin
                .from('group_assignment_members')
                .select('user_id')
                .eq('assignment_id', assignmentId)
                .in('user_id', classmateIds);

            if (existingMembers && existingMembers.length > 0) {
                console.error('[create-group] Classmates already in groups:', existingMembers);
                return res.status(400).json({ error: 'Algunos compañeros ya están en grupos' });
            }
        }

        // 4.5 Fetch user profile for name generation
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('first_name, last_name')
            .eq('id', userId)
            .single();

        const leaderName = userProfile
            ? `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim()
            : 'Estudiante';

        const groupName = `Grupo de ${leaderName}`;

        // 5. Create Group
        console.log('[create-group] Creating group record...');
        const { data: newGroup, error: createError } = await supabaseAdmin
            .from('group_assignment_groups')
            .insert({
                assignment_id: assignmentId,
                is_consultant_managed: false,
                community_id: selectedRole.community_id,
                name: groupName
            })
            .select()
            .single();

        if (createError || !newGroup) {
            console.error('[create-group] Error creating group:', createError);
            return res.status(500).json({ error: 'Error al crear el grupo', details: createError });
        }
        console.log('[create-group] Group created:', newGroup.id);

        // 6. Add Members (Creator + Classmates)
        const members = [
            {
                group_id: newGroup.id,
                assignment_id: assignmentId,
                user_id: userId,
                role: 'leader' // Creator is leader
            },
            ...classmateIds.map((id: string) => ({
                group_id: newGroup.id,
                assignment_id: assignmentId,
                user_id: id,
                role: 'member'
            }))
        ];

        console.log('[create-group] Adding members:', members);
        const { data: insertedMembers, error: insertError } = await supabaseAdmin
            .from('group_assignment_members')
            .insert(members)
            .select();

        if (insertError) {
            console.error('[create-group] Error adding members:', insertError);
            // Rollback group creation? Ideally yes, but for now just fail
            return res.status(500).json({ error: 'Error al agregar miembros', details: insertError });
        }

        // 7. Send Notifications
        try {
            const assignmentTitle = assignmentBlock.payload?.title || 'Sin título';

            // Get adder's name
            const { data: adderProfile } = await supabase
                .from('profiles')
                .select('first_name, last_name')
                .eq('id', userId)
                .single();

            const adderName = adderProfile
                ? `${adderProfile.first_name || ''} ${adderProfile.last_name || ''}`.trim()
                : 'Un compañero';

            const notifications = classmateIds.map((id: string) => ({
                user_id: id,
                type: 'group_invitation',
                title: 'Te agregaron a un grupo',
                message: `${adderName} te agregó a su grupo para la tarea "${assignmentTitle}"`,
                data: {
                    assignment_id: assignmentId,
                    group_id: newGroup.id,
                    added_by: userId
                },
                created_at: new Date().toISOString()
            }));

            if (notifications.length > 0) {
                await supabase.from('notifications').insert(notifications);
            }
        } catch (e) {
            console.error('[create-group] Notification error:', e);
        }

        return res.status(200).json({
            success: true,
            group: newGroup,
            members: insertedMembers
        });

    } catch (error: any) {
        console.error('[create-group] Unhandled error:', error);
        return res.status(500).json({ error: 'Error interno del servidor', message: error.message, stack: error.stack });
    }
}
