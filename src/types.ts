export type QdnAction = string;

export type BridgeState = {
  actions: QdnAction[];
  isHomeBridge: boolean;
  ui: string;
};

export type QdnSelectedAccount = {
  address: string;
  avatarUrl?: string | null;
  id?: string;
  isUnlocked?: boolean;
  name?: string | null;
  resourceUrl?: string;
};

export type NodeApiFetchResult<T = unknown> = {
  body: string;
  contentLength?: number;
  contentType: string;
  data: T;
  ok: boolean;
  status: number;
  statusText: string;
};

export type QdnResourceMetadata = {
  category?: string | null;
  description?: string | null;
  tags?: string[] | null;
  title?: string | null;
};

export type QdnResourceStatus = {
  status?: string;
};

export type QdnResource = {
  created?: number | null;
  identifier?: string | null;
  latestSignature?: unknown;
  metadata?: QdnResourceMetadata | null;
  name: string;
  service: string;
  size?: number | null;
  status?: QdnResourceStatus | null;
  updated?: number | null;
};

export type PublishActionResult = {
  accepted: boolean;
  action: 'PUBLISH_QDN_RESOURCE';
  resource?: {
    identifier: string | null;
    name: string;
    service: string;
  };
  result?: unknown;
  transactionSignature?: string;
};

export type DeleteActionResult = {
  accepted: boolean;
  action: 'DELETE_QDN_RESOURCE';
  resource?: {
    identifier: string | null;
    name: string;
    service: string;
  };
  result?: unknown;
};
