import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join } from "path";

const DB_DIR = join(process.cwd(), "data");
const DB_PATH = join(DB_DIR, "photobooth.db");

mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS photos (
    id         TEXT PRIMARY KEY,
    prompt     TEXT NOT NULL,
    image_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

export interface Photo {
  id: string;
  prompt: string;
  image_path: string;
  created_at: string;
}

export function savePhoto(
  id: string,
  prompt: string,
  imagePath: string,
): void {
  const stmt = db.prepare(
    "INSERT INTO photos (id, prompt, image_path) VALUES (?, ?, ?)",
  );
  stmt.run(id, prompt, imagePath);
}

export function getPhotos(limit: number = 50): Photo[] {
  const stmt = db.prepare(
    "SELECT * FROM photos ORDER BY created_at DESC LIMIT ?",
  );
  return stmt.all(limit) as Photo[];
}

export function getPhoto(id: string): Photo | undefined {
  const stmt = db.prepare("SELECT * FROM photos WHERE id = ?");
  return stmt.get(id) as Photo | undefined;
}
