package app.quiccie.android

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.Espresso.onData
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.hamcrest.Matchers.hasToString
import org.hamcrest.Matchers.containsString
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class OrganizationTest {
 private val spaces=listOf(Space("personal","Personal","","global"),Space("work","Work","Work/","work"),Space("gig","Side gig","Spaces/gig/","gig"))
 @Test fun labelsKeepCanonicalPathsAndSeparateCategories(){
  val root="Work/Agent Memory/projects/example-service"
  assertEquals(listOf("Work","Agent memory","example-service","Project notes"),Organization.crumbs("$root/projects",spaces).map{it.label})
  assertEquals("Work/Agent Memory",Organization.parent(root,spaces))
  assertEquals("References",Organization.folderLabel("$root/references",spaces))
  assertEquals("projects",Organization.folderLabel("Work/Plans/projects",spaces))
  assertEquals("Side gig / Agent memory / same / Project notes",Organization.pathLabel("Spaces/gig/Agent Memory/projects/same/projects",spaces))
  val info=Organization.note("$root/projects/project_svm_architecture.md","---\nname: SVM HA pair architecture\ndescription: How the pair keeps\n  the service available.\n---\n\n> Historical project memory for example-service. Old context only.\n\nThe original text.")
  assertEquals("SVM HA pair architecture",info.title);assertEquals("How the pair keeps the service available.",info.excerpt);assertTrue(info.historical)
 }
 @Test fun nativeProjectUsesLabelsAndPreservesContent(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  Credentials(context).host="http://10.0.2.2:18090"
  val choice=Spaces(context);choice.selected="work";choice.kind="memory"
  val root="Work/Agent Memory/projects/ui-tree-audit"
  val path="$root/projects/project_architecture.md"
  val content="---\nname: Readable architecture\ndescription: A useful summary.\n---\n\n> Historical project memory for ui-tree-audit. Old context only.\n\nOriginal text."
  LocalStore(context).use{it.edit(path,content)}
  try{ActivityScenario.launch(MainActivity::class.java).use {
   onView(withContentDescription("Browse")).perform(click())
            onView(withContentDescription("Project view")).perform(click())
   val deadline=android.os.SystemClock.uptimeMillis()+5000
   while(true){try{onView(isAssignableFrom(android.widget.ListView::class.java)).check {v,e->if(e!=null)throw e;assertTrue((v as android.widget.ListView).count>0)};break}catch(e:Throwable){if(android.os.SystemClock.uptimeMillis()>deadline)throw e;Thread.sleep(40)}}
   onData(hasToString<JSONObject>(containsString("ui-tree-audit"))).onChildView(withContentDescription("Open folder Work / ui-tree-audit")).perform(click())
   onData(hasToString<JSONObject>(containsString("projects\\/ui-tree-audit\\/projects"))).onChildView(withContentDescription("Open folder Project notes")).perform(click())
   onData(hasToString<JSONObject>(containsString("project_architecture.md"))).perform(click())
   onView(withContentDescription("Full folder path")).check{v,e->if(e!=null)throw e;assertTrue((v as android.widget.TextView).text.contains("Work / Agent memory / ui-tree-audit / Project notes"))}
   onView(withContentDescription("Note actions")).perform(click());onView(withText("Note location")).perform(scrollTo(),click());onView(withText(path)).check{v,e->if(e!=null)throw e;assertNotNull(v)}
   LocalStore(context).use{assertEquals(content,it.note(path)!!.getString("content"))}
  }}finally{choice.selected="personal";choice.kind="notes"}
 }
}
