import { Injectable, computed, effect, signal } from '@angular/core';

export type TaskStatus = 'uncompleted' | 'failed' | 'completed';

export interface TodoTask {
  id: string;
  title: string;
  description?: string;
  priority: number;
  estimateMinutes?: number;
  status: TaskStatus;
  isRest: boolean;
  createdAt: number;
}

export interface TodoDraft {
  title: string;
  description?: string;
  priority: number;
  estimateMinutes?: number | null;
  status: TaskStatus;
  isRest: boolean;
}

const DEFAULT_WORK_MINUTES = 60;
const DEFAULT_REST_MINUTES = 15;
const MIN_PRIORITY = 1;
const getNowMinutes = () => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

@Injectable({ providedIn: 'root' })
export class TodoStore {
  private readonly tasksKey = 'todo.tasks.v1';
  private readonly startMinutesKey = 'todo.start-minutes.v1';
  private readonly startHourKey = 'todo.start-hour.v1';
  private readonly storage = typeof window === 'undefined' ? null : window.localStorage;

  private readonly _tasks = signal<TodoTask[]>([]);
  private readonly _startMinutes = signal<number>(getNowMinutes());

  readonly tasks = this._tasks.asReadonly();
  readonly startMinutes = this._startMinutes.asReadonly();

  readonly sortedTasks = computed(() => {
    return [...this._tasks()].sort((first, second) => {
      const priorityDelta = first.priority - second.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const titleDelta = first.title.localeCompare(second.title);
      if (titleDelta !== 0) {
        return titleDelta;
      }
      return first.createdAt - second.createdAt;
    });
  });

  readonly totalMinutes = computed(() => {
    return this.sortedTasks().reduce((total, task) => total + this.getTaskMinutes(task), 0);
  });

  constructor() {
    this.restore();
    this.persist();
  }

  addTask(draft: TodoDraft) {
    const title = draft.title.trim() || (draft.isRest ? 'Rest time' : 'Untitled task');
    const priority = this.normalizePriority(draft.priority);
    const task: TodoTask = {
      id: this.makeId(),
      title,
      description: draft.description?.trim() || undefined,
      priority,
      estimateMinutes: this.normalizeMinutes(draft.estimateMinutes, draft.isRest),
      status: draft.status,
      isRest: draft.isRest,
      createdAt: Date.now()
    };

    this._tasks.update((tasks) => {
      const updated = this.shiftForInsert(tasks, priority);
      return [...updated, task];
    });
  }

  updateTask(id: string, patch: Partial<TodoDraft>) {
    this._tasks.update((tasks) =>
      this.shiftForUpdate(tasks, id, patch).map((task) => {
        if (task.id !== id) {
          return task;
        }

        const isRest = patch.isRest ?? task.isRest;
        const title =
          typeof patch.title === 'string'
            ? patch.title.trim() || (isRest ? 'Rest time' : task.title)
            : task.title;
        const description =
          patch.description !== undefined
            ? typeof patch.description === 'string'
              ? patch.description.trim() || undefined
              : undefined
            : task.description;
        const estimateMinutes =
          patch.estimateMinutes !== undefined
            ? this.normalizeMinutes(patch.estimateMinutes, isRest)
            : task.estimateMinutes;
        const priority =
          patch.priority !== undefined ? this.normalizePriority(patch.priority) : task.priority;

        return {
          ...task,
          title,
          description,
          priority,
          estimateMinutes,
          status: patch.status ?? task.status,
          isRest
        };
      })
    );
  }

  removeTask(id: string) {
    this._tasks.update((tasks) => tasks.filter((task) => task.id !== id));
  }

  reorderTasks(order: string[]) {
    this._tasks.update((tasks) => {
      if (order.length !== tasks.length) {
        return tasks;
      }
      const byId = new Map(tasks.map((task) => [task.id, { ...task }]));
      if (byId.size !== tasks.length) {
        return tasks;
      }

      order.forEach((id, index) => {
        const task = byId.get(id);
        if (task) {
          task.priority = index + 1;
        }
      });

      return Array.from(byId.values());
    });
  }

  setStartMinutes(minutes: number) {
    const clamped = Math.min(24 * 60 - 1, Math.max(0, Math.round(minutes)));
    this._startMinutes.set(clamped);
  }

  getTaskMinutes(task: TodoTask) {
    if (task.estimateMinutes && task.estimateMinutes > 0) {
      return task.estimateMinutes;
    }
    return task.isRest ? DEFAULT_REST_MINUTES : DEFAULT_WORK_MINUTES;
  }

  private restore() {
    if (!this.storage) {
      return;
    }

    const storedTasks = this.readJson<TodoTask[]>(this.tasksKey, []);
    if (Array.isArray(storedTasks)) {
      const normalized = storedTasks
        .map((task) => this.normalizeTask(task))
        .filter((task): task is TodoTask => task !== null);
      this._tasks.set(this.normalizePrioritiesIfNeeded(normalized));
    }

    const storedStartMinutes = this.readJson<number | null>(this.startMinutesKey, null);
    if (typeof storedStartMinutes === 'number' && Number.isFinite(storedStartMinutes)) {
      this._startMinutes.set(
        Math.min(24 * 60 - 1, Math.max(0, Math.round(storedStartMinutes)))
      );
    } else {
      const storedStartHour = this.readJson<number | null>(this.startHourKey, null);
      if (typeof storedStartHour === 'number' && Number.isFinite(storedStartHour)) {
        this._startMinutes.set(
          Math.min(23, Math.max(0, Math.round(storedStartHour))) * 60
        );
      } else {
        this._startMinutes.set(getNowMinutes());
      }
    }
  }

  private persist() {
    if (!this.storage) {
      return;
    }

    effect(() => {
      this.storage?.setItem(this.tasksKey, JSON.stringify(this._tasks()));
    });

    effect(() => {
      this.storage?.setItem(this.startMinutesKey, JSON.stringify(this._startMinutes()));
    });
  }

  private normalizeTask(raw: Partial<TodoTask>): TodoTask | null {
    if (!raw || typeof raw.title !== 'string') {
      return null;
    }

    const title = raw.title.trim() || (raw.isRest ? 'Rest time' : 'Untitled task');
    const isRest = Boolean(raw.isRest);
    const estimateMinutes = this.normalizeMinutes(raw.estimateMinutes, isRest);

    return {
      id: typeof raw.id === 'string' ? raw.id : this.makeId(),
      title,
      description: typeof raw.description === 'string' ? raw.description.trim() || undefined : undefined,
      priority: this.normalizePriority(raw.priority ?? MIN_PRIORITY),
      estimateMinutes,
      status:
        raw.status === 'completed' || raw.status === 'failed' ? raw.status : 'uncompleted',
      isRest,
      createdAt:
        typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt)
          ? raw.createdAt
          : Date.now()
    };
  }

  private normalizePriority(priority: number) {
    const parsed = Number(priority);
    if (!Number.isFinite(parsed)) {
      return MIN_PRIORITY;
    }
    return Math.max(MIN_PRIORITY, Math.round(parsed));
  }

  private normalizeMinutes(value?: number | null, isRest?: boolean) {
    if (value === null || value === undefined) {
      return undefined;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return isRest ? DEFAULT_REST_MINUTES : DEFAULT_WORK_MINUTES;
    }
    return Math.round(parsed);
  }

  private shiftForInsert(tasks: TodoTask[], priority: number) {
    const updated = tasks.map((task) => ({ ...task }));
    updated.forEach((task) => {
      if (task.priority >= priority) {
        task.priority += 1;
      }
    });
    return updated;
  }

  private shiftForUpdate(tasks: TodoTask[], id: string, patch: Partial<TodoDraft>) {
    const target = tasks.find((task) => task.id === id);
    if (!target || patch.priority === undefined) {
      return tasks.map((task) => ({ ...task }));
    }

    const updated = tasks.map((task) => ({ ...task }));
    const newPriority = this.normalizePriority(patch.priority);
    const oldPriority = target.priority;
    if (newPriority === oldPriority) {
      return updated;
    }

    if (newPriority > oldPriority) {
      updated.forEach((task) => {
        if (task.id === id) {
          return;
        }
        if (task.priority > oldPriority && task.priority <= newPriority) {
          task.priority -= 1;
        }
      });
      return updated;
    }

    updated.forEach((task) => {
      if (task.id === id) {
        return;
      }
      if (task.priority >= newPriority && task.priority < oldPriority) {
        task.priority += 1;
      }
    });
    return updated;
  }

  private normalizePrioritiesIfNeeded(tasks: TodoTask[]) {
    const priorities = tasks.map((task) => task.priority);
    const hasDuplicates = new Set(priorities).size !== priorities.length;
    if (!hasDuplicates) {
      return tasks;
    }

    const ordered = [...tasks].sort((first, second) => {
      const priorityDelta = first.priority - second.priority;
      if (priorityDelta !== 0) {
        return priorityDelta;
      }
      const titleDelta = first.title.localeCompare(second.title);
      if (titleDelta !== 0) {
        return titleDelta;
      }
      return first.createdAt - second.createdAt;
    });

    const byId = new Map(tasks.map((task) => [task.id, { ...task }]));
    ordered.forEach((task, index) => {
      const stored = byId.get(task.id);
      if (stored) {
        stored.priority = index + 1;
      }
    });

    return Array.from(byId.values());
  }

  private readJson<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage?.getItem(key);
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private makeId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `task_${Math.random().toString(36).slice(2, 10)}`;
  }

  private getNowMinutes() {
    return getNowMinutes();
  }
}
