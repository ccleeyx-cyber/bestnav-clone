export type Role = "owner" | "admin" | "member";

export interface User {
  id: string;
  username: string;
  role: Role;
  display_name: string;
  enabled: number;
  created_at: string;
}

export type Visibility = "public" | "private";

export interface Group {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
  visibility: Visibility;
  owner_id: string | null;
  collapsed: number;
  created_at: string;
  updated_at: string;
}

export interface Bookmark {
  id: string;
  group_id: string | null;
  title: string;
  url: string;
  internal_url: string | null;
  description: string;
  icon: string;
  icon_color: string;
  tags: string;
  visibility: Visibility;
  owner_id: string | null;
  sort_order: number;
  enabled: number;
  last_checked_at: string | null;
  last_status: number | null;
  last_latency_ms: number | null;
  created_at: string;
  updated_at: string;
}

export type CardKind =
  | "clock"
  | "weather"
  | "search"
  | "note"
  | "stock"
  | "quote"
  | "media"
  | "containers"
  | "host"
  | "ssl"
  | "traffic"
  | "calendar"
  | "custom";

export interface Card {
  id: string;
  kind: CardKind;
  title: string;
  config: string;
  position: string;
  visibility: Visibility;
  owner_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SearchSource {
  id: string;
  category: string;
  name: string;
  url_template: string;
  icon: string;
  sort_order: number;
  enabled: number;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  target: string;
  detail: string;
  ip: string;
  created_at: string;
}

export interface Relay {
  id: string;
  name: string;
  base_url: string;
  api_key_enc: string;
  models: string;
  priority: number;
  enabled: number;
  weight: number;
  health_state: string;
  cooldown_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface Monitor {
  id: string;
  name: string;
  kind: "container" | "host" | "ssl" | "http";
  target: string;
  interval_sec: number;
  threshold: string;
  enabled: number;
  last_status: string;
  last_checked_at: string | null;
  last_detail: string;
  created_at: string;
  updated_at: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  folder: string;
  pinned: number;
  todo: string;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  all_day: number;
  time_start: string | null;
  time_end: string | null;
  source: "manual" | "ssl" | "backup";
  ref_id: string | null;
  created_at: string;
}

export type TemplateId = "classic" | "magazine" | "console" | "desktop";
