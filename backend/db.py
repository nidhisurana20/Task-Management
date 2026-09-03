# db.py
# One job: hand back a live MySQL connection, configured from environment
# variables so nobody has to hardcode a password into source code.

import os
import mysql.connector
from mysql.connector import Error

# os.environ.get(key, default) reads an environment variable, or falls back
# to the default if it isn't set. This is how the same code runs on your
# laptop and on a server with different DB credentials.
DB_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "user": os.environ.get("DB_USER", "taskapp"),
    "password": os.environ.get("DB_PASSWORD", "taskapp_pw"),
    "database": os.environ.get("DB_NAME", "task_manager"),
}


def get_connection():
    """
    Opens and returns a new MySQL connection using DB_CONFIG.
    `**DB_CONFIG` unpacks the dict into keyword arguments, equivalent to
    writing mysql.connector.connect(host=..., user=..., password=..., database=...).
    A fresh connection per request is simple and safe for a learning project;
    a production app would use a connection pool instead.
    """
    try:
        return mysql.connector.connect(**DB_CONFIG)
    except Error as e:
        # Re-raising with more context makes the Flask error log actually useful
        raise RuntimeError(f"Could not connect to MySQL: {e}") from e
