import type {
  AutomationFlowDetail,
  AutomationFlowStatus,
  AutomationRun,
  AutomationTriggerType,
} from '../api/automation';
import type { WorkspaceSummary } from '../api/workspaces';
import type { AutomationFlow } from '../types';

export type SupportedAutomationAction =
  | 'product.research'
  | 'listing.draft'
  | 'profit.calculate'
  | 'task.create'
  | 'image.prompt';

export interface FlowFormState {
  name: string;
  description: string;
  triggerType: AutomationTriggerType;
  status: AutomationFlowStatus;
  intervalMinutes: string;
  action: SupportedAutomationAction;
  query: string;
  productName: string;
  salePrice: string;
  productCost: string;
  workspaceId: string;
  triggerConfig: Record<string, unknown>;
  existingSteps: Array<Record<string, unknown>>;
  templateId: 'daily-research' | 'research-to-draft' | 'image-review' | null;
}

export function createDefaultFlowForm(): FlowFormState {
  return {
    name: '',
    description: '',
    triggerType: 'MANUAL',
    status: 'DRAFT',
    intervalMinutes: '1440',
    action: 'product.research',
    query: '',
    productName: '',
    salePrice: '',
    productCost: '',
    workspaceId: '',
    triggerConfig: {},
    existingSteps: [],
    templateId: null,
  };
}

interface RunCollection {
  items: AutomationRun[];
  total: number;
}

type DetailIntent = 'view' | 'edit';

export interface AutomationWorkspaceState {
  server: {
    flows: AutomationFlow[];
    workspaces: WorkspaceSummary[];
    details: Record<string, AutomationFlowDetail>;
    runs: Record<string, RunCollection>;
    listRequestId: number;
    workspaceRequestId: number;
    detailRequestId: number;
    listLoading: boolean;
    detailLoading: { flowId: string; intent: DetailIntent } | null;
    errors: {
      flows: string | null;
      workspaces: string | null;
      detail: string | null;
    };
  };
  draft: {
    editingId: string | null;
    form: FlowFormState;
  };
  optimistic: {
    pending: {
      key: string;
      flowId: string | null;
      operation: string;
      startedAt: number;
    } | null;
  };
  view: {
    formOpen: boolean;
    detailFlowId: string | null;
    deleteFlowId: string | null;
  };
}

export type AutomationWorkspaceAction =
  | { type: 'flows-requested'; requestId: number }
  | { type: 'flows-succeeded'; requestId: number; flows: AutomationFlow[] }
  | { type: 'flows-failed'; requestId: number; error: string }
  | { type: 'workspaces-requested'; requestId: number }
  | { type: 'workspaces-succeeded'; requestId: number; workspaces: WorkspaceSummary[] }
  | { type: 'workspaces-failed'; requestId: number; error: string }
  | { type: 'detail-requested'; requestId: number; flowId: string; intent: DetailIntent }
  | {
      type: 'detail-succeeded';
      requestId: number;
      flowId: string;
      intent: DetailIntent;
      detail: AutomationFlowDetail;
      runs?: RunCollection;
      editForm?: FlowFormState;
    }
  | { type: 'detail-failed'; requestId: number; error: string }
  | { type: 'detail-closed'; invalidationRequestId: number }
  | { type: 'editor-opened'; form: FlowFormState; editingId: string | null }
  | { type: 'editor-closed' }
  | { type: 'form-patched'; patch: Partial<FlowFormState> }
  | { type: 'delete-selected'; flowId: string | null }
  | { type: 'server-flow-received'; flow: AutomationFlow }
  | { type: 'server-flow-removed'; flowId: string }
  | {
      type: 'operation-started';
      pending: NonNullable<AutomationWorkspaceState['optimistic']['pending']>;
    }
  | { type: 'operation-finished'; key: string };

function upsertFlow(flows: AutomationFlow[], flow: AutomationFlow): AutomationFlow[] {
  const index = flows.findIndex((candidate) => candidate.id === flow.id);
  if (index < 0) return [flow, ...flows];
  return flows.map((candidate, candidateIndex) => candidateIndex === index ? flow : candidate);
}

export function createInitialAutomationWorkspaceState(): AutomationWorkspaceState {
  return {
    server: {
      flows: [],
      workspaces: [],
      details: {},
      runs: {},
      listRequestId: 0,
      workspaceRequestId: 0,
      detailRequestId: 0,
      listLoading: true,
      detailLoading: null,
      errors: { flows: null, workspaces: null, detail: null },
    },
    draft: { editingId: null, form: createDefaultFlowForm() },
    optimistic: { pending: null },
    view: { formOpen: false, detailFlowId: null, deleteFlowId: null },
  };
}

export function automationWorkspaceReducer(
  state: AutomationWorkspaceState,
  action: AutomationWorkspaceAction,
): AutomationWorkspaceState {
  switch (action.type) {
    case 'flows-requested':
      return {
        ...state,
        server: {
          ...state.server,
          listRequestId: action.requestId,
          listLoading: true,
        },
      };
    case 'flows-succeeded':
      if (action.requestId !== state.server.listRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          flows: action.flows,
          listLoading: false,
          errors: { ...state.server.errors, flows: null },
        },
      };
    case 'flows-failed':
      if (action.requestId !== state.server.listRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          listLoading: false,
          errors: { ...state.server.errors, flows: action.error },
        },
      };
    case 'workspaces-requested':
      return {
        ...state,
        server: { ...state.server, workspaceRequestId: action.requestId },
      };
    case 'workspaces-succeeded':
      if (action.requestId !== state.server.workspaceRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          workspaces: action.workspaces,
          errors: { ...state.server.errors, workspaces: null },
        },
      };
    case 'workspaces-failed':
      if (action.requestId !== state.server.workspaceRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          errors: { ...state.server.errors, workspaces: action.error },
        },
      };
    case 'detail-requested':
      return {
        ...state,
        server: {
          ...state.server,
          detailRequestId: action.requestId,
          detailLoading: { flowId: action.flowId, intent: action.intent },
          errors: { ...state.server.errors, detail: null },
        },
      };
    case 'detail-succeeded':
      if (action.requestId !== state.server.detailRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          details: { ...state.server.details, [action.flowId]: action.detail },
          runs: action.runs
            ? { ...state.server.runs, [action.flowId]: action.runs }
            : state.server.runs,
          detailLoading: null,
          errors: { ...state.server.errors, detail: null },
        },
        draft: action.intent === 'edit' && action.editForm
          ? { editingId: action.flowId, form: action.editForm }
          : state.draft,
        view: action.intent === 'view'
          ? { ...state.view, detailFlowId: action.flowId }
          : action.editForm
            ? { ...state.view, formOpen: true }
            : state.view,
      };
    case 'detail-failed':
      if (action.requestId !== state.server.detailRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          detailLoading: null,
          errors: { ...state.server.errors, detail: action.error },
        },
      };
    case 'detail-closed':
      return {
        ...state,
        server: {
          ...state.server,
          detailRequestId: action.invalidationRequestId,
          detailLoading: null,
          errors: { ...state.server.errors, detail: null },
        },
        view: { ...state.view, detailFlowId: null },
      };
    case 'editor-opened':
      return {
        ...state,
        draft: { editingId: action.editingId, form: action.form },
        view: { ...state.view, formOpen: true },
      };
    case 'editor-closed':
      return {
        ...state,
        draft: { editingId: null, form: createDefaultFlowForm() },
        view: { ...state.view, formOpen: false },
      };
    case 'form-patched':
      return {
        ...state,
        draft: { ...state.draft, form: { ...state.draft.form, ...action.patch } },
      };
    case 'delete-selected':
      return { ...state, view: { ...state.view, deleteFlowId: action.flowId } };
    case 'server-flow-received':
      return {
        ...state,
        server: { ...state.server, flows: upsertFlow(state.server.flows, action.flow) },
      };
    case 'server-flow-removed':
      return {
        ...state,
        server: {
          ...state.server,
          flows: state.server.flows.filter((flow) => flow.id !== action.flowId),
          details: Object.fromEntries(
            Object.entries(state.server.details).filter(([id]) => id !== action.flowId),
          ),
          runs: Object.fromEntries(
            Object.entries(state.server.runs).filter(([id]) => id !== action.flowId),
          ),
        },
        view: {
          ...state.view,
          deleteFlowId: state.view.deleteFlowId === action.flowId
            ? null
            : state.view.deleteFlowId,
          detailFlowId: state.view.detailFlowId === action.flowId
            ? null
            : state.view.detailFlowId,
        },
      };
    case 'operation-started':
      return { ...state, optimistic: { pending: action.pending } };
    case 'operation-finished':
      if (state.optimistic.pending?.key !== action.key) return state;
      return { ...state, optimistic: { pending: null } };
  }
}

export function selectAutomationDetail(
  state: AutomationWorkspaceState,
): AutomationFlowDetail | null {
  const id = state.view.detailFlowId;
  return id ? state.server.details[id] ?? null : null;
}

export function selectAutomationRuns(state: AutomationWorkspaceState): RunCollection {
  const id = state.view.detailFlowId;
  return id ? state.server.runs[id] ?? { items: [], total: 0 } : { items: [], total: 0 };
}

export function selectDeleteFlow(state: AutomationWorkspaceState): AutomationFlow | null {
  const id = state.view.deleteFlowId;
  return id ? state.server.flows.find((flow) => flow.id === id) ?? null : null;
}
