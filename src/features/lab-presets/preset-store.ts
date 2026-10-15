// Where a lab keeps its presets: on the account when the person is signed
// in, in this browser otherwise. The lab talks to one interface either way.
import {
  deleteLabPreset,
  listLabPresets,
  renameLabPreset,
  saveLabPreset,
  type PresetResult,
} from "./actions";
import {
  deletePreset,
  loadSavedPresets,
  renamePreset,
  savePreset,
  type LabPreset,
  type PresetLab,
} from "./saved-presets";

export interface PresetStore {
  account: boolean;
  list(): Promise<LabPreset[]>;
  save(name: string, search: string): Promise<LabPreset[]>;
  rename(id: string, name: string): Promise<LabPreset[]>;
  remove(id: string): Promise<LabPreset[]>;
}

function unwrap(result: PresetResult): LabPreset[] {
  if ("error" in result) throw new Error(result.error);
  return result.presets;
}

export function presetStore(lab: PresetLab, account: boolean): PresetStore {
  if (!account)
    return {
      account: false,
      list: async () => loadSavedPresets(lab),
      save: async (name, search) => savePreset(lab, name, search),
      rename: async (id, name) => renamePreset(lab, id, name),
      remove: async (id) => deletePreset(lab, id),
    };
  return {
    account: true,
    list: () => listLabPresets(lab).then(unwrap),
    save: (name, search) => saveLabPreset(lab, name, search).then(unwrap),
    rename: (id, name) => renameLabPreset(lab, id, name).then(unwrap),
    remove: (id) => deleteLabPreset(lab, id).then(unwrap),
  };
}

// What the status line says once a preset is saved.
export function savedWhere(account: boolean, name: string) {
  return account
    ? `Saved as “${name}”. It is in your starting-point menu and under Saved; rename it if you like.`
    : `Saved as “${name}” in this browser. Sign in to keep presets on your account and see them under Saved.`;
}
