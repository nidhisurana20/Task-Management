// TaskReport.java
//
// The Java "utility" piece: a standalone program, no framework, no external
// libraries — just the JDK. It reads the CSV that the Python backend
// produces (POST /api/tasks/export) and prints a summary report.
// Kept dependency-free on purpose so it compiles with nothing but `javac`.
//
// Usage:
//   javac TaskReport.java
//   java TaskReport ../backend/tasks_export.csv

import java.io.BufferedReader;   // reads a text file line by line, efficiently
import java.io.FileReader;       // opens a file for reading characters
import java.io.IOException;      // checked exception thrown by file operations
import java.util.ArrayList;      // resizable array — we don't know row count up front
import java.util.HashMap;        // key -> count lookup table, for grouping/tallying
import java.util.List;
import java.util.Map;

public class TaskReport {

    // A tiny data holder for one row of the CSV. `record` (Java 16+) auto-generates
    // the constructor, getters (task.title() etc.), equals/hashCode/toString —
    // it exists so we don't have to hand-write that boilerplate for a plain data bag.
    record Task(int id, String title, String status, String priority, String dueDate) {}

    public static void main(String[] args) {
        // args[] holds the command-line arguments after "java TaskReport".
        // args.length == 0 means the user forgot to pass a file path.
        if (args.length == 0) {
            System.out.println("Usage: java TaskReport <path-to-tasks_export.csv>");
            return; // exit main early — nothing else to do
        }

        String csvPath = args[0];
        List<Task> tasks;
        try {
            tasks = readTasks(csvPath);
        } catch (IOException e) {
            // e.getMessage() is the human-readable reason the read failed
            // (e.g. "No such file or directory").
            System.out.println("Could not read file: " + e.getMessage());
            return;
        }

        printReport(tasks);
    }

    /**
     * Reads the CSV at csvPath and turns each data row into a Task.
     * `throws IOException` means: "I don't handle file errors myself —
     * whoever calls me must either catch them or also declare throws."
     */
    private static List<Task> readTasks(String csvPath) throws IOException {
        List<Task> tasks = new ArrayList<>();

        // try-with-resources: BufferedReader is auto-closed when the block
        // ends, even if an exception is thrown — no separate finally needed.
        try (BufferedReader reader = new BufferedReader(new FileReader(csvPath))) {
            String headerLine = reader.readLine(); // first line: id,title,description,status,priority,due_date,...
            if (headerLine == null) return tasks;  // empty file

            String[] headers = parseCsvLine(headerLine);
            int idxId = indexOf(headers, "id");
            int idxTitle = indexOf(headers, "title");
            int idxStatus = indexOf(headers, "status");
            int idxPriority = indexOf(headers, "priority");
            int idxDue = indexOf(headers, "due_date");

            String line;
            // readLine() returns null at end-of-file, which ends the while loop
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue; // skip stray empty lines

                String[] cols = parseCsvLine(line);
                tasks.add(new Task(
                    Integer.parseInt(cols[idxId].trim()),
                    cols[idxTitle],
                    cols[idxStatus],
                    cols[idxPriority],
                    idxDue < cols.length ? cols[idxDue] : ""
                ));
            }
        }
        return tasks;
    }

    /**
     * A minimal RFC4180-style CSV line splitter. Plain String.split(",") breaks
     * the moment a field itself contains a comma — Python's csv.writer wraps
     * such fields in double quotes (e.g. "Install server, run this schema
     * file"), so we have to track whether we're inside quotes and only treat
     * a comma as a separator when we're not.
     */
    private static String[] parseCsvLine(String line) {
        List<String> fields = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean insideQuotes = false;

        for (int i = 0; i < line.length(); i++) {
            char c = line.charAt(i);
            if (c == '"') {
                // Two quotes in a row inside a quoted field = one literal quote
                // character (CSV's way of escaping a quote), not a toggle.
                if (insideQuotes && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    current.append('"');
                    i++; // consume both quote characters
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (c == ',' && !insideQuotes) {
                fields.add(current.toString());
                current.setLength(0); // reset the builder for the next field
            } else {
                current.append(c);
            }
        }
        fields.add(current.toString()); // the last field has no trailing comma
        return fields.toArray(new String[0]);
    }

    /** Finds the column position of `name` in the header row. */
    private static int indexOf(String[] headers, String name) {
        for (int i = 0; i < headers.length; i++) {
            if (headers[i].trim().equalsIgnoreCase(name)) return i;
        }
        throw new IllegalArgumentException("CSV missing expected column: " + name);
    }

    /** Tallies and prints the report to stdout. */
    private static void printReport(List<Task> tasks) {
        // HashMap<String, Integer> is a running count per distinct value,
        // e.g. {"todo": 3, "in_progress": 1, "done": 5}.
        Map<String, Integer> byStatus = new HashMap<>();
        Map<String, Integer> byPriority = new HashMap<>();

        for (Task t : tasks) {
            // merge(key, 1, Integer::sum): "if key isn't present, put 1;
            // if it is, add 1 to the existing value" — a one-line increment.
            byStatus.merge(t.status(), 1, Integer::sum);
            byPriority.merge(t.priority(), 1, Integer::sum);
        }

        System.out.println("=== Task Report ===");
        System.out.println("Total tasks: " + tasks.size());
        System.out.println();

        System.out.println("By status:");
        for (String key : List.of("todo", "in_progress", "done")) {
            System.out.printf("  %-12s %d%n", key, byStatus.getOrDefault(key, 0));
        }

        System.out.println();
        System.out.println("By priority:");
        for (String key : List.of("high", "medium", "low")) {
            System.out.printf("  %-12s %d%n", key, byPriority.getOrDefault(key, 0));
        }

        int done = byStatus.getOrDefault("done", 0);
        double completionRate = tasks.isEmpty() ? 0 : (100.0 * done / tasks.size());
        System.out.println();
        System.out.printf("Completion rate: %.1f%%%n", completionRate);

        System.out.println();
        System.out.println("High-priority tasks not yet done:");
        boolean any = false;
        for (Task t : tasks) {
            if (t.priority().equals("high") && !t.status().equals("done")) {
                System.out.println("  - " + t.title() + " (" + t.status() + ")");
                any = true;
            }
        }
        if (!any) System.out.println("  (none)");
    }
}
