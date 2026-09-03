# app.py
# The backend: turns HTTP requests into SQL and JSON back into HTTP responses.

import csv
import os
from flask import Flask, request, jsonify, send_from_directory
from mysql.connector import Error
from db import get_connection

# static_folder points Flask at ../frontend so it can serve index.html/app.js/
# styles.css directly, without a separate web server.
app = Flask(__name__, static_folder="../frontend", static_url_path="")

VALID_STATUSES = {"todo", "in_progress", "done"}
VALID_PRIORITIES = {"low", "medium", "high"}


def validate(data, partial=False):
    """
    Returns a list of error strings; an empty list means the input is valid.
    `partial=True` is used for updates, where a field can be omitted (meaning
    "leave unchanged") rather than required outright.
    """
    errors = []
    title = data.get("title")
    if not partial or "title" in data:
        if not title or not isinstance(title, str) or not title.strip():
            errors.append("title is required and must be a non-empty string")
    if "status" in data and data["status"] not in VALID_STATUSES:
        errors.append(f"status must be one of {sorted(VALID_STATUSES)}")
    if "priority" in data and data["priority"] not in VALID_PRIORITIES:
        errors.append(f"priority must be one of {sorted(VALID_PRIORITIES)}")
    return errors


def row_to_dict(cursor, row):
    """
    mysql-connector returns plain tuples by default. This zips each value in
    the tuple with its column name (from cursor.description) to build the
    {"id": 1, "title": "...", ...} shape the frontend expects as JSON.
    """
    columns = [col[0] for col in cursor.description]
    return dict(zip(columns, row))


# ===================== CRUD ROUTES =====================

@app.route("/api/tasks", methods=["GET"])
def list_tasks():
    """READ (all). Supports optional ?status=todo filtering."""
    status_filter = request.args.get("status")

    conn = get_connection()
    cursor = conn.cursor()
    if status_filter:
        cursor.execute(
            "SELECT * FROM tasks WHERE status = %s ORDER BY created_at DESC",
            (status_filter,),  # tuple, even with one value — the trailing comma matters
        )
    else:
        cursor.execute("SELECT * FROM tasks ORDER BY created_at DESC")

    rows = cursor.fetchall()
    tasks = [row_to_dict(cursor, r) for r in rows]
    cursor.close()
    conn.close()
    return jsonify(tasks)


@app.route("/api/tasks/<int:task_id>", methods=["GET"])
def get_task(task_id):
    """READ (one)."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()

    if row is None:
        return jsonify({"error": "Task not found"}), 404
    return jsonify(row_to_dict(cursor, row))


@app.route("/api/tasks", methods=["POST"])
def create_task():
    """CREATE."""
    data = request.get_json(force=True, silent=True) or {}
    errors = validate(data)
    if errors:
        return jsonify({"errors": errors}), 400

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO tasks (title, description, status, priority, due_date)
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            data["title"].strip(),
            data.get("description", ""),
            data.get("status", "todo"),
            data.get("priority", "medium"),
            data.get("due_date") or None,
        ),
    )
    conn.commit()  # writes are transactional — nothing is saved until commit()
    new_id = cursor.lastrowid  # the AUTO_INCREMENT id MySQL just assigned

    cursor.execute("SELECT * FROM tasks WHERE id = %s", (new_id,))
    row = cursor.fetchone()
    created = row_to_dict(cursor, row)
    cursor.close()
    conn.close()
    return jsonify(created), 201


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    """UPDATE."""
    data = request.get_json(force=True, silent=True) or {}

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
    existing = cursor.fetchone()
    if existing is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404
    existing = row_to_dict(cursor, existing)

    errors = validate(data, partial=True)
    if errors:
        cursor.close()
        conn.close()
        return jsonify({"errors": errors}), 400

    # `data.get(field, existing[field])`: use the new value if the client sent
    # one, otherwise keep what was already in the row. This is what makes
    # PUT behave like a partial update from the frontend's point of view.
    merged = {
        "title": data.get("title", existing["title"]).strip(),
        "description": data.get("description", existing["description"]),
        "status": data.get("status", existing["status"]),
        "priority": data.get("priority", existing["priority"]),
        "due_date": data.get("due_date", existing["due_date"]),
    }

    cursor.execute(
        """
        UPDATE tasks
        SET title = %s, description = %s, status = %s, priority = %s, due_date = %s
        WHERE id = %s
        """,
        (*merged.values(), task_id),
    )
    conn.commit()

    cursor.execute("SELECT * FROM tasks WHERE id = %s", (task_id,))
    updated = row_to_dict(cursor, cursor.fetchone())
    cursor.close()
    conn.close()
    return jsonify(updated)


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    """DELETE."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM tasks WHERE id = %s", (task_id,))
    if cursor.fetchone() is None:
        cursor.close()
        conn.close()
        return jsonify({"error": "Task not found"}), 404

    cursor.execute("DELETE FROM tasks WHERE id = %s", (task_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return "", 204


@app.route("/api/tasks/export", methods=["POST"])
def export_tasks():
    """
    Writes every task to tasks_export.csv next to this file. This is the
    hand-off point to the Java tool: run this, then point TaskReport.java
    at the resulting CSV.
    """
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tasks ORDER BY created_at DESC")
    rows = cursor.fetchall()
    columns = [col[0] for col in cursor.description]
    cursor.close()
    conn.close()

    export_path = os.path.join(os.path.dirname(__file__), "tasks_export.csv")
    with open(export_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(columns)
        writer.writerows(rows)

    return jsonify({"exported_to": export_path, "row_count": len(rows)})


# Serve the frontend's index.html for the root path.
@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
