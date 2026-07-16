import type { ApprovalItem } from '../api/approvalItems';
import type { ReviewStats, ReviewTask } from '../api/review';

export type ReviewNoteAction = 'REJECTED' | 'REWORK';
export type ApprovalReasonAction = 'REJECT' | 'REQUEST_CHANGES' | 'OVERRIDE';

export type ApprovalSelection =
  | { kind: 'review'; id: string }
  | { kind: 'approval'; id: string }
  | null;

export type LoadResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

type ApprovalDetail =
  | { kind: 'review'; value: ReviewTask }
  | { kind: 'approval'; value: ApprovalItem };

export interface ApprovalCenterState {
  server: {
    tasks: ReviewTask[];
    approvalItems: ApprovalItem[];
    stats: ReviewStats | null;
    details: Record<string, ApprovalDetail>;
    listRequestId: number;
    detailRequestId: number;
    listLoading: boolean;
    detailLoading: boolean;
    errors: {
      tasks: string | null;
      approvals: string | null;
      stats: string | null;
      detail: string | null;
    };
  };
  draft: {
    noteAction: ReviewNoteAction | null;
    reviewNotes: string;
    approvalAction: ApprovalReasonAction | null;
    approvalReason: string;
  };
  optimistic: {
    pending: {
      key: string;
      entityId: string;
      operation: string;
      startedAt: number;
    } | null;
  };
  view: {
    selection: ApprovalSelection;
  };
}

export type ApprovalCenterAction =
  | { type: 'list-requested'; requestId: number }
  | {
      type: 'list-settled';
      requestId: number;
      tasks: LoadResult<ReviewTask[]>;
      approvals: LoadResult<ApprovalItem[]>;
      stats: LoadResult<ReviewStats>;
    }
  | { type: 'detail-requested'; requestId: number; selection: Exclude<ApprovalSelection, null> }
  | {
      type: 'detail-succeeded';
      requestId: number;
      selection: Exclude<ApprovalSelection, null>;
      detail: ReviewTask | ApprovalItem;
    }
  | { type: 'detail-failed'; requestId: number; error: string }
  | { type: 'selection-closed'; invalidationRequestId: number }
  | { type: 'server-review-received'; task: ReviewTask }
  | { type: 'server-approval-received'; item: ApprovalItem }
  | {
      type: 'operation-started';
      pending: NonNullable<ApprovalCenterState['optimistic']['pending']>;
    }
  | { type: 'operation-finished'; key: string }
  | { type: 'review-draft-opened'; action: ReviewNoteAction }
  | { type: 'approval-draft-opened'; action: ApprovalReasonAction }
  | { type: 'review-notes-changed'; value: string }
  | { type: 'approval-reason-changed'; value: string }
  | { type: 'review-draft-closed' }
  | { type: 'approval-draft-closed' };

export function approvalSelectionKey(selection: Exclude<ApprovalSelection, null>): string {
  return `${selection.kind}:${selection.id}`;
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return [item, ...items];
  return items.map((candidate, candidateIndex) => candidateIndex === index ? item : candidate);
}

function resetDraft(): ApprovalCenterState['draft'] {
  return {
    noteAction: null,
    reviewNotes: '',
    approvalAction: null,
    approvalReason: '',
  };
}

export function createInitialApprovalCenterState(): ApprovalCenterState {
  return {
    server: {
      tasks: [],
      approvalItems: [],
      stats: null,
      details: {},
      listRequestId: 0,
      detailRequestId: 0,
      listLoading: true,
      detailLoading: false,
      errors: {
        tasks: null,
        approvals: null,
        stats: null,
        detail: null,
      },
    },
    draft: resetDraft(),
    optimistic: { pending: null },
    view: { selection: null },
  };
}

export function approvalCenterReducer(
  state: ApprovalCenterState,
  action: ApprovalCenterAction,
): ApprovalCenterState {
  switch (action.type) {
    case 'list-requested':
      return {
        ...state,
        server: {
          ...state.server,
          listRequestId: action.requestId,
          listLoading: true,
        },
      };
    case 'list-settled':
      if (action.requestId !== state.server.listRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          tasks: action.tasks.ok ? action.tasks.value : state.server.tasks,
          approvalItems: action.approvals.ok
            ? action.approvals.value
            : state.server.approvalItems,
          stats: action.stats.ok ? action.stats.value : state.server.stats,
          listLoading: false,
          errors: {
            ...state.server.errors,
            tasks: action.tasks.ok ? null : action.tasks.error,
            approvals: action.approvals.ok ? null : action.approvals.error,
            stats: action.stats.ok ? null : action.stats.error,
          },
        },
      };
    case 'detail-requested':
      return {
        ...state,
        server: {
          ...state.server,
          detailRequestId: action.requestId,
          detailLoading: true,
          errors: { ...state.server.errors, detail: null },
        },
        draft: resetDraft(),
        view: { selection: action.selection },
      };
    case 'detail-succeeded': {
      if (
        action.requestId !== state.server.detailRequestId
        || approvalSelectionKey(action.selection)
          !== (state.view.selection ? approvalSelectionKey(state.view.selection) : null)
      ) {
        return state;
      }
      const key = approvalSelectionKey(action.selection);
      const detail: ApprovalDetail = action.selection.kind === 'review'
        ? { kind: 'review', value: action.detail as ReviewTask }
        : { kind: 'approval', value: action.detail as ApprovalItem };
      return {
        ...state,
        server: {
          ...state.server,
          details: { ...state.server.details, [key]: detail },
          detailLoading: false,
          errors: { ...state.server.errors, detail: null },
        },
      };
    }
    case 'detail-failed':
      if (action.requestId !== state.server.detailRequestId) return state;
      return {
        ...state,
        server: {
          ...state.server,
          detailLoading: false,
          errors: { ...state.server.errors, detail: action.error },
        },
      };
    case 'selection-closed':
      return {
        ...state,
        server: {
          ...state.server,
          detailRequestId: action.invalidationRequestId,
          detailLoading: false,
          errors: { ...state.server.errors, detail: null },
        },
        draft: resetDraft(),
        view: { selection: null },
      };
    case 'server-review-received':
      return {
        ...state,
        server: {
          ...state.server,
          tasks: upsertById(state.server.tasks, action.task),
          details: {
            ...state.server.details,
            [`review:${action.task.id}`]: { kind: 'review', value: action.task },
          },
        },
      };
    case 'server-approval-received':
      return {
        ...state,
        server: {
          ...state.server,
          approvalItems: upsertById(state.server.approvalItems, action.item),
          details: {
            ...state.server.details,
            [`approval:${action.item.id}`]: { kind: 'approval', value: action.item },
          },
        },
      };
    case 'operation-started':
      return { ...state, optimistic: { pending: action.pending } };
    case 'operation-finished':
      if (state.optimistic.pending?.key !== action.key) return state;
      return { ...state, optimistic: { pending: null } };
    case 'review-draft-opened':
      return {
        ...state,
        draft: { ...state.draft, noteAction: action.action, reviewNotes: '' },
      };
    case 'approval-draft-opened':
      return {
        ...state,
        draft: { ...state.draft, approvalAction: action.action, approvalReason: '' },
      };
    case 'review-notes-changed':
      return { ...state, draft: { ...state.draft, reviewNotes: action.value } };
    case 'approval-reason-changed':
      return { ...state, draft: { ...state.draft, approvalReason: action.value } };
    case 'review-draft-closed':
      return {
        ...state,
        draft: { ...state.draft, noteAction: null, reviewNotes: '' },
      };
    case 'approval-draft-closed':
      return {
        ...state,
        draft: { ...state.draft, approvalAction: null, approvalReason: '' },
      };
  }
}

export function selectReviewTask(state: ApprovalCenterState): ReviewTask | null {
  const selection = state.view.selection;
  if (!selection || selection.kind !== 'review') return null;
  const cached = state.server.details[approvalSelectionKey(selection)];
  if (cached?.kind === 'review') return cached.value;
  return state.server.tasks.find((task) => task.id === selection.id) ?? null;
}

export function selectApprovalItem(state: ApprovalCenterState): ApprovalItem | null {
  const selection = state.view.selection;
  if (!selection || selection.kind !== 'approval') return null;
  const cached = state.server.details[approvalSelectionKey(selection)];
  if (cached?.kind === 'approval') return cached.value;
  return state.server.approvalItems.find((item) => item.id === selection.id) ?? null;
}
