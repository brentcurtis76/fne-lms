/**
 * Supabase Mock Builder for Complex Test Scenarios
 */

import { vi } from 'vitest';

export class SupabaseMockBuilder {
  private tableMocks: Map<string, any> = new Map();
  private authMock: any = {
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ data: null, error: null }),
    admin: {
      createUser: vi.fn().mockResolvedValue({ data: null, error: null }),
      deleteUser: vi.fn().mockResolvedValue({ data: null, error: null }),
      updateUserById: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
  };
  private storageMock: any = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'test/path' }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://test.com/file' } }),
      remove: vi.fn().mockResolvedValue({ error: null }),
    })
  };
  private rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

  withTable(tableName: string, config: TableMockConfig) {
    this.tableMocks.set(tableName, this.createTableMock(config));
    return this;
  }

  withAuth(authConfig: Partial<typeof this.authMock>) {
    this.authMock = { ...this.authMock, ...authConfig };
    return this;
  }

  withRpc(rpcName: string, response: any) {
    this.rpcMock.mockImplementation((name: string, params: any) => {
      if (name === rpcName) {
        return Promise.resolve(response);
      }
      return Promise.resolve({ data: null, error: null });
    });
    return this;
  }

  build() {
    const fromMock = vi.fn().mockImplementation((table: string) => {
      return this.tableMocks.get(table) || this.createDefaultTableMock();
    });

    return {
      from: fromMock,
      auth: this.authMock,
      storage: this.storageMock,
      rpc: this.rpcMock,
    };
  }

  private createTableMock(config: TableMockConfig) {
    const mock: any = {};
    
    // SELECT operation
    if (config.select) {
      mock.select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(config.select.single || { data: null, error: null }),
          order: vi.fn().mockResolvedValue(config.select.many || { data: [], error: null }),
          limit: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue(config.select.single || { data: null, error: null }),
          }),
        }),
        in: vi.fn().mockResolvedValue(config.select.many || { data: [], error: null }),
        order: vi.fn().mockResolvedValue(config.select.many || { data: [], error: null }),
      });
    }

    // INSERT operation
    if (config.insert) {
      mock.insert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(config.insert.response || { data: null, error: null })
        }),
      });
    }

    // UPDATE operation
    if (config.update) {
      mock.update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(config.update.response || { data: null, error: null })
      });
    }

    // DELETE operation
    if (config.delete) {
      mock.delete = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue(config.delete.response || { data: null, error: null }),
        in: vi.fn().mockResolvedValue(config.delete.response || { data: null, error: null })
      });
    }

    // If no specific operations configured, return all operations
    return {
      select: mock.select || vi.fn().mockReturnThis(),
      insert: mock.insert || vi.fn().mockReturnThis(),
      update: mock.update || vi.fn().mockReturnThis(),
      delete: mock.delete || vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      ...mock
    };
  }

  private createDefaultTableMock() {
    return this.createTableMock({});
  }
}

interface TableMockConfig {
  select?: {
    single?: any;
    many?: any;
  };
  insert?: {
    response?: any;
  };
  update?: {
    response?: any;
  };
  delete?: {
    response?: any;
  };
}

// Helper function for quick setup
export const createSupabaseMock = () => new SupabaseMockBuilder();