import request from 'supertest';
import { createServer } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import supervisorsHandler from '../../../pages/api/admin/networks/[id]/supervisors';
import {
  createTestSupabaseClient,
  createTestUsers,
  createTestNetwork,
  cleanupTestData,
  getAuthToken,
  TestUser,
} from '../../utils/testHelpers';
import { SupabaseClient } from '@supabase/supabase-js';

describe('/api/admin/networks/[id]/supervisors', () => {
  let supabase: SupabaseClient;
  let testUsers: {
    admin: TestUser;
    supervisor: TestUser;
    docente: TestUser;
  };
  let adminToken: string;
  let supervisorToken: string;
  let testNetwork: { id: string; name: string };
  let additionalSupervisor: TestUser;

  const createTestServer = (networkId: string) => {
    return createServer((req, res) => {
      req.url = `/api/admin/networks/${networkId}/supervisors`;
      req.query = { id: networkId };
      
      return apiResolver(
        req,
        res,
        { id: networkId },
        supervisorsHandler,
        {
          previewModeEncryptionKey: '',
          previewModeId: '',
          previewModeSigningKey: '',
        },
        false
      );
    });
  };

  beforeAll(async () => {
    supabase = createTestSupabaseClient();
    testUsers = await createTestUsers(supabase);
    adminToken = await getAuthToken(supabase, testUsers.admin.email, testUsers.admin.password);
    supervisorToken = await getAuthToken(supabase, testUsers.supervisor.email, testUsers.supervisor.password);

    // Create an additional supervisor for testing
    additionalSupervisor = {
      id: '',
      email: `supervisor2-${Date.now()}@test.com`,
      password: 'TestPass123!',
      role: 'supervisor_de_red',
      profile: {
        first_name: 'Test',
        last_name: 'Supervisor2',
      },
    };

    const { data: authData } = await supabase.auth.admin.createUser({
      email: additionalSupervisor.email,
      password: additionalSupervisor.password,
      email_confirm: true,
    });

    additionalSupervisor.id = authData.user!.id;

    await supabase.from('profiles').insert({
      id: additionalSupervisor.id,
      email: additionalSupervisor.email,
      first_name: additionalSupervisor.profile!.first_name,
      last_name: additionalSupervisor.profile!.last_name,
    });

    await supabase.from('user_roles').insert({
      user_id: additionalSupervisor.id,
      role_type: 'supervisor_de_red',
      is_active: true,
    });
  });

  beforeEach(async () => {
    testNetwork = await createTestNetwork(supabase, testUsers.admin.id);
  });

  afterEach(async () => {
    await supabase
      .from('redes_de_colegios')
      .delete()
      .eq('id', testNetwork.id);
  });

  afterAll(async () => {
    await cleanupTestData(supabase);
  });

  describe('POST /api/admin/networks/[id]/supervisors', () => {
    it('should assign supervisor to network successfully', async () => {
      const server = createTestServer(testNetwork.id);
      
      const response = await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/supervisors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUsers.supervisor.id,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Supervisor asignado exitosamente',
      });

      // Verify supervisor was assigned
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('red_id')
        .eq('user_id', testUsers.supervisor.id)
        .eq('role_type', 'supervisor_de_red')
        .single();

      expect(userRole.red_id).toBe(testNetwork.id);
      
      server.close();
    });

    it('should reassign supervisor from another network', async () => {
      const server = createTestServer(testNetwork.id);
      const otherNetwork = await createTestNetwork(supabase, testUsers.admin.id, 'Other Network');
      
      // Assign to first network
      await supabase
        .from('user_roles')
        .update({ red_id: otherNetwork.id })
        .eq('user_id', testUsers.supervisor.id)
        .eq('role_type', 'supervisor_de_red');

      // Reassign to new network
      const response = await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/supervisors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUsers.supervisor.id,
        })
        .expect(200);

      expect(response.body.previousNetwork).toBeTruthy();
      expect(response.body.message).toContain('reasignado');
      
      server.close();
    });

    it('should return 404 for non-existent user', async () => {
      const server = createTestServer(testNetwork.id);
      
      await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/supervisors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
      
      server.close();
    });

    it('should return 400 for non-supervisor user', async () => {
      const server = createTestServer(testNetwork.id);
      
      const response = await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/supervisors`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUsers.docente.id,
        })
        .expect(400);

      expect(response.body.error).toContain('no tiene rol de supervisor');
      
      server.close();
    });
  });

  describe('DELETE /api/admin/networks/[id]/supervisors', () => {
    beforeEach(async () => {
      // Assign supervisor for deletion tests
      await supabase
        .from('user_roles')
        .update({ red_id: testNetwork.id })
        .eq('user_id', testUsers.supervisor.id)
        .eq('role_type', 'supervisor_de_red');
    });

    it('should remove supervisor from network successfully', async () => {
      const server = createTestServer(testNetwork.id);
      
      const response = await request(server)
        .delete(`/api/admin/networks/${testNetwork.id}/supervisors?user_id=${testUsers.supervisor.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Supervisor removido de la red exitosamente',
      });

      // Verify supervisor was removed
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('red_id')
        .eq('user_id', testUsers.supervisor.id)
        .eq('role_type', 'supervisor_de_red')
        .single();

      expect(userRole.red_id).toBeNull();
      
      server.close();
    });

    it('should return 404 when supervisor not assigned to network', async () => {
      const server = createTestServer(testNetwork.id);
      
      await request(server)
        .delete(`/api/admin/networks/${testNetwork.id}/supervisors?user_id=${additionalSupervisor.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      
      server.close();
    });

    it('should return 403 for non-admin users', async () => {
      const server = createTestServer(testNetwork.id);
      
      await request(server)
        .delete(`/api/admin/networks/${testNetwork.id}/supervisors?user_id=${testUsers.supervisor.id}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(403);
      
      server.close();
    });
  });
});