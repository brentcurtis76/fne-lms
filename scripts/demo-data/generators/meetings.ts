/**
 * Meetings Generator
 * Creates demo meetings with agreements, commitments, tasks, and attendees
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';
import { MEETING_TEMPLATES } from '../content/spanish-content';
import type { DemoProfile } from './users';

export interface DemoMeetingData {
  meetings: Array<{
    id: string;
    title: string;
    status: string;
    agreementsCount: number;
    commitmentsCount: number;
    tasksCount: number;
    attendeesCount: number;
  }>;
}

export async function createDemoMeetings(
  supabase: SupabaseClient,
  workspaceId: string,
  users: { teachers: DemoProfile[]; leaders: DemoProfile[] }
): Promise<DemoMeetingData> {
  console.log('  Creating demo meetings...');

  const meetings: DemoMeetingData['meetings'] = [];

  // Calculate dates: spread meetings over past 3 months
  const now = new Date();
  const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  for (let i = 0; i < MEETING_TEMPLATES.length; i++) {
    const template = MEETING_TEMPLATES[i];

    // Calculate meeting date based on status
    let meetingDate: Date;
    if (template.status === 'programada') {
      // Future meeting
      meetingDate = faker.date.soon({ days: 14, refDate: now });
    } else if (template.status === 'en_progreso') {
      // Recent/current meeting
      meetingDate = faker.date.recent({ days: 3, refDate: now });
    } else {
      // Past completed meeting
      const dayOffset = Math.floor((i / MEETING_TEMPLATES.length) * 80);
      meetingDate = new Date(threeMonthsAgo.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    }

    // Select facilitator and secretary
    const facilitator = users.leaders[i % users.leaders.length] || users.teachers[0];
    const secretary = users.teachers[(i + 1) % users.teachers.length];

    // Create meeting
    const { data: meeting, error: meetingError } = await supabase
      .from('community_meetings')
      .insert({
        workspace_id: workspaceId,
        title: template.title,
        description: template.description,
        meeting_date: meetingDate.toISOString(),
        duration_minutes: 90,
        location: 'Sala de Profesores',
        status: template.status,
        summary: template.summary,
        notes: `Reunion realizada segun agenda planificada.`,
        created_by: facilitator.id,
        facilitator_id: facilitator.id,
        secretary_id: secretary.id,
        is_active: true
      })
      .select()
      .single();

    if (meetingError) {
      console.error(`Failed to create meeting: ${meetingError.message}`);
      continue;
    }

    // Create agreements
    let agreementsCreated = 0;
    for (let j = 0; j < template.agreements.length; j++) {
      const { error: agreementError } = await supabase
        .from('meeting_agreements')
        .insert({
          meeting_id: meeting.id,
          agreement_text: template.agreements[j],
          order_index: j,
          category: 'pedagogia'
        });

      if (!agreementError) agreementsCreated++;
    }

    // Create commitments
    let commitmentsCreated = 0;
    for (let j = 0; j < template.commitments.length; j++) {
      const commitment = template.commitments[j];
      const assignee = users.teachers[(i + j) % users.teachers.length];
      const dueDate = new Date(meetingDate.getTime() + (14 + j * 7) * 24 * 60 * 60 * 1000);
      const progress = faker.number.int({ min: commitment.progressMin, max: commitment.progressMax });

      const { error: commitmentError } = await supabase
        .from('meeting_commitments')
        .insert({
          meeting_id: meeting.id,
          commitment_text: commitment.text,
          assigned_to: assignee.id,
          due_date: dueDate.toISOString(),
          status: commitment.status,
          progress_percentage: progress,
          notes: progress === 100 ? 'Completado satisfactoriamente' : null
        });

      if (!commitmentError) commitmentsCreated++;
    }

    // Create tasks
    let tasksCreated = 0;
    for (let j = 0; j < template.tasks.length; j++) {
      const task = template.tasks[j];
      const assignee = users.teachers[(i + j + 2) % users.teachers.length];
      const dueDate = new Date(meetingDate.getTime() + (7 + j * 5) * 24 * 60 * 60 * 1000);

      let progress = 0;
      if (task.status === 'completado') progress = 100;
      else if (task.status === 'en_progreso') progress = faker.number.int({ min: 20, max: 80 });

      const { error: taskError } = await supabase
        .from('meeting_tasks')
        .insert({
          meeting_id: meeting.id,
          task_title: task.title,
          task_description: task.description,
          assigned_to: assignee.id,
          due_date: dueDate.toISOString(),
          priority: task.priority,
          status: task.status,
          category: task.category,
          progress_percentage: progress,
          estimated_hours: faker.number.int({ min: 2, max: 8 })
        });

      if (!taskError) tasksCreated++;
    }

    // Create attendees
    let attendeesCreated = 0;
    const attendeeCount = faker.number.int({ min: 6, max: Math.min(10, users.teachers.length) });
    const selectedAttendees = faker.helpers.arrayElements(users.teachers, attendeeCount);

    // Add facilitator and secretary as attendees if not already included
    const allAttendeeIds = new Set(selectedAttendees.map(a => a.id));
    allAttendeeIds.add(facilitator.id);
    allAttendeeIds.add(secretary.id);

    for (const attendeeId of allAttendeeIds) {
      let role: 'facilitator' | 'secretary' | 'participant' = 'participant';
      if (attendeeId === facilitator.id) role = 'facilitator';
      else if (attendeeId === secretary.id) role = 'secretary';

      const attendanceStatus = template.status === 'programada' ? 'confirmed' : 'attended';

      const { error: attendeeError } = await supabase
        .from('meeting_attendees')
        .insert({
          meeting_id: meeting.id,
          user_id: attendeeId,
          attendance_status: attendanceStatus,
          role: role
        });

      if (!attendeeError) attendeesCreated++;
    }

    meetings.push({
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      agreementsCount: agreementsCreated,
      commitmentsCount: commitmentsCreated,
      tasksCount: tasksCreated,
      attendeesCount: attendeesCreated
    });

    console.log(`    Meeting "${meeting.title.substring(0, 40)}..." - ${agreementsCreated} agreements, ${commitmentsCreated} commitments, ${tasksCreated} tasks`);
  }

  return { meetings };
}
