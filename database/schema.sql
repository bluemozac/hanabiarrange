PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '',
  stage_width REAL NOT NULL DEFAULT 100 CHECK (stage_width > 0),
  stage_height REAL NOT NULL DEFAULT 56.25 CHECK (stage_height > 0),
  stage_shape TEXT NOT NULL DEFAULT 'rectangle'
    CHECK (stage_shape IN ('rectangle', 'circle', 'semicircle')),
  stage_flipped INTEGER NOT NULL DEFAULT 0 CHECK (stage_flipped IN (0, 1)),
  default_dancer_scale REAL NOT NULL DEFAULT 1
    CHECK (default_dancer_scale BETWEEN 0.5 AND 2),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dancers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  code TEXT NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 20),
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#f97316',
  size_scale REAL NOT NULL DEFAULT 1 CHECK (size_scale BETWEEN 0.5 AND 2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE (project_id, code)
);

CREATE TABLE IF NOT EXISTS formations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  sequence_index INTEGER NOT NULL,
  transition_seconds REAL NOT NULL DEFAULT 2 CHECK (transition_seconds BETWEEN 0 AND 60),
  positions_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(positions_json)),
  annotations_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(annotations_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE (project_id, sequence_index)
);

CREATE INDEX IF NOT EXISTS idx_dancers_project
  ON dancers(project_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_formations_project_sequence
  ON formations(project_id, sequence_index);
