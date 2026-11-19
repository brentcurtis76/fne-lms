import { SessionStatus } from '../../lib/types/consultor-sessions.types';

export interface SessionListItem {
  id: string;
  title: string;
  session_date: string;
  start_time: string;
  end_time: string;
  modality: string;
  status: SessionStatus;
  school_id: number;
  schools: { name: string } | null;
  growth_communities: { name: string } | null;
  session_facilitators: { user_id: string }[];
  recurrence_group_id: string | null;
  session_number: number | null;
}
