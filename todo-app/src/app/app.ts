import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { TodoStore, TodoTask, TaskStatus, TodoDraft } from './todo.store';

interface TimelineSegment {
  id: string;
  title: string;
  label: string;
  isRest: boolean;
  status: TaskStatus;
  left: number;
  width: number;
  durationMinutes: number;
  delay: string;
}

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatToolbarModule,
    MatTooltipModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly store = inject(TodoStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly sortedTasks = this.store.sortedTasks;
  readonly startHour = this.store.startHour;
  readonly totalMinutes = this.store.totalMinutes;
  readonly nowMinutes = signal(this.getNowMinutes());
  readonly editingId = signal<string | null>(null);

  readonly timelineSegments = computed(() =>
    this.buildTimelineSegments(this.sortedTasks(), this.startHour())
  );
  readonly overbooked = computed(() => this.totalMinutes() > 24 * 60);

  readonly form = this.formBuilder.group({
    title: ['', [Validators.required, Validators.maxLength(60)]],
    description: [''],
    priority: [1, [Validators.required, Validators.min(1)]],
    estimateMinutes: [60, [Validators.min(0)]],
    status: ['uncompleted' as TaskStatus, [Validators.required]],
    isRest: [false]
  });

  constructor() {
    const timer = setInterval(() => this.nowMinutes.set(this.getNowMinutes()), 60000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  startNewTask() {
    this.editingId.set(null);
    this.form.reset({
      title: '',
      description: '',
      priority: 1,
      estimateMinutes: 60,
      status: 'uncompleted',
      isRest: false
    });
  }

  editTask(task: TodoTask) {
    this.editingId.set(task.id);
    this.form.reset(
      {
        title: task.title,
        description: task.description ?? '',
        priority: task.priority,
        estimateMinutes: task.estimateMinutes ?? null,
        status: task.status,
        isRest: task.isRest
      },
      { emitEvent: false }
    );
  }

  cancelEdit() {
    this.startNewTask();
  }

  saveTask() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const draft: TodoDraft = {
      title: raw.title ?? '',
      description: raw.description ?? '',
      priority: Number(raw.priority ?? 1),
      estimateMinutes:
        raw.estimateMinutes === null || raw.estimateMinutes === undefined
          ? null
          : Number(raw.estimateMinutes),
      status: raw.status ?? 'uncompleted',
      isRest: Boolean(raw.isRest)
    };

    const editingId = this.editingId();
    if (editingId) {
      this.store.updateTask(editingId, draft);
    } else {
      this.store.addTask(draft);
    }

    this.startNewTask();
  }

  setStatus(task: TodoTask, status: TaskStatus) {
    if (status && status !== task.status) {
      this.store.updateTask(task.id, { status });
    }
  }

  removeTask(task: TodoTask) {
    this.store.removeTask(task.id);
    if (this.editingId() === task.id) {
      this.startNewTask();
    }
  }

  setStartHour(hour: number) {
    this.store.setStartHour(hour);
  }

  formatDuration(minutes?: number) {
    if (!minutes || minutes <= 0) {
      return 'Auto';
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours && mins) {
      return `${hours}h ${mins}m`;
    }
    if (hours) {
      return `${hours}h`;
    }
    return `${mins}m`;
  }

  formatHour(hour: number) {
    const clamped = Math.min(23, Math.max(0, hour));
    const hours = Math.floor(clamped);
    const minutes = Math.round((clamped - hours) * 60);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  private buildTimelineSegments(tasks: TodoTask[], startHour: number): TimelineSegment[] {
    const dayMinutes = 24 * 60;
    const segments: TimelineSegment[] = [];
    let cursor = startHour * 60;

    tasks.forEach((task, index) => {
      const duration = this.store.getTaskMinutes(task);
      const start = cursor;
      const end = cursor + duration;
      const clampedStart = Math.max(0, Math.min(dayMinutes, start));
      const clampedEnd = Math.max(0, Math.min(dayMinutes, end));
      const visibleMinutes = clampedEnd - clampedStart;

      if (visibleMinutes > 0 && start < dayMinutes) {
        segments.push({
          id: task.id,
          title: task.title,
          label: task.isRest ? 'Rest' : task.title,
          isRest: task.isRest,
          status: task.status,
          left: (clampedStart / dayMinutes) * 100,
          width: (visibleMinutes / dayMinutes) * 100,
          durationMinutes: duration,
          delay: `${index * 80}ms`
        });
      }

      cursor = end;
    });

    return segments;
  }

  private getNowMinutes() {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }
}
