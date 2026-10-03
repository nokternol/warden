import type { User } from '@contract/auth';
import { contract } from '@contract/index';
import { mockProcedure } from '../contract';

const MOCK_USER: User = {
  id: 1,
  email: 'test@example.com',
  plexUsername: 'testuser',
  plexId: 12345,
  avatar: null,
  userType: 'plex',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

export const authHandlers = [
  mockProcedure(contract.auth.me, () => MOCK_USER),
  mockProcedure(contract.auth.plexLogin, () => MOCK_USER),
  mockProcedure(contract.auth.logout, () => ({ success: true })),
];
