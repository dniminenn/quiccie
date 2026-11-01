package app.quiccie.android

import android.view.View
import android.view.ViewGroup
import android.widget.ListView
import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.*
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.hamcrest.Matchers.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class NavigationJourneyTest {
 private fun list(v:View):ListView? {if(v is ListView)return v;if(v is ViewGroup)for(i in 0 until v.childCount){list(v.getChildAt(i))?.let{return it}};return null}
 private fun ready(block:()->Unit){val end=android.os.SystemClock.uptimeMillis()+5000;while(true){try{block();return}catch(e:Throwable){if(android.os.SystemClock.uptimeMillis()>end)throw e;Thread.sleep(50)}}}
 @Test fun fullLibraryBrowseReturnAndSearchScope(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  Credentials(context).host="http://10.0.2.2:18090";Spaces(context).apply {selected="personal";kind="notes"}
  context.getSharedPreferences("appearance",0).edit().putString("recent","").commit()
  LocalStore(context).use{db->
   db.edit("Nav Stable/A/Overview.md","# A");db.edit("Nav Stable/A/Deep/Guide.md","# Guide");for(i in 1..30)db.edit("Nav Stable/A/Deep/Row $i.md","# Row $i")
   db.edit("Nav Stable/B/Overview.md","# B");db.edit("Nav Stable/Readme.md","# Collection")
   db.edit("Navigation anchor.md","# Anchor")
   db.edit("Agent Memory/projects/nav-review/projects/NavNormalProbe.md","# NavNormalProbe")
   db.edit("Agent Memory/projects/nav-review/indexes/MEMORY.md","# Imported index")
  }
  ActivityScenario.launch(MainActivity::class.java).use{scenario->
   var before=0
   ready{scenario.onActivity{a->before=list(a.window.decorView)!!.adapter.count;assertTrue(before>=5)}}
   onView(withText("All notes ⌄")).check(matches(isDisplayed()))
   onData(hasToString<JSONObject>(containsString("Navigation anchor.md"))).perform(click())
   onView(withContentDescription("Back to library")).perform(click())
   onView(withContentDescription("Notes")).perform(click())
   ready{scenario.onActivity{a->assertEquals(before,list(a.window.decorView)!!.adapter.count)}}
   onView(withText("All notes ⌄")).perform(click());onView(withText("Recent")).perform(click())
   ready{scenario.onActivity{a->assertEquals(1,list(a.window.decorView)!!.adapter.count)}}
   onView(withText("Recent ⌄")).perform(click());onView(withText("All notes")).perform(click())
   onView(withContentDescription("Browse")).perform(click())
   onData(hasToString<JSONObject>(containsString("Nav Stable"))).onChildView(withContentDescription("Open folder Nav Stable")).perform(click())
   onView(withContentDescription("Search")).perform(click())
   onView(withContentDescription("Browse")).perform(click())
   onView(withContentDescription("Folder path")).check(matches(withText("Personal / Nav Stable")))
   onView(withContentDescription("Project view")).perform(click())
   ready{onView(withContentDescription("Open folder A")).check(matches(isDisplayed()))}
   onView(withContentDescription("Open folder A")).perform(click())
   onView(withText("Up to projects")).perform(click())
   ready{onView(withContentDescription("Open folder A")).check(matches(isDisplayed()))}
   onView(withContentDescription("Open folder A")).perform(click())
   onView(withContentDescription("Open folder Deep")).perform(click())
   ready{scenario.onActivity{a->assertTrue(list(a.window.decorView)!!.adapter.count>=30)}}
   scenario.onActivity{a->list(a.window.decorView)!!.setSelectionFromTop(10,-12)}
   InstrumentationRegistry.getInstrumentation().waitForIdleSync()
   var scroll=0;scenario.onActivity{a->scroll=list(a.window.decorView)!!.firstVisiblePosition;assertTrue(scroll>0)}
   onView(withContentDescription("Search")).perform(click());onView(withContentDescription("Browse")).perform(click())
   ready{scenario.onActivity{a->assertEquals(scroll,list(a.window.decorView)!!.firstVisiblePosition)}}
   scenario.recreate()
   ready{scenario.onActivity{a->assertEquals(scroll,list(a.window.decorView)!!.firstVisiblePosition)}}
   onView(withContentDescription("Memory")).perform(click())
   onView(withText("All memory ⌄")).perform(click());onView(withText("Imported indexes")).perform(click())
   onView(withContentDescription("Search")).perform(click())
   onView(withContentDescription("Search scope")).check(matches(withText(containsString("Agent memory"))))
   onView(withContentDescription("Search query")).perform(replaceText("NavNormalProbe"),androidx.test.espresso.action.ViewActions.closeSoftKeyboard())
   ready{onView(allOf(withId(android.R.id.text1),withText("NavNormalProbe"))).check(matches(isDisplayed()))}
   onView(withContentDescription("Notes")).perform(click())
   onView(withText("All notes ⌄")).check(matches(isDisplayed()))
  }
 }
 @Test fun emptyRecentAndReadableImportedTitle(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  Credentials(context).host="http://10.0.2.2:18090";Spaces(context).apply {selected="personal";kind="notes"}
  context.getSharedPreferences("appearance",0).edit().putString("recent","").commit()
  LocalStore(context).use{it.edit("Navigation empty recent.md","# Present note")}
  ActivityScenario.launch(MainActivity::class.java).use{scenario->
   onView(withText("All notes ⌄")).perform(click());onView(withText("Recent")).perform(click())
   ready{scenario.onActivity{a->assertEquals(0,list(a.window.decorView)!!.adapter.count)}}
  }
  val name="01a08430-3a60-740d-b27f-cba2e9c62c8a-router_override"
  assertEquals("router override",Organization.note("Agent Memory/projects/example-network/derived/$name.md","# $name").title)
  assertEquals(name,Organization.note("Personal notes/$name.md","# $name").title)
 }
}
