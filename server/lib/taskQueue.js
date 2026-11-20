import { EventEmitter } from 'events';

export class TaskQueue extends EventEmitter {
  constructor() {
    super();
    this.tasks = new Map();
    this.maxConcurrency = 1;
    this.runningCount = 0;
    this.queue = [];
  }

  setMaxConcurrency(n) {
    this.maxConcurrency = Math.max(1, Number(n) || 1);
    this._processQueue();
  }

  createTask(taskId, config) {
    this.tasks.set(taskId, {
      id: taskId,
      status: 'pending',
      progress: 0,
      totalEmails: 0,
      emails: [],
      websitesVisited: 0,
      searchesCompleted: 0,
      currentSource: '',
      currentQuery: '',
      error: null,
      config,
      createdAt: new Date(),
      updatedAt: new Date(),
      stopRequested: false,
      pauseRequested: false,
      result: null
    });
    return this.tasks.get(taskId);
  }

  getTask(taskId) {
    return this.tasks.get(taskId);
  }

  updateTask(taskId, patch) {
    const task = this.tasks.get(taskId);
    if (!task) return null;
    Object.assign(task, patch, { updatedAt: new Date() });
    this.emit('taskUpdated', task);
    return task;
  }

  enqueue(taskId, runner) {
    this.queue.push({ taskId, runner });
    this._processQueue();
  }

  _processQueue() {
    while (this.runningCount < this.maxConcurrency && this.queue.length > 0) {
      const { taskId, runner } = this.queue.shift();
      this.runningCount++;
      this._runTask(taskId, runner);
    }
  }

  async _runTask(taskId, runner) {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.runningCount--;
      this._processQueue();
      return;
    }
    if (task.status === 'running') {
      this.runningCount--;
      this._processQueue();
      return;
    }

    task.status = 'running';
    task.stopRequested = false;
    task.pauseRequested = false;
    this.emit('taskUpdated', task);

    try {
      await runner(task);
      if (task.stopRequested) {
        task.status = 'stopped';
      } else if (task.status !== 'error') {
        task.status = 'completed';
        task.progress = 100;
      }
    } catch (error) {
      task.status = 'error';
      task.error = error.message;
    }
    this.emit('taskUpdated', task);
    this.runningCount--;
    this._processQueue();
  }

  async startTask(taskId, runner) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');
    this.enqueue(taskId, runner);
    return task;
  }

  requestStop(taskId) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.stopRequested = true;
      this.emit('taskUpdated', task);
    }
  }

  requestPause(taskId) {
    const task = this.tasks.get(taskId);
    if (task && task.status === 'running') {
      task.pauseRequested = true;
      this.emit('taskUpdated', task);
    }
  }

  requestResume(taskId) {
    const task = this.tasks.get(taskId);
    if (task && (task.status === 'paused' || task.pauseRequested)) {
      task.pauseRequested = false;
      task.status = 'running';
      this.emit('taskUpdated', task);
    }
  }

  listTasks() {
    return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
}

export const taskQueue = new TaskQueue();
