package app.quiccie.android

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID
import org.json.JSONObject

class LocalStore(private val context: Context) : SQLiteOpenHelper(context, "quiccie.db", null, 1) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE notes(path TEXT PRIMARY KEY, body TEXT NOT NULL)")
        db.execSQL("CREATE TABLE pending(path TEXT PRIMARY KEY, body TEXT NOT NULL)")
        db.execSQL("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, new: Int) {
        error("Unsupported database version")
    }

    private fun get(table: String, path: String): JSONObject? =
        readableDatabase.rawQuery("SELECT body FROM $table WHERE path=?", arrayOf(path)).use {
            if (it.moveToFirst()) JSONObject(it.getString(0)) else null
        }

    fun note(path: String): JSONObject? = get("pending", path) ?: get("notes", path)

    fun serverNote(path: String): JSONObject? = get("notes", path)

    fun pending(path: String): JSONObject? = get("pending", path)

    fun all(table: String): List<JSONObject> {
        require(table == "notes" || table == "pending")
        return readableDatabase.rawQuery("SELECT body FROM $table ORDER BY path", null).use { c ->
            buildList { while (c.moveToNext()) add(JSONObject(c.getString(0))) }
        }
    }

    fun library(): List<JSONObject> {
        val notes = all("notes").associateBy { it.getString("path") }.toMutableMap()
        for (p in all("pending")) notes[p.getString("path")] = p
        return notes.values.filter { !it.optBoolean("deleted") }.sortedBy { it.getString("path") }
    }

    @Synchronized
    fun edit(
        path: String,
        content: String,
        deleted: Boolean = false,
        baseChecksum: String? = null,
        useBase: Boolean = false,
        baseContent: String? = null,
    ) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            val old = get("pending", path)
            val base = get("notes", path)
            val p =
                JSONObject()
                    .put("path", path)
                    .put("content", content)
                    .put("deleted", deleted)
                    .put(
                        "expected_checksum",
                        old?.opt("expected_checksum")
                            ?: (if (useBase) (if (baseContent != null && base?.optString("content") == baseContent) base.opt("checksum") else baseChecksum) ?: JSONObject.NULL
                            else base?.opt("checksum") ?: JSONObject.NULL),
                    )
                    .put("operation_id", UUID.randomUUID().toString())
            if (old?.has("conflict") == true) p.put("conflict", old.getString("conflict"))
            save(db, "pending", p)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private fun save(db: SQLiteDatabase, table: String, note: JSONObject) {
        db.execSQL(
            "INSERT OR REPLACE INTO $table(path,body) VALUES(?,?)",
            arrayOf(note.getString("path"), note.toString()),
        )
    }

    @Synchronized
    fun accept(sent: JSONObject, saved: JSONObject) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            save(db, "notes", saved)
            clearInflight(sent.getString("path"))
            val current = get("pending", sent.getString("path"))
            if (current?.optString("operation_id") == sent.getString("operation_id"))
                db.delete("pending", "path=?", arrayOf(sent.getString("path")))
            else if (current != null) {
                current.put("expected_checksum", saved.getString("checksum"))
                save(db, "pending", current)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    fun conflict(path: String) {
        clearInflight(path)
        val p = get("pending", path) ?: return
        p.put("conflict", "This note changed elsewhere. Your edit is safe.")
        save(writableDatabase, "pending", p)
    }

    @Synchronized
    fun apply(notes: List<JSONObject>, cursor: Long) {
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (n in notes) save(db, "notes", n)
            db.execSQL(
                "INSERT OR REPLACE INTO meta(key,value) VALUES('cursor',?)",
                arrayOf(cursor.toString()),
            )
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun cursor(): Long =
        readableDatabase.rawQuery("SELECT value FROM meta WHERE key='cursor'", null).use {
            if (it.moveToFirst()) it.getString(0).toLong() else 0L
        }

    @Synchronized
    fun resolve(path: String, remote: JSONObject, mine: Boolean) {
        val p = get("pending", path) ?: return
        val db = writableDatabase
        db.beginTransaction()
        try {
            save(db, "notes", remote)
            if (mine) {
                p.remove("conflict")
                p.put("expected_checksum", remote.getString("checksum"))
                p.put("operation_id", UUID.randomUUID().toString())
                save(db, "pending", p)
            } else {
                val copy = "Conflicts/${System.currentTimeMillis()}-${path.replace('/','-')}"
                p.put("path", copy)
                    .put("expected_checksum", JSONObject.NULL)
                    .put("operation_id", UUID.randomUUID().toString())
                p.remove("conflict")
                save(db, "pending", p)
                db.delete("pending", "path=?", arrayOf(path))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun inflight(path: String): JSONObject? =
        readableDatabase
            .rawQuery("SELECT value FROM meta WHERE key=?", arrayOf("inflight:" + path))
            .use { if (it.moveToFirst()) JSONObject(it.getString(0)) else null }

    fun freeze(request: JSONObject): JSONObject {
        val path = request.getString("path")
        val old = inflight(path)
        if (old != null) return old
        writableDatabase.execSQL(
            "INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)",
            arrayOf("inflight:" + path, request.toString()),
        )
        return request
    }

    fun clearInflight(path: String) {
        writableDatabase.delete("meta", "key=?", arrayOf("inflight:" + path))
    }
}
