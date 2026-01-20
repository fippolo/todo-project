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
const START_HOUR_FALLBACK = 8;

@Injectable({ providedIn: 'root' })
export class TodoStore {
  private readonly tasksKey = 'todo.tasks.v1';
  private readonly startHourKey = 'todo.start-hour.v1';
  private readonly storage = typeof window === 'undefined' ? null : window.localStorage;

  private readonly _tasks = signal<TodoTask[]>([]);
  private readonly _startHour = signal<number>(START_HOUR_FALLBACK);

  readonly tasks = this._tasks.asReadonly();
  readonly startHour = this._startHour.asReadonly();

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
    const task: TodoTask = {
      id: this.makeId(),
      title,
      description: draft.description?.trim() || undefined,
      priority: this.normalizePriority(draft.priority),
      estimateMinutes: this.normalizeMinutes(draft.estimateMinutes, draft.isRest),
      status: draft.status,
      isRest: draft.isRest,
      createdAt: Date.now()
    };

    this._tasks.update((tasks) => [...tasks, task]);
  }

  updateTask(id: string, patch: Partial<TodoDraft>) {
    this._tasks.update((tasks) =>
      tasks.map((task) => {
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

        return {
          ...task,
          title,
          description,
          priority:
            patch.priority !== undefined
              ? this.normalizePriority(patch.priority)
              : task.priority,
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

  setStartHour(hour: number) {
    const clamped = Math.min(23, Math.max(0, Math.round(hour)));
    this._startHour.set(clamped);
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
      this._tasks.set(normalized);
    }

    const storedStart = this.readJson<number>(this.startHourKey, START_HOUR_FALLBACK);
    if (Number.isFinite(storedStart)) {
      this._startHour.set(Math.min(23, Math.max(0, Math.round(storedStart))));
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
      this.storage?.setItem(this.startHourKey, JSON.stringify(this._startHour()));
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
}
