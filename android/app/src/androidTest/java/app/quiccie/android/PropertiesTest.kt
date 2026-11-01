package app.quiccie.android

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Test
import org.junit.Assert.*
import org.junit.runner.RunWith
import org.json.JSONObject
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.espresso.web.sugar.Web.onWebView
import androidx.test.espresso.web.webdriver.DriverAtoms.*
import androidx.test.espresso.web.webdriver.Locator
import androidx.test.espresso.web.assertion.WebViewAssertions.webMatches
import androidx.test.platform.app.InstrumentationRegistry
import org.hamcrest.Matchers.containsString

@RunWith(AndroidJUnit4::class)
class PropertiesTest {
 @Test fun metadataUsesYamlTypesAndKeepsScopes(){
  val p="Agent Memory/projects/test/n.md"
  val content="---\nname: \"Human # title\" # comment\ndescription: >\n  Folded\n  description\nflag: null\nmetadata:\n  type: project\n---\nBody"
  val note=Organization.note(p,content);assertEquals("Human # title",note.title);assertEquals("Folded description",note.excerpt)
  assertTrue(Organization.matches(content,p,"[flag]"));assertTrue(Organization.matches(content,p,"[metadata.type:project]"));assertFalse(Organization.matches(content,p,"[missing]"))
  val personal=JSONObject().put("path","Secret.md").put("content","---\naliases: [Private]\n---\nPrivate")
  val work=JSONObject().put("path","Work/Folder/Other.md").put("content","Work")
  assertNull(Organization.resolve("Secret","Work/Home.md",listOf(personal,work)))
  assertNull(Organization.resolve("Private","Work/Home.md",listOf(personal,work)))
  assertEquals("Work/Folder/Other.md",Organization.resolve("Other#Heading","Work/Home.md",listOf(personal,work))?.getString("path"))
  assertEquals("n",Organization.note(p,"---\nname: 123\n---\nBody").title)
 }
 @Test fun nativePropertyDialogSavesWithoutChangingBody(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  Credentials(context).host="http://10.0.2.2:18090";Spaces(context).apply {selected="personal";kind="notes"}
  val path="Tests/Native property ${System.currentTimeMillis()}.md"
  val body="\n    code stays\n\nTrailing spaces.  \n"
  LocalStore(context).use{it.edit(path,"---\ntitle: Native property\ncomplete: false\n---\n"+body)}
  ActivityScenario.launch(MainActivity::class.java).use{
   onView(withText("Search")).perform(click());onView(withHint("Search notes")).perform(replaceText(path),closeSoftKeyboard());onView(withId(android.R.id.text1)).perform(click())
   onWebView().withElement(findElement(Locator.CSS_SELECTOR,".properties summary")).perform(webClick())
   onWebView().withElement(findElement(Locator.CSS_SELECTOR,"[data-property-edit=complete]")).perform(webClick())
   onWebView().withElement(findElement(Locator.CSS_SELECTOR,".property-dialog input[type=checkbox]")).perform(webClick())
   onWebView().withElement(findElement(Locator.CSS_SELECTOR,".property-dialog button[type=submit]")).perform(webClick())
   val deadline=android.os.SystemClock.uptimeMillis()+5000
   while(true){val saved=LocalStore(context).use{db->db.note(path)!!.getString("content")};if(saved.contains("complete: true")){assertEquals(body,saved.substringAfter("\n---\n"));break};if(android.os.SystemClock.uptimeMillis()>deadline)fail("Property did not save");Thread.sleep(40)}
   onWebView().withElement(findElement(Locator.CSS_SELECTOR,".properties summary")).perform(webClick())
   onWebView().withElement(findElement(Locator.CSS_SELECTOR,"[data-property-edit=title]")).perform(webClick())
   androidx.test.espresso.Espresso.pressBack()
   onWebView().withElement(findElement(Locator.ID,"android-reader")).check(webMatches(getText(),containsString("code stays")))
  }
 }
}
