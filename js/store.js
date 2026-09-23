import { uid } from './util.js';

const KEY = 'madarkharj.v1';

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s?.plans) return s;
  } catch {}
  return { plans: [] };
}

let state = load();

export const db = {
  all: () => state.plans,
  get: (id) => state.plans.find((p) => p.id === id),
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  },
  create(name) {
    const plan = { id: uid(), name: name || 'دورهمی', people: [], expenses: [], createdAt: Date.now() };
    state.plans.unshift(plan);
    this.save();
    return plan;
  },
  update(id, fn) {
    const p = this.get(id);
    if (!p) return;
    fn(p);
    p.updatedAt = Date.now();
    this.save();
  },
  remove(id) {
    state.plans = state.plans.filter((p) => p.id !== id);
    this.save();
  },
  // پلنی که از روی لینک آمده، در دستگاه خودم ذخیره شود
  importPlan(plan) {
    const copy = { ...plan, id: uid(), createdAt: Date.now(), imported: true };
    state.plans.unshift(copy);
    this.save();
    return copy;
  },
};
