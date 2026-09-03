// app.js
// Everything the browser does: talk to the API, render cards, and react to
// clicks/drags/typing. No framework — just the DOM APIs the browser gives us.

const API = "/api/tasks";

// Local cache of the last list fetched from the server, so filtering by
// search/priority can happen instantly without a new network round trip.
let allTasks = [];

// --- DOM references, grabbed once up front ---------------------------
const form = document.getElementById("task-form");
const formError = document.getElementById("form-error");
const searchInput = document.getElementById("search");
const priorityFilter = document.getElementById("priority-filter");
const exportBtn = document.getElementById("export-btn");
const toast = document.getElementById("toast");
const cardTemplate = document.getElementById("card-template");

const editModal = document.getElementById("edit-modal");
const editForm = document.getElementById("edit-form");
const cancelEditBtn = document.getElementById("cancel-edit");

// ===================== API HELPERS =====================

/**
 * Thin wrapper around fetch(): builds the request, always sends/expects JSON,
 * and turns a non-2xx response into a thrown Error so callers can just
 * try/catch instead of checking response.ok everywhere.
 */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options, // spread lets callers override method/body while keeping the header above
  });
  if (res.status === 204) return null; // DELETE returns "No Content" — nothing to parse
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.errors?.join(", ") || data?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

async function fetchTasks() {
  allTasks = await api(API);
  renderBoard();
}

// ===================== RENDERING =====================

/** Applies the current search text + priority filter, then redraws everything. */
function renderBoard() {
  const query = searchInput.value.trim().toLowerCase();
  const priority = priorityFilter.value;

  const visible = allTasks.filter((t) => {
    const matchesQuery =
      !query ||
      t.title.toLowerCase().includes(query) ||
      (t.description || "").toLowerCase().includes(query);
    const matchesPriority = !priority || t.priority === priority;
    return matchesQuery && matchesPriority;
  });

  for (const status of ["todo", "in_progress", "done"]) {
    const list = document.getElementById(`list-${status}`);
    list.innerHTML = ""; // clear before redrawing this column
    const tasksForColumn = visible.filter((t) => t.status === status);
    document.getElementById(`count-${status}`).textContent = tasksForColumn.length;
    for (const task of tasksForColumn) {
      list.appendChild(buildCard(task));
    }
  }

  drawStats();
}

/** Builds one <article class="card"> DOM node from the <template>, filled with `task`'s data. */
function buildCard(task) {
  // cloneNode(true) copies the template's HTML instead of reusing the
  // template itself (which is inert and never shown directly).
  const node = cardTemplate.content.cloneNode(true);
  const card = node.querySelector(".card");

  card.dataset.id = task.id; // stash the id on the element for drag/click handlers to read back

  const dot = node.querySelector(".priority-dot");
  dot.dataset.priority = task.priority;

  node.querySelector(".card-title").textContent = task.title;

  const desc = node.querySelector(".card-desc");
  if (task.description) {
    desc.textContent = task.description;
  } else {
    desc.remove(); // no description → don't leave an empty paragraph in the layout
  }

  const due = node.querySelector(".card-due");
  due.textContent = task.due_date ? `Due ${task.due_date}` : "";
  if (!task.due_date) due.remove();

  node.querySelector(".edit-btn").addEventListener("click", () => openEditModal(task));
  node.querySelector(".delete-btn").addEventListener("click", () => deleteTask(task.id));

  // --- Drag and drop (moves a card between columns) ---
  card.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", String(task.id));
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  return node;
}

// Each column listens for drops and updates the task's status accordingly.
document.querySelectorAll(".column").forEach((column) => {
  column.addEventListener("dragover", (e) => {
    e.preventDefault(); // dragover is cancelled by default; preventDefault() is what allows a drop
    column.classList.add("drag-over");
  });
  column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
  column.addEventListener("drop", async (e) => {
    e.preventDefault();
    column.classList.remove("drag-over");
    const id = e.dataTransfer.getData("text/plain");
    const newStatus = column.dataset.status;
    const task = allTasks.find((t) => String(t.id) === id);
    if (!task || task.status === newStatus) return;
    try {
      await api(`${API}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ ...task, status: newStatus }),
      });
      showToast(`Moved "${task.title}" to ${newStatus.replace("_", " ")}`);
      await fetchTasks();
    } catch (err) {
      showToast(err.message);
    }
  });
});

// ===================== FORM: CREATE =====================

form.addEventListener("submit", async (e) => {
  e.preventDefault(); // stop the browser from doing a full-page form POST
  formError.hidden = true;

  const payload = {
    title: document.getElementById("title").value,
    description: document.getElementById("description").value,
    priority: document.getElementById("priority").value,
    due_date: document.getElementById("due_date").value || null,
  };

  try {
    await api(API, { method: "POST", body: JSON.stringify(payload) });
    form.reset();
    showToast("Task added");
    await fetchTasks();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
  }
});

// ===================== MODAL: UPDATE =====================

function openEditModal(task) {
  document.getElementById("edit-id").value = task.id;
  document.getElementById("edit-title").value = task.title;
  document.getElementById("edit-description").value = task.description || "";
  document.getElementById("edit-status").value = task.status;
  document.getElementById("edit-priority").value = task.priority;
  document.getElementById("edit-due_date").value = task.due_date || "";
  editModal.hidden = false;
}

cancelEditBtn.addEventListener("click", () => (editModal.hidden = true));

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("edit-id").value;
  const payload = {
    title: document.getElementById("edit-title").value,
    description: document.getElementById("edit-description").value,
    status: document.getElementById("edit-status").value,
    priority: document.getElementById("edit-priority").value,
    due_date: document.getElementById("edit-due_date").value || null,
  };

  try {
    await api(`${API}/${id}`, { method: "PUT", body: JSON.stringify(payload) });
    editModal.hidden = true;
    showToast("Task updated");
    await fetchTasks();
  } catch (err) {
    showToast(err.message);
  }
});

// ===================== DELETE =====================

async function deleteTask(id) {
  if (!confirm("Delete this task?")) return;
  try {
    await api(`${API}/${id}`, { method: "DELETE" });
    showToast("Task deleted");
    await fetchTasks();
  } catch (err) {
    showToast(err.message);
  }
}

// ===================== FILTERS =====================

searchInput.addEventListener("input", renderBoard);
priorityFilter.addEventListener("change", renderBoard);

// ===================== EXPORT (hand-off to the Java tool) =====================

exportBtn.addEventListener("click", async () => {
  try {
    const result = await api(`${API}/export`, { method: "POST" });
    showToast(`Exported ${result.row_count} tasks to tasks_export.csv`);
  } catch (err) {
    showToast(err.message);
  }
});

// ===================== TOAST =====================

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer); // reset the timer if a new toast arrives before the old one faded
  toastTimer = setTimeout(() => (toast.hidden = true), 2500);
}

// ===================== STATS CHART (hand-rolled canvas bar chart) =====================

function drawStats() {
  const canvas = document.getElementById("stats-canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height); // wipe the previous frame

  const counts = { todo: 0, in_progress: 0, done: 0 };
  for (const t of allTasks) counts[t.status]++;

  const labels = ["todo", "in_progress", "done"];
  const colors = { todo: "#35564B", in_progress: "#A9782E", done: "#5C6B33" };
  const max = Math.max(1, ...Object.values(counts)); // avoid divide-by-zero when the board is empty

  const barWidth = 50;
  const gap = 30;
  const chartHeight = 90;
  const baseline = 115;

  labels.forEach((label, i) => {
    const value = counts[label];
    const barHeight = (value / max) * chartHeight;
    const x = 20 + i * (barWidth + gap);
    const y = baseline - barHeight;

    ctx.fillStyle = colors[label];
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = "#23261F";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(String(value), x + barWidth / 2, y - 6);
    ctx.fillText(label.replace("_", " "), x + barWidth / 2, baseline + 16);
  });

  const total = allTasks.length;
  const done = counts.done;
  const rate = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("stats-caption").textContent =
    `${total} task${total === 1 ? "" : "s"} total · ${rate}% done`;
}

// ===================== INITIAL LOAD =====================

fetchTasks().catch((err) => showToast(err.message));
