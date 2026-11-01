package app.quiccie.android

// Keep these colour roles aligned with web/src/design.css.
internal class Palette(private val dark:Boolean) {
    private fun tone(light:Long,night:Long)=(if(dark)night else light).toInt()
    val ink get()=tone(0xff242633,0xffeceef5)
    val muted get()=tone(0xff606477,0xffa9b0c3)
    val surface get()=tone(0xfff6f7fb,0xff171a22)
    val paper get()=tone(0xffffffff,0xff1e222d)
    val rail get()=tone(0xffeef0f6,0xff13161e)
    val tint get()=tone(0xffebe7fb,0xff302a48)
    val accent get()=tone(0xff6246b5,0xffc4b5fd)
    val onAction get()=tone(0xffffffff,0xff241940)
    val line get()=tone(0xffdce0e9,0xff343949)
    val warning get()=tone(0xff805300,0xfff2c66d)
}
