package app.quiccie.android

import android.view.View
import android.view.ViewGroup
import android.widget.Button
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.math.pow

@RunWith(AndroidJUnit4::class)
class DesignTest {
 @Test fun readableColoursAndThemeControls(){
  val ins=InstrumentationRegistry.getInstrumentation();val context=ins.targetContext
  Credentials(context).host="http://10.0.2.2:18090"
  Spaces(context).apply {selected="personal";kind="notes"}
  LocalStore(context).use {it.edit("Design preview/Overview.md","# Design preview\n\nNotes are available offline.\n\n## Reading\n\nUse a clear heading and short paragraphs.\n\n> A note to keep.\n\n- First item\n- Second item")}
  fun luminance(c:Int):Double {val values=listOf((c shr 16)and 255,(c shr 8)and 255,c and 255).map{val n=it/255.0;if(n<=.04045)n/12.92 else ((n+.055)/1.055).pow(2.4)};return values[0]*.2126+values[1]*.7152+values[2]*.0722}
  fun contrast(fg:Int,bg:Int):Double {val a=luminance(fg);val b=luminance(bg);return (maxOf(a,b)+.05)/(minOf(a,b)+.05)}
  fun find(v:View,label:String):View? {if(v.contentDescription==label)return v;if(v is ViewGroup)for(i in 0 until v.childCount){find(v.getChildAt(i),label)?.let{return it}};return null}
  for(dark in listOf(false,true)){
   val p=Palette(dark)
   for(bg in listOf(p.surface,p.paper,p.rail,p.tint)){
    assertTrue("Body text contrast",contrast(p.ink,bg)>=4.5)
    assertTrue("Secondary text contrast",contrast(p.muted,bg)>=4.5)
   }
   assertTrue("Action contrast",contrast(p.onAction,p.accent)>=4.5)
   assertTrue("Selected tab contrast",contrast(p.accent,p.tint)>=4.5)
   context.getSharedPreferences("appearance",0).edit().putBoolean("dark",dark).putString("recent","").commit()
   ActivityScenario.launch(MainActivity::class.java).use {scenario->
    ins.waitForIdleSync()
    scenario.onActivity {a->
     val add=find(a.window.decorView,"New note") as Button
     val selected=find(a.window.decorView,"Notes") as Button
     val memory=find(a.window.decorView,"Memory") as Button
     assertEquals(p.onAction,add.currentTextColor)
     assertEquals(p.accent,selected.currentTextColor)
     assertEquals(p.muted,memory.currentTextColor)
     assertTrue(add.background is android.graphics.drawable.RippleDrawable)
    }
    Thread.sleep(600)
    val shot=ins.uiAutomation.executeShellCommand("screencap -p /sdcard/Download/quiccie-design-${if(dark)"dark"else"light"}.png")
    android.os.ParcelFileDescriptor.AutoCloseInputStream(shot).use{it.readBytes()}
   }
  }
 }
}
