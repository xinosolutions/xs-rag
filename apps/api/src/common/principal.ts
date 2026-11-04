import { PrincipalType, WorkspaceRole } from '@xs-rag/shared';

export interface Principal {
  type: PrincipalType;
  userId?: string;
  visitorId?: string;
  apiKeyId?: string;
  workspaceId?: string;
  role?: WorkspaceRole;
  ipHash?: string;
}

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}
