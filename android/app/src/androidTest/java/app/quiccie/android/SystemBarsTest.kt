package app.quiccie.android

import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SystemBarsTest {
 @Test fun controlsStayInsideSystemBars(){
  val context=InstrumentationRegistry.getInstrumentation().targetContext
  Credentials(context).host="http://10.0.2.2:18090"
  Spaces(context).apply {selected="personal";kind="notes"}
  fun find(v:View,label:String):View? {
   if(v.contentDescription==label)return v
   if(v is ViewGroup)for(i in 0 until v.childCount){val result=find(v.getChildAt(i),label);if(result!=null)return result}
   return null
  }
  ActivityScenario.launch(MainActivity::class.java).use {scenario->
   InstrumentationRegistry.getInstrumentation().waitForIdleSync()
   scenario.onActivity {a->
    val decor=a.window.decorView
    val insets=decor.rootWindowInsets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
    val bounds=a.windowManager.currentWindowMetrics.bounds
    fun rect(v:View):Rect {val xy=IntArray(2);v.getLocationOnScreen(xy);return Rect(xy[0],xy[1],xy[0]+v.width,xy[1]+v.height)}
    val nav=rect(find(decor,"Browse")!!.parent as View)
    val header=rect(find(decor,"Settings")!!.parent as View)
    assertTrue("Bottom tabs overlap Android navigation: $nav, $insets",nav.bottom<=bounds.bottom-insets.bottom)
    assertTrue("Header overlaps Android status: $header, $insets",header.top>=bounds.top+insets.top)
    assertTrue("Controls overlap left system inset",nav.left>=bounds.left+insets.left)
    assertTrue("Controls overlap right system inset",nav.right<=bounds.right-insets.right)
    assertTrue("Bottom tabs have no height",nav.height()>0)
   }
  }
 }
}
