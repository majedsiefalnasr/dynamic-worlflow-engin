import { useSyncExternalStore } from "react";
import type {
  WorkflowDefinition, WorkflowVersion, WorkflowStage, WorkflowTransition,
  WorkflowAction, StageAssignment, FieldDefinition, FieldGroup, FieldRule,
  StageGroup, StageRoutingRule, WorkflowInstance, WorkflowHistory,
  WfOrganization, WfTeam, WfRole, WfUser,
} from "./types";

// ------------------------------------------------------------
// Persistent + reactive store for the workflow engine.
// Each table is mirrored in localStorage and exposed as a
// `useSyncExternalStore` cell so React components react to
// changes from anywhere in the app.
// ------------------------------------------------------------

const PREFIX = "wfe:";

type Tables = {
  orgs: WfOrganization[];
  teams: WfTeam[];
  roles: WfRole[];
  users: WfUser[];
  definitions: WorkflowDefinition[];
  versions: WorkflowVersion[];
  stages: WorkflowStage[];
  stageGroups: StageGroup[];
  stageRoutingRules: StageRoutingRule[];
  transitions: WorkflowTransition[];
  actions: WorkflowAction[];
  assignments: StageAssignment[];
  fieldDefs: FieldDefinition[];
  fieldGroups: FieldGroup[];
  fieldRules: FieldRule[];
  instances: WorkflowInstance[];
  history: WorkflowHistory[];
};

type TableName = keyof Tables;

function load<K extends TableName>(name: K): Tables[K] {
  if (typeof window === "undefined") return [] as unknown as Tables[K];
  try {
    const raw = window.localStorage.getItem(PREFIX + name);
    if (!raw) return [] as unknown as Tables[K];
    return JSON.parse(raw) as Tables[K];
  } catch {
    return [] as unknown as Tables[K];
  }
}

function persist<K extends TableName>(name: K, value: Tables[K]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + name, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable in private mode — ignore.
  }
}

function makeCell<K extends TableName>(name: K) {
  let data: Tables[K] = load(name);
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  return {
    get(): Tables[K] {
      return data;
    },
    set(next: Tables[K]) {
      data = next;
      persist(name, data);
      emit();
    },
    /** functional update */
    update(fn: (prev: Tables[K]) => Tables[K]) {
      this.set(fn(data));
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    use(): Tables[K] {
      return useSyncExternalStore(
        (l) => this.subscribe(l),
        () => data,
        () => data,
      );
    },
    /** Reload from localStorage. Used after seeding. */
    reload() {
      data = load(name);
      emit();
    },
  };
}

export const store = {
  orgs: makeCell("orgs"),
  teams: makeCell("teams"),
  roles: makeCell("roles"),
  users: makeCell("users"),
  definitions: makeCell("definitions"),
  versions: makeCell("versions"),
  stages: makeCell("stages"),
  stageGroups: makeCell("stageGroups"),
  stageRoutingRules: makeCell("stageRoutingRules"),
  transitions: makeCell("transitions"),
  actions: makeCell("actions"),
  assignments: makeCell("assignments"),
  fieldDefs: makeCell("fieldDefs"),
  fieldGroups: makeCell("fieldGroups"),
  fieldRules: makeCell("fieldRules"),
  instances: makeCell("instances"),
  history: makeCell("history"),
};

export function resetAll() {
  (Object.keys(store) as TableName[]).forEach((k) => {
    store[k].set([] as never);
  });
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}
