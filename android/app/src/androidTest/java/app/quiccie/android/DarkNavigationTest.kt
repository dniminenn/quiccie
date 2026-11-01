package app.quiccie.android

import androidx.test.core.app.ActivityScenario
import androidx.test.espresso.Espresso.onData
import org.hamcrest.Matchers.hasToString
import org.hamcrest.Matchers.containsString
import org.json.JSONObject
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.action.ViewActions.*
import androidx.test.espresso.matcher.ViewMatchers.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import android.widget.Button
import android.widget.LinearLayout
import android.view.View
import android.view.ViewGroup
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class DarkNavigationTest {
 @Test fun darkControlsAndNestedFolders(){
  val ins=InstrumentationRegistry.getInstrumentation();val context=ins.targetContext
  Credentials(context).host="http://10.0.2.2:18090"
  Spaces(context).apply {selected="personal";kind="notes"}
  context.getSharedPreferences("appearance",0).edit().putBoolean("dark",true).putString("recent","").commit()
  LocalStore(context).use {it.edit("Dark navigation/Child/Deep.md","# Deep\n\nA nested note.");it.edit("Dark navigation/Direct.md","# Direct\n\nA direct note.")}
  fun find(v:View,label:String):View? {if(v.contentDescription==label)return v;if(v is ViewGroup)for(i in 0 until v.childCount){val hit=find(v.getChildAt(i),label);if(hit!=null)return hit};return null}
  ActivityScenario.launch(MainActivity::class.java).use {scenario->
   scenario.onActivity {a->
    val root=a.window.decorView;val files=find(root,"Browse")!!;val projects=find(root,"Search")!!
    val density=a.resources.displayMetrics.density
    assertTrue(files.height>=48*density);assertTrue(projects.left-(files.left+files.width)>=8*density-1)
    assertFalse(a.window.isNavigationBarContrastEnforced)
    assertEquals(0,a.window.insetsController!!.systemBarsAppearance and android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
   }
   onView(withContentDescription("New note")).perform(click())
   onView(withText("Cancel")).perform(click())
   onView(withContentDescription("Browse")).perform(click())
   onData(hasToString<JSONObject>(containsString("Dark navigation"))).onChildView(withContentDescription("Open folder Dark navigation")).perform(click())
   val deadline=android.os.SystemClock.uptimeMillis()+5000
   while(true){try{onView(withContentDescription("Open folder Child")).check {v,e->if(e!=null)throw e;assertNotNull(v)};break}catch(e:Throwable){if(android.os.SystemClock.uptimeMillis()>deadline)throw e;Thread.sleep(40)}}
   onView(withText("Direct")).check {v,e->if(e!=null)throw e;assertNotNull(v)}
   onView(withContentDescription("Open folder Child")).perform(click())
   onView(withText("Deep")).perform(click())
   onView(withContentDescription("Full folder path")).check {v,e->if(e!=null)throw e;assertNotNull(v)}
   onView(withContentDescription("Note actions")).perform(click())
   onView(withText("Close")).perform(click())
   scenario.recreate()
   onView(withContentDescription("Full folder path")).check {v,e->if(e!=null)throw e;assertNotNull(v)}
  }
 }
}
