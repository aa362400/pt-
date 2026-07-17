import { dashboardApi, type DashboardPipeline, type DashboardPipelineItem } from './dashboard';

export type PipelineItem = DashboardPipelineItem;
export type PipelineResponse = DashboardPipeline;

export const pipelineApi = {
  get: (params?: { workspaceId?: string }) => dashboardApi.getPipeline(params),
};
