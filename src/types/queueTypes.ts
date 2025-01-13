export interface QueueJobInfo {
  id: string;
  state: string;
  data: any;
  progress: number | object;
}

export interface QueueStats {
  waitingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}
