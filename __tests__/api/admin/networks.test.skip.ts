import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from 'http';
import { apiResolver } from 'next/dist/server/api-utils/node';
import handler from '../../../pages/api/admin/networks/index';
import {
  createTestSupabaseClient,
  createTestUsers,
  createTestNetwork,
  createTestSchool,
  assignSchoolToNetwork,
  assignSupervisorToNetwork,
  cleanupTestData,
  getAuthToken,
  TestUser,
} from '../../utils/testHelpers';
import { SupabaseClient } from '@supabase/supabase-js';

describe('/api/admin/networks', () => {
  let supabase: SupabaseClient;
  let testUsers: {
    admin: TestUser;
    supervisor: TestUser;
    docente: TestUser;
  };
  let adminToken: string;
  let supervisorToken: string;
  let docenteToken: string;

  // Create a test server
  const testServer = createServer((req, res) => {
    return apiResolver(
      req,
      res,
      undefined,
      handler,
      {
        previewModeEncryptionKey: '',
        previewModeId: '',
        previewModeSigningKey: '',
      },
      false
    );
  });

  beforeAll(async () => {
    // Initialize test database client
    supabase = createTestSupabaseClient();
    
    // Create test users
    testUsers = await createTestUsers(supabase);
    
    // Get auth tokens
    adminToken = await getAuthToken(supabase, testUsers.admin.email, testUsers.admin.password);
    supervisorToken = await getAuthToken(supabase, testUsers.supervisor.email, testUsers.supervisor.password);
    docenteToken = await getAuthToken(supabase, testUsers.docente.email, testUsers.docente.password);
  });

  afterAll(async () => {
    // Clean up all test data
    await cleanupTestData(supabase);
    testServer.close();
  });

  beforeEach(async () => {
    // Clean up networks before each test
    await supabase
      .from('redes_de_colegios')
      .delete()
      .like('name', 'Test Network%');
  });

  describe('POST /api/admin/networks', () => {
    describe('Test Case 1: Create Network (Success)', () => {
      it('should create a network successfully as admin', async () => {
        const networkData = {
          name: 'Test Network Automatizada',
          description: 'Test network created by integration test',
        };

        const response = await request(testServer)
          .post('/api/admin/networks')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(networkData)
          .expect(201);

        // Verify response structure
        expect(response.body).toMatchObject({
          success: true,
          network: {
            name: networkData.name,
            description: networkData.description,
            created_by: testUsers.admin.id,
            last_updated_by: testUsers.admin.id,
          },
          message: 'Red creada exitosamente',
        });

        // Verify network exists in database
        const { data: dbNetwork } = await supabase
          .from('redes_de_colegios')
          .select('*')
          .eq('id', response.body.network.id)
          .single();

        expect(dbNetwork).toBeTruthy();
        expect(dbNetwork.name).toBe(networkData.name);
        expect(dbNetwork.created_by).toBe(testUsers.admin.id);
      });
    });

    describe('Test Case 2: Create Network (Failure - Duplicate Name)', () => {
      it('should return 409 when creating network with duplicate name', async () => {
        const networkName = 'Test Network Duplicate';
        
        // Create first network
        await createTestNetwork(supabase, testUsers.admin.id, networkName);

        // Try to create duplicate
        const response = await request(testServer)
          .post('/api/admin/networks')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: networkName,
            description: 'Duplicate test',
          })
          .expect(409);

        expect(response.body).toMatchObject({
          error: 'Ya existe una red con ese nombre',
        });
      });
    });

    describe('Test Case 3: Create Network (Failure - Unauthorized)', () => {
      it('should return 403 when supervisor tries to create network', async () => {
        const response = await request(testServer)
          .post('/api/admin/networks')
          .set('Authorization', `Bearer ${supervisorToken}`)
          .send({
            name: 'Unauthorized Network',
            description: 'Should fail',
          })
          .expect(403);

        expect(response.body).toMatchObject({
          error: 'Solo administradores pueden gestionar redes',
        });
      });

      it('should return 403 when docente tries to create network', async () => {
        const response = await request(testServer)
          .post('/api/admin/networks')
          .set('Authorization', `Bearer ${docenteToken}`)
          .send({
            name: 'Unauthorized Network',
            description: 'Should fail',
          })
          .expect(403);

        expect(response.body).toMatchObject({
          error: 'Solo administradores pueden gestionar redes',
        });
      });
    });

    describe('Validation Tests', () => {
      it('should return 400 when name is missing', async () => {
        const response = await request(testServer)
          .post('/api/admin/networks')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            description: 'No name provided',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'El nombre de la red es requerido',
        });
      });

      it('should return 400 when name is empty', async () => {
        const response = await request(testServer)
          .post('/api/admin/networks')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            name: '   ',
            description: 'Empty name',
          })
          .expect(400);

        expect(response.body).toMatchObject({
          error: 'El nombre de la red es requerido',
        });
      });
    });
  });

  describe('GET /api/admin/networks', () => {
    it('should return list of networks with statistics', async () => {
      // Create test data
      const network = await createTestNetwork(supabase, testUsers.admin.id);
      const school = await createTestSchool(supabase);
      await assignSchoolToNetwork(supabase, network.id, school.id, testUsers.admin.id);
      await assignSupervisorToNetwork(supabase, testUsers.supervisor.id, network.id);

      const response = await request(testServer)
        .get('/api/admin/networks')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        networks: expect.arrayContaining([
          expect.objectContaining({
            id: network.id,
            name: network.name,
            school_count: 1,
            supervisor_count: 1,
            schools: expect.arrayContaining([
              expect.objectContaining({
                id: school.id,
                name: school.name,
              }),
            ]),
            supervisors: expect.arrayContaining([
              expect.objectContaining({
                user_id: testUsers.supervisor.id,
                email: testUsers.supervisor.email,
              }),
            ]),
          }),
        ]),
      });
    });

    it('should return 403 for non-admin users', async () => {
      await request(testServer)
        .get('/api/admin/networks')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(403);
    });
  });

  describe('PUT /api/admin/networks', () => {
    it('should update network successfully', async () => {
      const network = await createTestNetwork(supabase, testUsers.admin.id);
      
      const updateData = {
        id: network.id,
        name: 'Updated Network Name',
        description: 'Updated description',
      };

      const response = await request(testServer)
        .put('/api/admin/networks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        network: {
          id: network.id,
          name: updateData.name,
          description: updateData.description,
          last_updated_by: testUsers.admin.id,
        },
        message: 'Red actualizada exitosamente',
      });
    });

    it('should return 404 for non-existent network', async () => {
      const response = await request(testServer)
        .put('/api/admin/networks')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          id: '00000000-0000-0000-0000-000000000000',
          name: 'Non-existent',
        })
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Red no encontrada',
      });
    });
  });

  describe('DELETE /api/admin/networks', () => {
    it('should delete network successfully', async () => {
      const network = await createTestNetwork(supabase, testUsers.admin.id);
      
      const response = await request(testServer)
        .delete(`/api/admin/networks?id=${network.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('eliminada exitosamente'),
      });

      // Verify network was deleted
      const { data: deletedNetwork } = await supabase
        .from('redes_de_colegios')
        .select('id')
        .eq('id', network.id)
        .single();

      expect(deletedNetwork).toBeNull();
    });

    it('should return 409 when network has active supervisors', async () => {
      const network = await createTestNetwork(supabase, testUsers.admin.id);
      await assignSupervisorToNetwork(supabase, testUsers.supervisor.id, network.id);

      const response = await request(testServer)
        .delete(`/api/admin/networks?id=${network.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(response.body).toMatchObject({
        error: 'No se puede eliminar la red porque tiene supervisores activos asignados',
      });
    });
  });
});