import type { Express, Response } from 'express';
import type { DesignProjectsSyncResponse } from '@open-design/contracts';

import {
  DesignProjectsServiceError,
  designProjectsSnapshotMetadata,
} from '../design-projects/service.js';
import type { RouteDeps } from '../server-context.js';

export interface RegisterDesignProjectsRoutesDeps
  extends RouteDeps<'http' | 'designProjects'> {}

function sendDesignProjectsError(
  res: Response,
  sendApiError: RegisterDesignProjectsRoutesDeps['http']['sendApiError'],
  error: unknown,
): void {
  if (error instanceof DesignProjectsServiceError) {
    const status =
      error.code === 'DESIGN_PROJECTS_NOT_CONFIGURED' ||
      error.code === 'DESIGN_PROJECTS_CLI_UNAVAILABLE'
        ? 503
        : error.code === 'DESIGN_PROJECTS_SYNC_FAILED'
          ? 502
          : 500;
    sendApiError(res, status, error.code, error.message);
    return;
  }
  sendApiError(res, 500, 'INTERNAL_ERROR', 'Design project request failed.');
}

export function registerDesignProjectsRoutes(
  app: Express,
  ctx: RegisterDesignProjectsRoutesDeps,
): void {
  const { requireLocalDaemonRequest, sendApiError } = ctx.http;

  app.get('/api/design-projects/status', requireLocalDaemonRequest, async (_req, res) => {
    try {
      res.json(await ctx.designProjects.status());
    } catch (error) {
      sendDesignProjectsError(res, sendApiError, error);
    }
  });

  app.get('/api/design-projects/snapshot', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const snapshot = await ctx.designProjects.readSnapshot();
      if (!snapshot) {
        sendApiError(
          res,
          404,
          'DESIGN_PROJECTS_SNAPSHOT_NOT_FOUND',
          'No design project snapshot is available.',
        );
        return;
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.json(snapshot);
    } catch (error) {
      sendDesignProjectsError(res, sendApiError, error);
    }
  });

  app.post('/api/design-projects/sync', requireLocalDaemonRequest, async (_req, res) => {
    try {
      const snapshot = await ctx.designProjects.sync();
      const response: DesignProjectsSyncResponse = {
        ok: true,
        snapshot: designProjectsSnapshotMetadata(snapshot),
      };
      res.setHeader('Cache-Control', 'private, no-store');
      res.json(response);
    } catch (error) {
      sendDesignProjectsError(res, sendApiError, error);
    }
  });
}
