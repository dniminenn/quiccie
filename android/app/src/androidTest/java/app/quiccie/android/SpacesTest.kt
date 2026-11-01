package app.quiccie.android

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SpacesTest {
 @Test fun catalogKeepsLegacyFoldersInTheirSpace(){
  val catalog=listOf(Space("personal","Personal","","global"),Space("business","Business","Company records/","company-shared"))
  assertEquals("business",spaceForPath("Company records/Plan.md",catalog)?.id)
  assertNull(spaceForPath("Spaces/unknown/Plan.md",catalog))
  val personal=org.json.JSONObject().put("path","Plan.md").put("content","Personal")
  val business=org.json.JSONObject().put("path","Company records/Plan.md").put("content","Business")
  assertEquals(business,Organization.resolve("Plan","Company records/Index.md",listOf(personal,business),catalog))
 }

 @Test fun createSpaceFromAppAndKeepOfflineNotes(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  Credentials(context).host="http://10.0.2.2:18090"
  Connection(context).login("http://10.0.2.2:18090","owner","quiccie-test-password")
  val spaces=Spaces(context);spaces.refresh();spaces.selected="personal";spaces.kind="notes"
  val name="Gig ${System.currentTimeMillis()}";val id=name.lowercase().replace(' ','-')
  try {
   ActivityScenario.launch(MainActivity::class.java).use {
    onView(withContentDescription("Settings")).perform(click())
    onView(withText("Add space")).perform(click())
    onView(withHint("Space name")).perform(typeText(name),closeSoftKeyboard())
    onView(withText("Create space")).perform(click())
    val deadline=android.os.SystemClock.uptimeMillis()+10000
    while(spaces.selected!=id&&android.os.SystemClock.uptimeMillis()<deadline)Thread.sleep(50)
    assertEquals(id,spaces.selected)
    onView(withContentDescription("New note")).perform(click())
    onView(withHint("Ideas/My note.md")).perform(typeText("Client plan"),closeSoftKeyboard())
    onView(withText("Create")).perform(click())
    LocalStore(context).use{db->assertNotNull(db.note("Spaces/$id/Client plan.md"))}
   }
   val restored=Spaces(context);assertTrue(restored.all().any{it.id==id});assertEquals(id,restored.selected)
   assertTrue(restored.contains("Spaces/$id/Client plan.md"));assertFalse(restored.contains("Work/Work.md"));assertFalse(restored.contains("Personal.md"))
   restored.kind="memory";assertEquals("Spaces/$id/Agent Memory/global/Fact.md",restored.notePath("Fact.md"));assertFalse(restored.containsKind("Spaces/$id/Client plan.md"))
  }finally{spaces.selected="personal";spaces.kind="notes"}
 }
}
