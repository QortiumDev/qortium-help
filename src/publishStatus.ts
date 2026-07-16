import { qdnRequest } from './qdnRequest';
import type { QdnResource } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function getResourceStatus(value: unknown): string {
  const candidate =
    isRecord(value) && isRecord(value.data)
      ? value.data
      : value;

  return isRecord(candidate) && typeof candidate.status === 'string' ? candidate.status.toUpperCase() : '';
}

function getResourceSignature(value: unknown): string {
  return isRecord(value) && typeof value.latestSignature === 'string' ? value.latestSignature : '';
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

export async function waitForFeedbackResourceReady({
  expectedSignature = '',
  identifier,
  minimumUpdatedAt = 0,
  name,
  previousSignature = '',
  service = 'JSON',
  timeoutMs = 30_000,
}: {
  expectedSignature?: string;
  identifier: string;
  minimumUpdatedAt?: number;
  name: string;
  previousSignature?: string;
  service?: string;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const result = await qdnRequest<QdnResource[]>({
        action: 'SEARCH_QDN_RESOURCES',
        identifier,
        includeMetadata: false,
        includeStatus: true,
        limit: 20,
        mode: 'ALL',
        name,
        offset: 0,
        prefix: false,
        reverse: true,
        service,
      });
      const resource = Array.isArray(result)
        ? result.find(
            (candidate) =>
              candidate?.name === name &&
              candidate?.service === service &&
              candidate?.identifier === identifier,
          )
        : undefined;
      const status = getResourceStatus(resource?.status);
      const signature = getResourceSignature(resource);
      const resourceUpdatedAt =
        typeof resource?.updated === 'number'
          ? resource.updated
          : typeof resource?.created === 'number'
            ? resource.created
            : 0;
      const matchesPublishedVersion = expectedSignature
        ? signature === expectedSignature
        : signature !== previousSignature && resourceUpdatedAt >= minimumUpdatedAt;

      if (status === 'READY' && signature && matchesPublishedVersion) {
        return true;
      }

      if (status === 'BLOCKED' || status === 'BUILD_FAILED') {
        throw new Error(`Published resource entered ${status}.`);
      }
    } catch (error) {
      if (error instanceof Error && /BLOCKED|BUILD_FAILED/.test(error.message)) {
        throw error;
      }
    }

    await delay(750);
  }

  return false;
}
