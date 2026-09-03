-- schema.sql
-- Run this once against a MySQL server to create the database and table.
-- CLI:  mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS task_manager
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- A dedicated app user with a password, instead of using root.
-- (Ubuntu's default root account uses socket auth, which most DB drivers,
-- including mysql-connector-python, can't authenticate with over TCP.)
CREATE USER IF NOT EXISTS 'taskapp'@'localhost' IDENTIFIED WITH mysql_native_password BY 'taskapp_pw';
GRANT ALL PRIVILEGES ON task_manager.* TO 'taskapp'@'localhost';
FLUSH PRIVILEGES;

USE task_manager;

CREATE TABLE IF NOT EXISTS tasks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(120)  NOT NULL,
  description VARCHAR(500)  DEFAULT '',
  status      ENUM('todo', 'in_progress', 'done') NOT NULL DEFAULT 'todo',
  priority    ENUM('low', 'medium', 'high') NOT NULL DEFAULT 'medium',
  due_date    DATE          NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP
);

-- A couple of sample rows so the board isn't empty on first run.
INSERT INTO tasks (title, description, status, priority, due_date) VALUES
  ('Set up MySQL', 'Install server, run this schema file', 'done', 'high', NULL),
  ('Build the Flask API', 'CRUD routes for /api/tasks', 'in_progress', 'high', NULL),
  ('Write the Java report tool', 'Reads exported CSV, prints stats', 'todo', 'medium', NULL);
