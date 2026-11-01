package app.quiccie.android

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.Espresso.onData
import org.hamcrest.Matchers.hasToString
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.espresso.web.assertion.WebViewAssertions.webMatches
import androidx.test.espresso.web.sugar.Web.onWebView
import androidx.test.espresso.web.webdriver.DriverAtoms.*
import androidx.test.espresso.web.webdriver.Locator
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.hamcrest.Matchers.containsString
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class EditorTest {
    @org.junit.Before fun useLocalTestServer(){Credentials(InstrumentationRegistry.getInstrumentation().targetContext).host="http://10.0.2.2:18090";Spaces(InstrumentationRegistry.getInstrumentation().targetContext).apply {selected="personal";kind="notes"}}

    private fun waitForRows(){
        val deadline=android.os.SystemClock.uptimeMillis()+10000
        while(true){
            try {onView(isAssignableFrom(android.widget.ListView::class.java)).check {view,error->if(error!=null)throw error;assertTrue((view as android.widget.ListView).count>0)};return}
            catch(e:Throwable){if(android.os.SystemClock.uptimeMillis()>=deadline)throw e;android.os.SystemClock.sleep(40)}
        }
    }

    @Test
    fun editLocalRichText() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val path = "Tests/Android editor UI.md"
        LocalStore(context).use { it.edit(path, "# Android editor UI\n\nA local editor test.\n") }
        ActivityScenario.launch(MainActivity::class.java).use {
            onView(withText("Search")).perform(click())
            onView(withHint("Search notes"))
                .perform(replaceText("Android editor UI"), closeSoftKeyboard())
            onView(withId(android.R.id.text1)).perform(click())
            onWebView()
                .withElement(findElement(Locator.ID, "android-reader"))
                .check(webMatches(getText(), containsString("A local editor test.")))
            onView(withContentDescription("Note actions")).perform(click())
            onView(withText("Edit Markdown")).perform(click())
            onView(withClassName(containsString("EditText")))
                .perform(
                    replaceText("# Android editor UI\n\nAn offline UI change.\n"),
                    closeSoftKeyboard(),
                )
            LocalStore(context).use { db ->
                assertTrue(db.note(path)!!.getString("content").contains("An offline UI change."))
            }
            onView(withText("Done")).perform(click())
            onWebView()
                .withElement(findElement(Locator.ID, "android-reader"))
                .check(webMatches(getText(), containsString("An offline UI change.")))
        }
    }
    @Test
    fun browseProjectsAndPreserveHTML() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val path = "Agent Memory/projects/review-test/HTML.md"
        Spaces(context).kind="memory"
        val original = "# HTML\n\n<div>Keep the HTML.</div>\n"
        LocalStore(context).use { it.edit(path, original) }
        ActivityScenario.launch(MainActivity::class.java).use {
            onView(withContentDescription("Browse")).perform(click())
            onView(withContentDescription("Project view")).perform(click())
            waitForRows()
            onData(hasToString<JSONObject>(containsString("review-test"))).onChildView(withContentDescription("Open folder Personal / review-test")).perform(click())
            onView(withText("HTML")).perform(click())
            onWebView().withElement(findElement(Locator.ID, "android-reader"))
                .check(webMatches(getText(), containsString("Keep the HTML.")))
            onView(withContentDescription("Note actions")).perform(click())
            onView(withText("Edit Markdown")).perform(click())
            onView(withClassName(containsString("EditText"))).perform(replaceText(original+"A source edit.\n"),closeSoftKeyboard())
            LocalStore(context).use { db -> assertEquals(original+"A source edit.\n",db.note(path)!!.getString("content")) }
        }
    }

    @Test
    fun restoreSourceEditorAfterRotation() {
        val context=InstrumentationRegistry.getInstrumentation().targetContext
        val path="Tests/Rotation ${System.currentTimeMillis()}.md"
        LocalStore(context).use {it.edit(path,"# Rotation\n\nKeep this note.")}
        ActivityScenario.launch(MainActivity::class.java).use {scenario->
            onView(withText("Search")).perform(click())
            onView(withHint("Search notes")).perform(replaceText(path),closeSoftKeyboard())
            onView(withId(android.R.id.text1)).perform(click())
            onView(withContentDescription("Note actions")).perform(click())
            onView(withText("Edit Markdown")).perform(click())
            onView(withClassName(containsString("EditText"))).perform(replaceText("# Rotation\n\nAn edit before rotation."),closeSoftKeyboard())
            scenario.recreate()
            onView(withText("Done")).check(androidx.test.espresso.assertion.ViewAssertions.matches(isDisplayed()))
            onView(withClassName(containsString("EditText"))).check(androidx.test.espresso.assertion.ViewAssertions.matches(withText("# Rotation\n\nAn edit before rotation.")))
            onView(withText("Done")).perform(click())
            onWebView().withElement(findElement(Locator.ID,"android-reader")).check(webMatches(getText(),containsString("An edit before rotation.")))
        }
    }
    @Test
    fun cancelNewNoteAndRetainInvalidInput() {
        ActivityScenario.launch(MainActivity::class.java).use {
            onView(withContentDescription("New note")).perform(click())
            onView(withText("Cancel")).perform(click())
            onView(withContentDescription("New note")).perform(click())
            onView(withHint("Ideas/My note.md")).perform(replaceText("../bad"),closeSoftKeyboard())
            onView(withText("Create")).perform(click())
            onView(withHint("Ideas/My note.md")).check(androidx.test.espresso.assertion.ViewAssertions.matches(withText("../bad")))
            onView(withText("Cancel")).perform(click())
        }
    }

}
