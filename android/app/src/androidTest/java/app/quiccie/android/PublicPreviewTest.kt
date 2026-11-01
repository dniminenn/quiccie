package app.quiccie.android

import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class PublicPreviewTest {
 @Test fun captureSyntheticLibrary(){
  val ins=InstrumentationRegistry.getInstrumentation()
  val context=ins.targetContext
  require(android.os.Build.FINGERPRINT.contains("generic")||android.os.Build.MODEL.contains("sdk")){"Use the test emulator."}
  Connection(context).login("http://10.0.2.2:18090","owner","quiccie-test-password")
  Sync.run(context)
  assertEquals("synced",Sync.state.phase)
  Spaces(context).apply{selected="personal";kind="notes"}
  context.getSharedPreferences("appearance",0).edit().putBoolean("dark",true).putString("recent","").commit()
  ActivityScenario.launch(MainActivity::class.java).use {
   ins.waitForIdleSync()
   Thread.sleep(800)
   val shot=ins.uiAutomation.executeShellCommand("screencap -p /sdcard/Download/quiccie-public-android.png")
   android.os.ParcelFileDescriptor.AutoCloseInputStream(shot).use{it.readBytes()}
  }
 }
}
