package app.quiccie.android

import android.content.Context
import android.util.AtomicFile
import java.io.File
import java.security.MessageDigest
import org.json.JSONObject

class Attachments(context: Context) {
    private val root = File(context.filesDir, "attachments").apply { mkdirs() }

    private fun key(path: String) =
        MessageDigest.getInstance("SHA-256").digest(path.toByteArray()).joinToString("") {
            "%02x".format(it)
        }

    fun bytes(path: String): ByteArray? =
        File(root, key(path) + ".bin").takeIf { it.exists() }?.readBytes()

    fun all(): List<JSONObject> =
        root.listFiles()?.filter { it.name.endsWith(".json") }?.map { JSONObject(it.readText()) }
            ?: emptyList()

    fun save(path: String, data: ByteArray, mime: String, pending: Boolean) {
        require(data.size <= 20 * 1024 * 1024) { "The file exceeds 20 MiB." }
        write(File(root, key(path) + ".bin"), data)
        write(
            File(root, key(path) + ".json"),
            JSONObject()
                .put("path", path)
                .put("mime", mime)
                .put("pending", pending)
                .toString()
                .toByteArray(),
        )
    }

    fun accepted(path: String) {
        val file = File(root, key(path) + ".json")
        val obj = JSONObject(file.readText()).put("pending", false)
        write(file, obj.toString().toByteArray())
    }

    fun mime(path: String) =
        File(root, key(path) + ".json")
            .takeIf { it.exists() }
            ?.let { JSONObject(it.readText()).optString("mime", "application/octet-stream") }
            ?: "application/octet-stream"

    private fun write(file: File, data: ByteArray) {
        val atomic = AtomicFile(file)
        val out = atomic.startWrite()
        try {
            out.write(data)
            atomic.finishWrite(out)
        } catch (e: Exception) {
            atomic.failWrite(out)
            throw e
        }
    }
}
