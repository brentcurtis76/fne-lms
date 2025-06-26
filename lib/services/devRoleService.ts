/**
 * Dev Role Service for FNE LMS
 * Manages role impersonation for developers
 */

import { supabase } from '../supabase';
import { 
  UserRoleType, 
  DevRoleSession,
  DevAuditLog,
  UserProfile,
  School,
  Generation,
  GrowthCommunity
} from '../../types/roles';

const SESSION_KEY = 'fne-dev-impersonation';
const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours in milliseconds

export interface ImpersonationContext {
  role: UserRoleType;
  userId?: string;
  schoolId?: string;
  generationId?: string;
  communityId?: string;
  sessionToken?: string;
  expiresAt?: string;
}

class DevRoleService {
  /**
   * Check if current user is a developer
   */
  async isDevUser(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('dev_users')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

      return !error && !!data;
    } catch (error) {
      console.error('Error checking dev status:', error);
      return false;
    }
  }

  /**
   * Get active impersonation session from database
   */
  async getActiveImpersonation(userId: string): Promise<DevRoleSession | null> {
    try {
      const { data, error } = await supabase
        .from('dev_role_sessions')
        .select('*')
        .eq('dev_user_id', userId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString())
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return null;

      // Also check localStorage for consistency
      const localSession = this.getLocalImpersonation();
      if (localSession && localSession.sessionToken !== data.session_token) {
        // Local storage out of sync, clear it
        this.clearLocalImpersonation();
      }

      return data;
    } catch (error) {
      console.error('Error getting active impersonation:', error);
      return null;
    }
  }

  /**
   * Start impersonating a role
   */
  async startImpersonation(
    userId: string,
    context: ImpersonationContext
  ): Promise<{ success: boolean; error?: string; sessionToken?: string }> {
    try {
      // Verify user is a dev
      const isDev = await this.isDevUser(userId);
      if (!isDev) {
        return { success: false, error: 'No tienes permisos de desarrollador' };
      }

      // Get user agent and IP (IP will be handled server-side)
      const userAgent = navigator.userAgent;

      // Call the database function to start impersonation
      const { data, error } = await supabase.rpc('start_dev_impersonation', {
        p_dev_user_id: userId,
        p_impersonated_role: context.role,
        p_impersonated_user_id: context.userId || null,
        p_school_id: context.schoolId || null,
        p_generation_id: context.generationId || null,
        p_community_id: context.communityId || null,
        p_user_agent: userAgent
      });

      if (error) {
        console.error('Error starting impersonation:', error);
        return { success: false, error: error.message };
      }

      const sessionToken = data;

      // Store in localStorage for persistence
      const sessionData: ImpersonationContext = {
        ...context,
        sessionToken,
        expiresAt: new Date(Date.now() + SESSION_DURATION).toISOString()
      };
      this.setLocalImpersonation(sessionData);

      // Emit event for UI updates
      window.dispatchEvent(new CustomEvent('dev-impersonation-changed', { 
        detail: sessionData 
      }));

      // Add a small delay before allowing navigation to ensure localStorage is updated
      await new Promise(resolve => setTimeout(resolve, 100));

      return { success: true, sessionToken };
    } catch (error) {
      console.error('Error in startImpersonation:', error);
      return { success: false, error: 'Error al iniciar la suplantación' };
    }
  }

  /**
   * End current impersonation
   */
  async endImpersonation(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const userAgent = navigator.userAgent;

      const { error } = await supabase.rpc('end_dev_impersonation', {
        p_dev_user_id: userId,
        p_user_agent: userAgent
      });

      if (error) {
        console.error('Error ending impersonation:', error);
        return { success: false, error: error.message };
      }

      // Clear localStorage
      this.clearLocalImpersonation();

      // Emit event for UI updates
      window.dispatchEvent(new CustomEvent('dev-impersonation-changed', { 
        detail: null 
      }));

      return { success: true };
    } catch (error) {
      console.error('Error in endImpersonation:', error);
      return { success: false, error: 'Error al terminar la suplantación' };
    }
  }

  /**
   * Get effective role considering impersonation
   */
  async getEffectiveRole(userId: string): Promise<UserRoleType | null> {
    try {
      const { data, error } = await supabase.rpc('get_effective_user_role', {
        user_uuid: userId
      });

      if (error) {
        console.error('Error getting effective role:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error in getEffectiveRole:', error);
      return null;
    }
  }

  /**
   * Get list of available roles to impersonate
   */
  getAvailableRoles(): Array<{ value: UserRoleType; label: string; description: string }> {
    return [
      { 
        value: 'admin', 
        label: 'Administrador Global', 
        description: 'Control total de la plataforma' 
      },
      { 
        value: 'consultor', 
        label: 'Consultor FNE', 
        description: 'Instructor asignado a colegios' 
      },
      { 
        value: 'equipo_directivo', 
        label: 'Equipo Directivo', 
        description: 'Administración escolar' 
      },
      { 
        value: 'lider_generacion', 
        label: 'Líder de Generación', 
        description: 'Líder Tractor/Innova' 
      },
      { 
        value: 'lider_comunidad', 
        label: 'Líder de Comunidad', 
        description: 'Líder de comunidad de crecimiento' 
      },
      { 
        value: 'docente', 
        label: 'Docente', 
        description: 'Participante regular' 
      }
    ];
  }

  /**
   * Get available schools for context
   */
  async getAvailableSchools(): Promise<School[]> {
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('*')
        .order('name');

      if (error) {
        console.error('Error fetching schools:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAvailableSchools:', error);
      return [];
    }
  }

  /**
   * Get available generations for a school
   */
  async getAvailableGenerations(schoolId: string): Promise<Generation[]> {
    try {
      const { data, error } = await supabase
        .from('generations')
        .select('*')
        .eq('school_id', schoolId)
        .order('name');

      if (error) {
        console.error('Error fetching generations:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAvailableGenerations:', error);
      return [];
    }
  }

  /**
   * Get available communities for a school/generation
   */
  async getAvailableCommunities(
    schoolId?: string, 
    generationId?: string
  ): Promise<GrowthCommunity[]> {
    try {
      let query = supabase.from('growth_communities').select('*');

      if (schoolId) {
        query = query.eq('school_id', schoolId);
      }
      if (generationId) {
        query = query.eq('generation_id', generationId);
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('Error fetching communities:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAvailableCommunities:', error);
      return [];
    }
  }

  /**
   * Get dev audit log
   */
  async getAuditLog(userId: string, limit: number = 50): Promise<DevAuditLog[]> {
    try {
      const { data, error } = await supabase
        .from('dev_audit_log')
        .select('*')
        .eq('dev_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching audit log:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getAuditLog:', error);
      return [];
    }
  }

  /**
   * Get sample users for a given role
   */
  async getSampleUsers(roleType: UserRoleType, limit: number = 5): Promise<UserProfile[]> {
    try {
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role_type', roleType)
        .eq('is_active', true)
        .limit(limit);

      if (roleError || !roleData) return [];

      const userIds = roleData.map(r => r.user_id);
      
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (profileError) return [];

      return profiles || [];
    } catch (error) {
      console.error('Error getting sample users:', error);
      return [];
    }
  }

  // Local storage helpers
  private getLocalImpersonation(): ImpersonationContext | null {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (!data) return null;

      const session = JSON.parse(data);
      
      // Check if expired
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        this.clearLocalImpersonation();
        return null;
      }

      return session;
    } catch (error) {
      console.error('Error reading local impersonation:', error);
      return null;
    }
  }

  private setLocalImpersonation(session: ImpersonationContext): void {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (error) {
      console.error('Error saving local impersonation:', error);
    }
  }

  private clearLocalImpersonation(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      console.error('Error clearing local impersonation:', error);
    }
  }

  /**
   * Initialize service and check for expired sessions
   */
  async initialize(userId: string): Promise<void> {
    // Check for active session in database
    const activeSession = await this.getActiveImpersonation(userId);
    
    if (activeSession) {
      // Sync with localStorage
      this.setLocalImpersonation({
        role: activeSession.impersonated_role,
        userId: activeSession.impersonated_user_id,
        schoolId: activeSession.school_id ? String(activeSession.school_id) : undefined,
        generationId: activeSession.generation_id,
        communityId: activeSession.community_id,
        sessionToken: activeSession.session_token,
        expiresAt: activeSession.expires_at
      });
    } else {
      // No active session, clear localStorage
      this.clearLocalImpersonation();
    }
  }
}

// Export singleton instance
export const devRoleService = new DevRoleService();