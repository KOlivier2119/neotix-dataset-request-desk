export interface User {
  id: number;
  email: string;
  name: string;
  role: "admin" | "operator" | "client";
  organisation: string | null;
  is_active: boolean;
}

export interface RequestItem {
  id: number;
  client_id: number;
  client_name: string;
  title: string;
  task_name: string;
  notes: string | null;
  episodes_requested: number;
  assigned_count: number;
  deadline: string;
  status: string;
  created_at: string;
}

export interface HistoryEntry {
  id: number;
  actor_id: number;
  from_status: string | null;
  to_status: string;
  changed_at: string;
}

export interface RequestDetail extends RequestItem {
  history: HistoryEntry[];
  assigned_episode_ids: number[];
}

export interface Episode {
  id: number;
  episode_id: string;
  robot_id: string;
  task_name: string;
  recorded_at: string;
  duration_seconds: number;
  operator_name: string;
  quality: string;
  created_at: string;
}

export interface ImportReport {
  total_rows: number;
  imported: number;
  skipped_duplicate_in_file: number;
  skipped_existing: number;
  rejected: { row: number; reason: string }[];
}

export interface AnalyticsDayRobot {
  day: string;
  robot_id: string;
  count: number;
}

export interface AnalyticsStatusCount {
  status: string;
  count: number;
}

export interface AnalyticsTopTask {
  task_name: string;
  count: number;
}

export interface Analytics {
  from: string;
  to: string;
  episodes_per_day_per_robot: AnalyticsDayRobot[];
  requests_by_status: AnalyticsStatusCount[];
  median_hours_submitted_to_delivered: number | null;
  top_tasks_by_good_episodes: AnalyticsTopTask[];
}
