import { contract } from '@contract/index';
import { mockProcedure } from '../contract';

export const providersHandlers = [mockProcedure(contract.providers.tasks, () => [])];
