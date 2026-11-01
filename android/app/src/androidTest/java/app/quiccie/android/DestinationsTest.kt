package app.quiccie.android
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DestinationsTest {
 @Test fun projectRootsAndIndexClassification(){
  val spaces=listOf(Space("personal","Personal","","global"),Space("work","Work","Work/","work"))
  val paths=listOf("Engineering/A/Overview.md","Engineering/A/Deep/Guide.md","Engineering/B/Overview.md","Home Network/Clocks/Clock.md","Loose.md")
  assertEquals(listOf("Engineering/A","Engineering/B","Home Network"),Organization.noteProjects(paths,spaces))
  assertEquals(Organization.noteProjects(paths,spaces),Organization.noteProjects(paths+"Engineering/Readme.md",spaces))
  assertEquals("",Organization.browseParent("Engineering/A",listOf("Engineering/A","Engineering/B"),spaces))
  assertTrue(Organization.importedIndex("Work/Agent Memory/projects/p/indexes/MEMORY.md",spaces))
  assertTrue(Organization.importedIndex("Agent Memory/projects/p/derived/memory_summary.md",spaces))
  assertFalse(Organization.importedIndex("Notes/MEMORY.md",spaces))
 }
 @Test fun notesTabLeavesMemoryAndIndexesStaySeparate(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  Credentials(context).host="http://10.0.2.2:18090";val spaces=Spaces(context);spaces.selected="personal";spaces.kind="memory"
  LocalStore(context).use{it.edit("Tests/Navigation fixture.md","# Navigation fixture")}
  ActivityScenario.launch(MainActivity::class.java).use{
   onView(withContentDescription("Notes")).perform(click());assertEquals("notes",spaces.kind)
   onView(withContentDescription("Memory")).perform(click());assertEquals("memory",spaces.kind)
   onView(withText("All memory ⌄")).perform(click());onView(withText("Imported indexes")).perform(click())
   onView(withText("Imported indexes ⌄")).check(matches(isDisplayed()))
   onView(withContentDescription("Notes")).perform(click());assertEquals("notes",spaces.kind)
   onView(withText("All notes ⌄")).check(matches(isDisplayed()))
  }
 }
}
