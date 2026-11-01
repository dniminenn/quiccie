package app.quiccie.android

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

class HTTPError(val status: Int, message: String) : Exception(message)

class Credentials(context: Context) {
    private val prefs = context.getSharedPreferences("connection", Context.MODE_PRIVATE)
    var host: String
        get() = prefs.getString("host", "")!!
        set(value) {
            prefs.edit().putString("host", value.trimEnd('/')).commit()
        }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore")
        ks.load(null)
        val old = ks.getKey("quiccie-token", null)
        if (old != null) return old as SecretKey
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(
                    "quiccie-token",
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build()
        )
        return gen.generateKey()
    }

    var token: String
        get() {
            val saved = prefs.getString("token", null) ?: return ""
            return try {
                val raw = Base64.decode(saved, Base64.NO_WRAP)
                val cipher = Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    GCMParameterSpec(128, raw.copyOfRange(0, 12)),
                )
                String(cipher.doFinal(raw.copyOfRange(12, raw.size)), Charsets.UTF_8)
            } catch (e: Exception) {
                ""
            }
        }
        set(value) {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            prefs
                .edit()
                .putString(
                    "token",
                    Base64.encodeToString(
                        cipher.iv + cipher.doFinal(value.toByteArray()),
                        Base64.NO_WRAP,
                    ),
                )
                .commit()
        }
}

class Connection(private val context: Context) {
    val credentials = Credentials(context)

    fun request(path: String, method: String = "GET", body: JSONObject? = null): String {
        val conn = URL(credentials.host + "/api/" + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 10000
            conn.readTimeout = 20000
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("Authorization", "Bearer " + credentials.token)
            conn.setRequestProperty("Content-Type", "application/json")
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val text =
                (if (code in 200..299) conn.inputStream else conn.errorStream)
                    ?.bufferedReader()
                    ?.use { it.readText() } ?: ""
            if (code !in 200..299)
                throw HTTPError(
                    code,
                    try {
                        JSONObject(text).optString("error", "Request failed")
                    } catch (e: Exception) {
                        "Request failed ($code)"
                    },
                )
            return text
        } finally {
            conn.disconnect()
        }
    }

    fun transfer(path: String, data: ByteArray? = null): ByteArray {
        val conn =
            URL(
                    credentials.host +
                        "/api/attachment?path=" +
                        java.net.URLEncoder.encode(path, "UTF-8")
                )
                .openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10000
            conn.readTimeout = 30000
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("Authorization", "Bearer " + credentials.token)
            if (data != null) {
                conn.requestMethod = "POST"
                conn.doOutput = true
                conn.setFixedLengthStreamingMode(data.size)
                conn.outputStream.use { it.write(data) }
            }
            if (conn.responseCode !in 200..299)
                throw HTTPError(conn.responseCode, "The attachment transfer failed.")
            return conn.inputStream.use { it.readBytes() }
        } finally {
            conn.disconnect()
        }
    }

    fun login(host: String, username: String, password: String) {
        val u = URL(host)
        require(u.protocol == "https" || (BuildConfig.DEBUG && u.protocol == "http")) {
            "Use an HTTPS address."
        }
        require(u.userInfo == null && u.query == null && u.ref == null) {
            "Use a server address without credentials."
        }
        val previous = credentials.host
        LocalStore(context).use {
            require(previous.trimEnd('/') == host.trimEnd('/') || it.library().isEmpty()) {
                "This device has notes from another server. Export them before you change servers."
            }
        }
        credentials.host = host
        val response =
            try {
                JSONObject(
                    request(
                        "login",
                        "POST",
                        JSONObject()
                            .put("username", username)
                            .put("password", password)
                            .put("device", "Android"),
                    )
                )
            } catch (e: Exception) {
                credentials.host = previous
                throw e
            }
        credentials.token = response.getString("token")
    }
}

data class SyncState(val phase:String="idle",val pending:Int=0,val conflicts:Int=0,val lastSuccess:Long=0) {
    fun label():String = when(phase) {
        "sending" -> "Syncing · Sending changes"
        "receiving" -> "Syncing · Receiving changes"
        "synced" -> "Up to date · Checked "+java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(lastSuccess))
        "pending" -> "Saved locally · $pending changes waiting"
        "auth" -> "Sign in to sync · $pending waiting"
        "offline" -> "Offline · $pending changes waiting"
        "error" -> "Sync failed · $pending changes waiting"
        "conflict" -> "Review needed · $conflicts notes"
        "storage" -> "Cannot save on this device"
        else -> "Not checked · Open sync details"
    }
}
object Sync {
    @Volatile var state=SyncState(); private set
    val listeners=java.util.concurrent.CopyOnWriteArrayList<(SyncState)->Unit>()
    private val running=java.util.concurrent.atomic.AtomicBoolean(false)
    fun update(context:Context, phase:String=state.phase) {
        try {
            LocalStore(context).use { db ->
                val pending=db.all("pending")
                val count=pending.size+Attachments(context).all().count { it.optBoolean("pending") }
                val conflicts=pending.count { it.has("conflict") }
                val actual=if(phase in listOf("idle","pending","synced")) {
                    if(conflicts>0) "conflict" else if(count>0) "pending" else if(phase=="pending") "idle" else phase
                } else phase
                state=SyncState(actual,count,conflicts,context.getSharedPreferences("sync-state",Context.MODE_PRIVATE).getLong("last-success",0))
            }
        } catch(e:Exception) { state=state.copy(phase="storage") }
        listeners.forEach { it(state) }
    }
    fun localChanged(context:Context) { update(context, if(state.phase in listOf("auth","offline","error","storage","conflict","sending","receiving")) state.phase else "pending") }
    fun run(context: Context): String {
        if(!running.compareAndSet(false,true))return state.label()
        try { return transfer(context) }
        catch(e:Exception) {
            val manager=context.getSystemService(android.net.ConnectivityManager::class.java)
            val phase=when {
                e is HTTPError && e.status==401 -> "auth"
                e is android.database.sqlite.SQLiteException -> "storage"
                e is java.io.IOException && manager.activeNetwork==null -> "offline"
                else -> "error"
            }
            update(context,phase)
            throw e
        } finally { running.set(false) }
    }
    private fun transfer(context:Context):String {
        val conn = Connection(context)
        if (conn.credentials.token.isEmpty()) { update(context, "auth"); return state.label() }
        Spaces(context).refresh()
        LocalStore(context).use { db ->
            update(context, "sending")
            val attachments = Attachments(context)
            for (file in attachments.all()) {
                if (file.optBoolean("pending")) {
                    val path = file.getString("path")
                    conn.transfer(
                        path,
                        attachments.bytes(path) ?: error("The local attachment is missing."),
                    )
                    attachments.accepted(path)
                }
            }
            for (p in db.all("pending")) {
                if (p.has("conflict")) continue
                val sent = db.freeze(p)
                try {
                    val saved = JSONObject(conn.request("notes", "PUT", sent))
                    db.accept(sent, saved)
                } catch (e: HTTPError) {
                    if (e.status == 409) db.conflict(p.getString("path")) else throw e
                }
            }
            update(context, "receiving")
            var complete=false
            var cursor = db.cursor()
            for (page in 0 until 1000) {
                val response = JSONObject(conn.request("changes?after=$cursor"))
                val array = response.getJSONArray("changes")
                val notes = (0 until array.length()).map { array.getJSONObject(it) }
                cursor = response.getLong("next")
                db.apply(notes, cursor)
                if (!response.getBoolean("more")) { complete=true; break }
            }
            check(complete) { "The sync page limit was reached. Try again." }
            val remoteFiles = JSONArray(conn.request("attachments"))
            for (i in 0 until remoteFiles.length()) {
                val file = remoteFiles.getJSONObject(i)
                val path = file.getString("path")
                if (attachments.bytes(path) == null) {
                    val data = conn.transfer(path)
                    val mime =
                        java.net.URLConnection.guessContentTypeFromName(path)
                            ?: "application/octet-stream"
                    attachments.save(path, data, mime, false)
                }
            }
            val pending=db.all("pending")
            val count=pending.size+attachments.all().count { it.optBoolean("pending") }
            val phase=if(pending.any { it.has("conflict") }) "conflict" else if(count>0) "pending" else "synced"
            if(count==0) context.getSharedPreferences("sync-state",Context.MODE_PRIVATE).edit().putLong("last-success",System.currentTimeMillis()).commit()
            update(context,phase)
            return state.label()
        }
    }

    fun schedule(context: Context) {
        val scheduler = context.getSystemService(JobScheduler::class.java)
        scheduler.schedule(
            JobInfo.Builder(42, ComponentName(context, SyncJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setPeriodic(15 * 60 * 1000L)
                .build()
        )
    }
}

class SyncJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        Thread {
                var retry = false
                try {
                    Sync.run(this)
                } catch (e: Exception) {
                    retry = true
                }
                jobFinished(params, retry)
            }
            .start()
        return true
    }

    override fun onStopJob(params: JobParameters) = true
}
