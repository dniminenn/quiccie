package app.quiccie.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.net.URLEncoder
import java.util.UUID
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SyncTest {
    @org.junit.Before fun useLocalTestServer(){Credentials(InstrumentationRegistry.getInstrumentation().targetContext).host="http://10.0.2.2:18090"}

    private val context
        get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test
    fun migrateHostKeepsTokenAndPendingEdit() {
        val credentials = Credentials(context)
        val oldHost = credentials.host
        val oldToken = credentials.token
        val path = "Tests/Host setting-${UUID.randomUUID()}.md"
        try {
            credentials.host = "https://notes.example.test/"
            credentials.token = "migration-test-token"
            LocalStore(context).use { it.edit(path, "# Pending host setting test\n") }
            val restored = Credentials(context)
            assertEquals("https://notes.example.test", restored.host)
            assertEquals("migration-test-token", restored.token)
            LocalStore(context).use { assertNotNull(it.pending(path)) }
            credentials.host = "https://custom.example.test"
            assertEquals("https://custom.example.test", Credentials(context).host)
        } finally {
            credentials.host = oldHost
            credentials.token = oldToken
        }
    }

    @Test
    fun saveAfterRestartAndRecoverConflict() {
        val conn = Connection(context)
        conn.login("http://10.0.2.2:18090", "owner", "quiccie-test-password")
        val path = "Tests/Android-${UUID.randomUUID()}.md"
        LocalStore(context).use { it.edit(path, "# Android\n\nSaved offline.\n") }
        LocalStore(context).use {
            assertEquals("# Android\n\nSaved offline.\n", it.note(path)!!.getString("content"))
            assertNotNull(it.pending(path))
        }
        Sync.run(context)
        val remote = JSONObject(conn.request("notes?path=" + URLEncoder.encode(path, "UTF-8")))
        LocalStore(context).use {
            assertNull(it.pending(path))
            it.edit(path, "# Android\n\nMy offline change.\n")
        }
        val agent =
            JSONObject()
                .put("path", path)
                .put("content", "# Android\n\nAn agent change.\n")
                .put("expected_checksum", remote.getString("checksum"))
                .put("operation_id", UUID.randomUUID().toString())
                .put("deleted", false)
        val changed = JSONObject(conn.request("notes", "PUT", agent))
        Sync.run(context)
        LocalStore(context).use {
            assertTrue(it.pending(path)!!.has("conflict"))
            assertTrue(it.note(path)!!.getString("content").contains("My offline change"))
            it.resolve(path, changed, false)
        }
        Sync.run(context)
        LocalStore(context).use {
            assertTrue(it.note(path)!!.getString("content").contains("An agent change"))
            assertTrue(
                it.library().any { n ->
                    n.getString("path").startsWith("Conflicts/") &&
                        n.optString("content").contains("My offline change")
                }
            )
        }
    }

    @Test
    fun retryDoesNotCreateAnotherRevision() {
        val conn = Connection(context)
        conn.login("http://10.0.2.2:18090", "owner", "quiccie-test-password")
        val path = "Tests/Android-retry-${UUID.randomUUID()}.md"
        val body =
            JSONObject()
                .put("path", path)
                .put("content", "Retry test.")
                .put("expected_checksum", JSONObject.NULL)
                .put("operation_id", UUID.randomUUID().toString())
                .put("deleted", false)
        val a = JSONObject(conn.request("notes", "PUT", body))
        val b = JSONObject(conn.request("notes", "PUT", body))
        assertEquals(a.getLong("sequence"), b.getLong("sequence"))
    }

    @Test
    fun attachmentSurvivesRestart() {
        val conn = Connection(context)
        conn.login("http://10.0.2.2:18090", "owner", "quiccie-test-password")
        val path = "Attachments/android-${UUID.randomUUID()}.txt"
        val data = "An offline attachment.".toByteArray()
        Attachments(context).save(path, data, "text/plain", true)
        assertArrayEquals(data, Attachments(context).bytes(path))
        Sync.run(context)
        assertArrayEquals(data, conn.transfer(path))
        assertFalse(
            Attachments(context).all().first { it.getString("path") == path }.getBoolean("pending")
        )
    }
    @Test
    fun acceptedCreateDoesNotCauseFalseConflict() {
        val path="Tests/Ack-${UUID.randomUUID()}.md"
        LocalStore(context).use { db ->
            db.edit(path,"First")
            val sent=db.pending(path)!!
            val saved=JSONObject().put("path",path).put("content","First").put("checksum","new-checksum")
            db.accept(sent,saved)
            db.edit(path,"Second",false,null,true,"First")
            assertEquals("new-checksum",db.pending(path)!!.getString("expected_checksum"))
            db.resolve(path,saved,false)
        }
    }

    @Test
    fun failureRetainsLastSuccessAndPendingCount() {
        val conn=Connection(context)
        conn.login("http://10.0.2.2:18090","owner","quiccie-test-password")
        Sync.run(context)
        val before=Sync.state.lastSuccess
        val path="Tests/State-${UUID.randomUUID()}.md"
        LocalStore(context).use {it.edit(path,"Keep this local change.")}
        Sync.localChanged(context)
        assertTrue(Sync.state.pending>=1)
        val host=conn.credentials.host
        try {
            conn.credentials.host="http://10.0.2.2:1"
            try {Sync.run(context)} catch(_:Exception) {}
            assertEquals("error",Sync.state.phase)
            assertEquals(before,Sync.state.lastSuccess)
            assertTrue(Sync.state.pending>=1)
        } finally {conn.credentials.host=host}
        Sync.run(context)
        LocalStore(context).use {assertNull(it.pending(path))}
        val token=conn.credentials.token
        try {conn.credentials.token="";Sync.run(context);assertEquals("auth",Sync.state.phase)} finally {conn.credentials.token=token}
    }

}
