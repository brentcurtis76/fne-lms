import request from 'supertest';
import { createServer } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import schoolsHandler from '../../../pages/api/admin/networks/[id]/schools';
import {
  createTestSupabaseClient,
  createTestUsers,
  createTestNetwork,
  createTestSchool,
  cleanupTestData,
  getAuthToken,
  TestUser,
} from '../../utils/testHelpers';
import { SupabaseClient } from '@supabase/supabase-js';

describe('/api/admin/networks/[id]/schools', () => {
  let supabase: SupabaseClient;
  let testUsers: {
    admin: TestUser;
    supervisor: TestUser;
    docente: TestUser;
  };
  let adminToken: string;
  let supervisorToken: string;
  let testNetwork: { id: string; name: string };
  let testSchools: Array<{ id: number; name: string }>;

  // Create a test server for the schools endpoint
  const createTestServer = (networkId: string) => {
    return createServer((req, res) => {
      // Mock the query params
      req.url = `/api/admin/networks/${networkId}/schools`;
      req.query = { id: networkId };
      
      return apiResolver(
        req,
        res,
        { id: networkId },
        schoolsHandler,
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
  });

  beforeEach(async () => {
    // Create fresh test data for each test
    testNetwork = await createTestNetwork(supabase, testUsers.admin.id);
    testSchools = await Promise.all([
      createTestSchool(supabase, 'Test School 1'),
      createTestSchool(supabase, 'Test School 2'),
      createTestSchool(supabase, 'Test School 3'),
    ]);
  });

  afterEach(async () => {
    // Clean up test data after each test
    await supabase
      .from('redes_de_colegios')
      .delete()
      .eq('id', testNetwork.id);
  });

  afterAll(async () => {
    await cleanupTestData(supabase);
  });

  describe('POST /api/admin/networks/[id]/schools', () => {
    it('should assign schools to network successfully', async () => {
      const server = createTestServer(testNetwork.id);
      
      const response = await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/schools`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          school_ids: [testSchools[0].id, testSchools[1].id],
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('2 escuelas asignadas'),
      });

      // Verify schools were assigned in database
      const { data: assignments } = await supabase
        .from('red_escuelas')
        .select('*')
        .eq('red_id', testNetwork.id);

      expect(assignments).toHaveLength(2);
      expect(assignments.map(a => a.school_id)).toContain(testSchools[0].id);
      expect(assignments.map(a => a.school_id)).toContain(testSchools[1].id);
      
      server.close();
    });

    it('should handle empty school list', async () => {
      const server = createTestServer(testNetwork.id);
      
      const response = await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/schools`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          school_ids: [],
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'No se proporcionaron escuelas para asignar',
      });
      
      server.close();
    });

    it('should return 403 for non-admin users', async () => {
      const server = createTestServer(testNetwork.id);
      
      await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/schools`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .send({
          school_ids: [testSchools[0].id],
        })
        .expect(403);
      
      server.close();
    });

    it('should skip already assigned schools', async () => {
      const server = createTestServer(testNetwork.id);
      
      // First assignment
      await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/schools`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          school_ids: [testSchools[0].id],
        })
        .expect(200);

      // Try to assign same school again
      const response = await request(server)
        .post(`/api/admin/networks/${testNetwork.id}/schools`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          school_ids: [testSchools[0].id, testSchools[1].id],
        })
        .expect(200);

      expect(response.body.message).toContain('1 escuelas asignadas');
      expect(response.body.skipped).toBe(1);
      
      server.close();
    });
  });

  describe('DELETE /api/admin/networks/[id]/schools', () => {
    beforeEach(async () => {
      // Assign schools for deletion tests
      await supabase
        .from('red_escuelas')
        .insert([
          {
            red_id: testNetwork.id,
            school_id: testSchools[0].id,
            assigned_by: testUsers.admin.id,
          },
          {
            red_id: testNetwork.id,
            school_id: testSchools[1].id,
            assigned_by: testUsers.admin.id,
          },
        ]);
    });

    it('should remove school from network successfully', async () => {
      const server = createTestServer(testNetwork.id);
      
      const response = await request(server)
        .delete(`/api/admin/networks/${testNetwork.id}/schools?school_id=${testSchools[0].id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Escuela eliminada de la red exitosamente',
      });

      // Verify school was removed
      const { data: remaining } = await supabase
        .from('red_escuelas')
        .select('*')
        .eq('red_id', testNetwork.id);

      expect(remaining).toHaveLength(1);
      expect(remaining[0].school_id).toBe(testSchools[1].id);
      
      server.close();
    });

    it('should return 404 for non-existent assignment', async () => {
      const server = createTestServer(testNetwork.id);
      
      await request(server)
        .delete(`/api/admin/networks/${testNetwork.id}/schools?school_id=${testSchools[2].id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
      
      server.close();
    });
  });
});