package app.quiccie.android

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.*
import androidx.webkit.WebViewAssetLoader
import java.net.URLEncoder
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var db: LocalStore
    private lateinit var layout: LinearLayout
    private lateinit var status: TextView
    private val worker = Executors.newSingleThreadExecutor()
    private val libraryWorker = Executors.newSingleThreadExecutor()
    private var current: String? = null
    private var web: WebView? = null
    private var source: EditText? = null
    private var content = ""
    private var editorBase: String? = null
    private var query = ""
    private var folder = ""
    private val spaces by lazy { Spaces(this) }
    private var projects = false
    private var librarySnapshot=listOf<JSONObject>()
    private var libraryGeneration=0
    private var refreshLibrary: (() -> Unit)? = null
    private var section = "Notes"
    private var noteFilter = "All notes"
    private data class LibraryLocation(val folder:String,val query:String,val filter:String,val position:Int=0,val top:Int=0)
    private val locations=mutableMapOf<String,LibraryLocation>()
    private val browseModes=mutableMapOf<String,String>()
    private var libraryList:ListView?=null
    private fun locationKey()=spaces.selected+"|"+spaces.kind+"|"+section
    private fun scopeKey()=spaces.selected+"|"+spaces.kind
    private fun allFilter()=if(spaces.kind=="memory")"All memory"else"All notes"
    private fun rememberLocation(){
        if(current!=null)return
        val list=libraryList
        locations[locationKey()]=LibraryLocation(folder,query,noteFilter,list?.firstVisiblePosition?:0,list?.getChildAt(0)?.top?:0)
        if(section in listOf("Files","Projects"))browseModes[scopeKey()]=section
    }
    private fun restoreLocation(){
        val saved=locations[locationKey()]
        folder=saved?.folder?:"";query=saved?.query?:"";noteFilter=saved?.filter?:allFilter()
        if(section=="Search")noteFilter=allFilter()
        projects=section=="Projects"
    }
    private fun navigate(name:String){
        rememberLocation()
        if(name=="Notes"||name=="Memory")spaces.kind=if(name=="Memory")"memory"else"notes"
        section=if(name=="Browse")browseModes[scopeKey()]?:"Files"else name
        restoreLocation();hideKeyboard();library()
    }
    private fun openFolder(path:String){
        rememberLocation();folder=path;query="";noteFilter=allFilter()
        locations[locationKey()]=LibraryLocation(folder,query,noteFilter)
        library()
    }
    private fun visibleProjectRoots():List<String>{
        val paths=librarySnapshot.filter{spaces.contains(it.getString("path"))&&spaces.containsKind(it.getString("path"))}.map{it.getString("path")}
        if(spaces.kind=="notes")return Organization.noteProjects(paths,spaces.all())
        return paths.mapNotNull {path->val space=spaces.all().find{it.id==spaces.pathSpace(path)}?:return@mapNotNull null
            val prefix=space.prefix+"Agent Memory/";if(!path.startsWith(prefix))return@mapNotNull null
            val rest=path.removePrefix(prefix);if(rest.startsWith("projects/")&&rest.removePrefix("projects/").contains('/'))prefix+"projects/"+rest.removePrefix("projects/").substringBefore('/')
            else if(rest.contains('/'))prefix+rest.substringBefore('/')else null
        }.distinct()
    }
    private fun browseParent()=Organization.browseParent(folder,if(projects)visibleProjectRoots()else emptyList(),spaces.all())
    private var editing = false
    private data class FailedDraft(val text:String,val base:String?)
    private var saveFailed = false
    private var editButton: Button? = null
    private var localStatus: TextView? = null
    private val expandedFolders = mutableSetOf<String>()
    private var dark = false
    private val prefs by lazy { getSharedPreferences("appearance", MODE_PRIVATE) }
    private val palette get()=Palette(dark)
    private val green get()=palette.accent
    private val ink get()=palette.ink
    private val muted get()=palette.muted
    private val paper get()=palette.surface
    private val card get()=palette.paper
    private val rail get()=palette.rail
    private val tint get()=palette.tint
    private val syncListener: (SyncState)->Unit = { state -> runOnUiThread {
        if(!isDestroyed && ::status.isInitialized) {
            paintStatus()
            if(state.phase !in listOf("sending","receiving"))refreshLibrary?.invoke()
        }
    } }
    private fun feedback(color:Int,radius:Int=12,border:Boolean=false):android.graphics.drawable.Drawable {
        val base=rounded(color,radius).apply {if(border)setStroke(dp(1),palette.line)}
        return android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf((green and 0x00ffffff) or 0x26000000),base,rounded(Color.WHITE,radius))
    }
    private fun rounded(color:Int,radius:Int=14)=android.graphics.drawable.GradientDrawable().apply { setColor(color);cornerRadius=dp(radius).toFloat() }
    private fun paintStatus(){
        if(!::status.isInitialized)return
        status.text=if(saveFailed)"Cannot save on this device" else Sync.state.label()+"  ›"
        status.setTextColor(if(Sync.state.phase in listOf("offline","error","auth","conflict","storage")) palette.warning else muted)
    }
    private fun applyTheme(){
        window.decorView.setBackgroundColor(rail)
        window.statusBarColor=Color.TRANSPARENT;window.navigationBarColor=Color.TRANSPARENT
        if(android.os.Build.VERSION.SDK_INT>=29){window.isNavigationBarContrastEnforced=false;window.isStatusBarContrastEnforced=false}
        if(android.os.Build.VERSION.SDK_INT>=30){
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.setSystemBarsAppearance(
                if(dark)0 else android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
                android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS)
        }else window.decorView.systemUiVisibility=if(dark)0 else View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
    }
    override fun onWindowFocusChanged(focused:Boolean){super.onWindowFocusChanged(focused);if(focused)applyTheme()}



    private fun dp(n: Int) = (n * resources.displayMetrics.density).toInt()

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        dark=prefs.getBoolean("dark",false)
        applyTheme()
        db = LocalStore(this)
        Sync.listeners.add(syncListener)
        Sync.update(this)
        window.decorView.setOnApplyWindowInsetsListener { v, i ->
            if(android.os.Build.VERSION.SDK_INT>=30){
                val bars=i.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout())
                val ime=i.getInsets(android.view.WindowInsets.Type.ime())
                v.findViewById<View>(android.R.id.content).setPadding(bars.left,bars.top,bars.right,maxOf(bars.bottom,ime.bottom))
            }else v.findViewById<View>(android.R.id.content).setPadding(
                i.systemWindowInsetLeft,
                i.systemWindowInsetTop,
                i.systemWindowInsetRight,
                i.systemWindowInsetBottom,
            )
            i
        }
        Sync.schedule(this)
        section=state?.getString("section") ?: if(spaces.kind=="memory")"Memory"else"Notes"
        if(section=="Notes"&&spaces.kind=="memory")section="Memory"
        noteFilter=state?.getString("filter") ?: allFilter()
        folder=state?.getString("folder") ?: ""
        query=state?.getString("query") ?: ""
        projects=section=="Projects"
        expandedFolders.addAll(state?.getStringArrayList("expanded") ?: arrayListOf())
        editing=state?.getBoolean("editing") ?: false
        state?.getString("locations")?.let { saved->try {val obj=JSONObject(saved);obj.keys().forEach {key->val row=obj.getJSONObject(key);locations[key]=LibraryLocation(row.optString("folder"),row.optString("query"),row.optString("filter"),row.optInt("position"),row.optInt("top"))}}catch(_:Exception){} }
        state?.getString("browseModes")?.let { saved->try{val obj=JSONObject(saved);obj.keys().forEach{browseModes[it]=obj.getString(it)}}catch(_:Exception){} }
        val previous=state?.getString("current")
        if (Connection(this).credentials.token.isEmpty() && db.library().isEmpty()) login()
        else if(previous!=null && db.note(previous)!=null){
            open(previous)
            val retained=lastNonConfigurationInstance as? FailedDraft
            val buffer=retained?.text ?: state?.getString("failed-buffer")
            if(buffer!=null){content=buffer;editorBase=if(retained!=null)retained.base else state?.getString("failed-base");saveFailed=true;paintStatus()}
            if(state?.getBoolean("source")==true)toggleSource()
        } else library()
        sync()
    }

    private fun column(): LinearLayout {
        val c = LinearLayout(this)
        c.orientation = LinearLayout.VERTICAL
        c.setPadding(dp(20), dp(8), dp(20), dp(8))
        c.setBackgroundColor(paper)
        return c
    }

    private fun text(s: String, size: Float = 14f) =
        TextView(this).apply {
            text = s
            textSize = size
            setTextColor(ink)
            setPadding(0, dp(4), 0, dp(4))
        }

    private fun button(s: String, action: () -> Unit) =
        Button(this).apply {
            text = s
            stateListAnimator=null
            elevation=0f
            backgroundTintList=null
            isAllCaps = false
            setTextColor(green)
            textSize=14f
            minHeight=dp(48)
            minimumHeight=dp(48)
            background=feedback(card,12,true)
            layoutParams=LinearLayout.LayoutParams(-2,dp(48)).apply {topMargin=dp(4);bottomMargin=dp(4)}
            setPadding(dp(12),0,dp(12),0)
            setOnClickListener { action() }
        }

    private fun icon(name:String):android.graphics.drawable.Drawable {
        val id=resources.getIdentifier("ic_"+name,"drawable",packageName)
        return getDrawable(id)!!.mutate().apply {setTint(green);setBounds(0,0,dp(21),dp(21))}
    }
    private fun iconButton(name:String,label:String,action:()->Unit)=button(""){action()}.apply {contentDescription=label;setCompoundDrawables(icon(name),null,null,null);setPadding(dp(13),0,dp(13),0);background=feedback(paper,12)}
    private fun balance(row: LinearLayout) {
        for (i in 0 until row.childCount) {
            val v = row.getChildAt(i)
            v.layoutParams = LinearLayout.LayoutParams(0, dp(48), 1f)
            if (v is Button) {
                v.textSize = 12f
                v.minWidth = 0
                v.minimumWidth = 0
                v.setPadding(dp(3), 0, dp(3), 0)
            }
        }
    }

    private fun row() = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        dividerDrawable=android.graphics.drawable.GradientDrawable().apply {setColor(Color.TRANSPARENT);setSize(dp(12),1)}
        showDividers=LinearLayout.SHOW_DIVIDER_MIDDLE
    }

    private fun root(title: String) {
        refreshLibrary=null
        web?.destroy();web=null;source=null;localStatus=null
        layout=column();setContentView(layout);applyTheme();window.decorView.requestApplyInsets()
        val head=row().apply { gravity=android.view.Gravity.CENTER_VERTICAL }
        if(current!=null) head.addView(iconButton("back","Back to library"){backToLibrary()},LinearLayout.LayoutParams(dp(48),dp(48)))
        val label=text(title,if(current==null)22f else 16f).apply { typeface=android.graphics.Typeface.create("sans-serif-medium",0);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END;setPadding(dp(8),0,dp(8),0) }
        head.addView(label,LinearLayout.LayoutParams(0,dp(64),1f))
        if(current!=null){
            editButton=button(if(editing)"Done" else "Edit") { toggleEditing() }
            head.addView(editButton)
            head.addView(iconButton("more","Note actions"){noteActions()},LinearLayout.LayoutParams(dp(48),dp(48)))
        }else head.addView(iconButton("settings","Settings"){settings()},LinearLayout.LayoutParams(dp(48),dp(48)))
        layout.addView(head)
        status=text("",13f).apply { minHeight=dp(48);gravity=android.view.Gravity.CENTER_VERTICAL;setTextColor(muted);isClickable=true;isFocusable=true;setOnClickListener { syncPanel() } }
        layout.addView(status);paintStatus()
    }
    private fun backToLibrary(){ if(saveFailed){message("Keep this note open. Retry the save first.");return};hideKeyboard();editing=false;library() }
    private fun hideKeyboard(){(getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager).hideSoftInputFromWindow(layout.windowToken,0);layout.clearFocus()}
    private fun toggleEditing(){
        if(editing){
            if(saveFailed && !saveLocal(content))return
            if(source!=null){layout.removeView(source);source=null;web?.visibility=View.VISIBLE;web?.evaluateJavascript("window.setNote("+JSONObject.quote(content)+")",null)}
            editing=false;hideKeyboard();web?.evaluateJavascript("window.setEditing(false)",null);sync()
        }else {editing=true;web?.evaluateJavascript("window.setEditing(true)",null)}
        editButton?.text=if(editing)"Done" else "Edit"
    }
    private fun saveLocal(value:String):Boolean {
        val path=current ?: return false
        val prior=content;content=value
        return try { db.edit(path,value,false,editorBase,true,prior);saveFailed=false;localStatus?.text="Saved on this device";Sync.localChanged(this);true }
        catch(e:Exception){saveFailed=true;localStatus?.text="Cannot save. Keep this note open.";paintStatus();false}
    }
    private fun dialogBuilder()=AlertDialog.Builder(this,if(dark)android.R.style.Theme_Material_Dialog_Alert else android.R.style.Theme_Material_Light_Dialog_Alert)
    private fun sheet(title:String,content:View):AlertDialog {
        val scroll=ScrollView(this).apply {addView(content);isFillViewport=false}
        val dialog=dialogBuilder().setTitle(title).setView(scroll).setNegativeButton("Close",null).create()
        dialog.show();dialog.window?.apply {setGravity(android.view.Gravity.BOTTOM);setLayout(-1,-2);setBackgroundDrawable(rounded(card,24));navigationBarColor=rail;if(android.os.Build.VERSION.SDK_INT>=29)isNavigationBarContrastEnforced=false}
        return dialog
    }
    private fun noteActions(){
        val box=column();val dialog=sheet("Note actions",box)
        fun action(name:String,fn:()->Unit){box.addView(button(name){dialog.dismiss();fn()},LinearLayout.LayoutParams(-1,dp(52)).apply {bottomMargin=dp(12)})}
        action("Edit Markdown"){editing=true;editButton?.text="Done";if(source==null)toggleSource()}
        action("Note history"){history()}
        action("Add attachment"){startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {type="*/*";addCategory(Intent.CATEGORY_OPENABLE)},100)}
        action("Note location"){
            val box=column();box.addView(text(current?:"",14f).apply {setTextIsSelectable(true)})
            sheet("Stored path",box)
        }
        action("New note"){newNote()}
    }
    private fun settings(){
        val box=column();box.addView(text(spaces.all().find {it.id==spaces.selected}?.name?:"All spaces",18f));box.addView(text(Connection(this).credentials.host,13f))
        val dialog=sheet("Settings",box)
        box.addView(button("Add space"){dialog.dismiss();addSpace()})
        box.addView(button("Sync details"){dialog.dismiss();syncPanel()})
        box.addView(button("Change theme"){dialog.dismiss();dark=!dark;prefs.edit().putBoolean("dark",dark).apply();applyTheme();val path=current;if(path==null)library()else open(path)})
        box.addView(button("Account"){dialog.dismiss();if(saveFailed){message("Retry the local save first.")}else login()})
    }
    private fun syncPanel(){
        val box=column();val summary=text("",17f);box.addView(summary)
        val detail=text("",13f);box.addView(detail)
        val action=button("Check now"){};box.addView(action)
        val dialog=sheet("Sync",box)
        fun update(){val s=Sync.state;summary.text=if(saveFailed)"Cannot save on this device" else s.label();detail.text="Last successful sync\n"+(if(s.lastSuccess==0L)"Never"else java.text.DateFormat.getDateTimeInstance().format(java.util.Date(s.lastSuccess)))+"\n\nWaiting on this device: ${s.pending}\nNotes to review: ${s.conflicts}\n\n"+Connection(this).credentials.host;action.isEnabled=s.phase !in listOf("sending","receiving");action.text=if(saveFailed)"Retry save" else when(s.phase){"auth"->"Sign in";"conflict"->"Review versions";"sending","receiving"->"Sync in progress";"error","offline"->"Retry sync";else->if(s.pending>0)"Sync now"else"Check now"}}
        val observer:(SyncState)->Unit={runOnUiThread {if(dialog.isShowing)update()}}
        Sync.listeners.add(observer);dialog.setOnDismissListener {Sync.listeners.remove(observer)}
        action.setOnClickListener {when {saveFailed->{if(saveLocal(content))sync();update()};Sync.state.phase=="auth"->{dialog.dismiss();login()};Sync.state.conflicts>0->{dialog.dismiss();val p=db.all("pending").firstOrNull {it.has("conflict")};if(p!=null){open(p.getString("path"));reviewConflict()}};else->sync()}}
        update()
    }

    private fun login() {
        current = null
        root("quiccie")
        layout.addView(text("Sign in to your notes.", 20f))
        val host =
            EditText(this).apply {
                hint = "Server address"
                setText(Connection(this@MainActivity).credentials.host)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            }
        val user =
            EditText(this).apply {
                hint = "Username"
                setText("owner")
                setAutofillHints(View.AUTOFILL_HINT_USERNAME)
            }
        val pass =
            EditText(this).apply {
                hint = "Password"
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
                setAutofillHints(View.AUTOFILL_HINT_PASSWORD)
            }
        layout.addView(host)
        layout.addView(user)
        layout.addView(pass)
        layout.addView(
            button("Sign in") {
                val h = host.text.toString()
                val u = user.text.toString()
                val p = pass.text.toString()
                status.text = "Connecting…"
                worker.execute {
                    try {
                        Connection(this).login(h, u, p)
                        runOnUiThread {
                            pass.setText("")
                            library()
                            sync()
                        }
                    } catch (e: Exception) {
                        runOnUiThread { status.text = e.message }
                    }
                }
            }
        )
        if (db.library().isNotEmpty()) layout.addView(button("Use notes offline") { library() })
    }

    private fun library() {
        if(section=="Search")noteFilter=allFilter()
        if(spaces.kind=="memory"&&noteFilter=="All notes")noteFilter="All memory"
        if(spaces.kind=="notes"&&noteFilter !in listOf("Recent","All notes"))noteFilter="All notes"
        if(spaces.all().any {folder==it.prefix+"Agent Memory/projects"})folder=folder.removeSuffix("/projects")
        current = null
        root("quiccie")
        editing=false
        val title=row().apply {gravity=android.view.Gravity.CENTER_VERTICAL;dividerDrawable=android.graphics.drawable.GradientDrawable().apply {setColor(Color.TRANSPARENT);setSize(dp(8),1)}}
        title.addView(text(if(folder.isEmpty())when(section){"Memory"->"Agent memory";"Files"->"Folders";else->section} else Organization.folderLabel(folder,spaces.all()),28f).apply {typeface=android.graphics.Typeface.DEFAULT_BOLD},LinearLayout.LayoutParams(0,-2,1f))
        if(section=="Notes"||section=="Memory")title.addView(button(noteFilter+" ⌄"){
            val choices=if(spaces.kind=="memory")arrayOf("Recent","All memory","Imported indexes")else arrayOf("Recent","All notes")
            dialogBuilder().setTitle(if(spaces.kind=="memory")"Browse memory"else"Browse notes").setItems(choices){_,i->noteFilter=choices[i];locations[locationKey()]=LibraryLocation(folder,query,noteFilter);library()}.show()
        },LinearLayout.LayoutParams(dp(116),dp(48)))
        title.addView(button("＋"){newNote()}.apply {contentDescription=if(spaces.kind=="memory")"New memory"else"New note";textSize=24f;background=feedback(green);setTextColor(palette.onAction)},LinearLayout.LayoutParams(dp(52),dp(48)))
        layout.addView(title,LinearLayout.LayoutParams(-1,-2).apply {bottomMargin=dp(12)})
        spaceControls()
        if(section in listOf("Files","Projects")){
            val modes=row()
            for(mode in listOf("Files","Projects"))modes.addView(button(if(mode=="Files")"Folders"else"Projects"){navigate(mode)}.apply {isSelected=section==mode;background=feedback(if(section==mode)tint else card);contentDescription=if(mode=="Files")"Folder view"else"Project view"},LinearLayout.LayoutParams(0,dp(48),1f))
            layout.addView(modes)
        }
        if(section=="Search")layout.addView(text("Search "+(spaces.all().find{it.id==spaces.selected}?.name?:"All spaces")+" · "+(if(spaces.kind=="memory")"Agent memory"else"Notes")+" · Excludes imported indexes",12f).apply {setTextColor(muted);contentDescription="Search scope"})
        if(folder.isNotEmpty()){
            val up=browseParent()
            layout.addView(button(if(up.isEmpty())if(projects)"Up to projects"else"Up to folders"else"Up to "+Organization.folderLabel(up,spaces.all())){openFolder(browseParent())}.apply {contentDescription="Up one level"})
            layout.addView(button(Organization.pathLabel(folder,spaces.all())){chooseFolder(folder)}.apply {maxLines=2;textSize=12f;contentDescription="Folder path"})
        }
        val search=EditText(this).apply {hint=if(spaces.kind=="memory")"Search memory"else"Search notes";contentDescription="Search query";setText(query);setSingleLine(true);setTextColor(ink);setHintTextColor(muted);background=rounded(card,12);setPadding(dp(14),0,dp(14),0)}
        if(section=="Search")layout.addView(search,LinearLayout.LayoutParams(-1,dp(52)))
        val list=ListView(this).apply {divider=null;dividerHeight=0;setBackgroundColor(paper);clipToPadding=false;setPadding(0,dp(8),0,dp(8))}
        libraryList=list
        val empty=text("Loading notes…",14f).apply {setTextColor(muted);gravity=android.view.Gravity.CENTER}
        layout.addView(empty,LinearLayout.LayoutParams(-1,0,1f))
        layout.addView(list,LinearLayout.LayoutParams(-1,0,1f));list.emptyView=empty
        val navigation=row().apply {setBackgroundColor(rail);setPadding(0,dp(8),0,dp(8));dividerDrawable=android.graphics.drawable.GradientDrawable().apply {setColor(Color.TRANSPARENT);setSize(dp(8),1)}}
        listOf("Notes","Memory","Browse","Search").forEach { name->
            val selected=section==name||(name=="Browse"&&section in listOf("Files","Projects"))
            navigation.addView(button(name){navigate(name)}.apply {textSize=11f;background=feedback(if(selected)tint else rail,12);setTextColor(if(selected)green else muted);contentDescription=name;isSelected=selected;if(android.os.Build.VERSION.SDK_INT>=30)stateDescription=if(selected)"Selected"else"Not selected";setCompoundDrawables(null,icon(if(name=="Browse")"files"else name.lowercase()).apply {setTint(if(selected)green else muted)},null,null);compoundDrawablePadding=dp(4);gravity=android.view.Gravity.CENTER;setPadding(0,dp(4),0,dp(4))},LinearLayout.LayoutParams(0,dp(64),1f))
        }
        layout.addView(navigation)
        var notes = listOf<JSONObject>()
        val savedLocation=locations[locationKey()]?.takeIf{it.folder==folder}
        var scrollRestored=false
        val generation=++libraryGeneration
        fun refresh() {
            val all=librarySnapshot.filter {spaces.contains(it.getString("path")) && spaces.containsKind(it.getString("path"))}
            val visible=all.filter{section in listOf("Files","Projects") && query.isBlank() || if(noteFilter=="Imported indexes")Organization.importedIndex(it.getString("path"),spaces.all())else !Organization.importedIndex(it.getString("path"),spaces.all())}
            if(section=="Search"&&query.isBlank()){notes=emptyList()} else if(query.isNotBlank()) {
                notes=visible.filter { Organization.matches(it.optString("content"),it.getString("path"),query) }
            } else if(section=="Notes" || section=="Memory" || section=="Search") {
                val recent=prefs.getString("recent", "")!!.split("\n")
                notes=visible.filter { n->val p=n.getString("path");when(noteFilter){"Personal","Work"->true;"Recent"->p in recent;else->true} }.sortedBy { if(noteFilter=="Recent") recent.indexOf(it.getString("path")).let {index->if(index<0)Int.MAX_VALUE else index} else 0 }
            } else if(projects&&folder.isEmpty()&&spaces.kind=="notes"){
                notes=Organization.noteProjects(all.map{it.getString("path")},spaces.all()).map{JSONObject().put("path",it).put("folder",true).put("label",(if(spaces.selected=="*")(spaces.all().find{s->s.id==spaces.pathSpace(it)}?.name?:"Personal")+" / "else"")+Organization.folderLabel(it,spaces.all()))}
            } else {
                val entries=linkedMapOf<String,JSONObject>()
                for(note in all) {
                    val path=note.getString("path")
                    if(projects && folder.isEmpty() && spaces.kind=="memory") {
                        val space=spaces.all().find {it.id==spaces.pathSpace(path)}?:continue
                        val prefix=space.prefix+"Agent Memory/"
                        if(!path.startsWith(prefix))continue
                        val rest=path.removePrefix(prefix)
                        if(!rest.contains('/')||(rest.startsWith("projects/")&&!rest.removePrefix("projects/").contains('/'))){entries[path]=note;continue}
                        val target=if(rest.startsWith("projects/"))prefix+"projects/"+rest.removePrefix("projects/").substringBefore('/') else prefix+rest.substringBefore('/')
                        val label=space.name+" / "+Organization.folderLabel(target,spaces.all())
                        entries[target]=JSONObject().put("path",target).put("folder",true).put("label",label)
                    } else {
                        val effectiveFolder=folder.ifEmpty {if(spaces.selected=="*")""else ((spaces.all().find{it.id==spaces.selected}?.prefix?:"")+(if(spaces.kind=="memory")"Agent Memory"else"")).trimEnd('/')}
                        val prefix=if(effectiveFolder.isEmpty())"" else "$effectiveFolder/"
                        if(!path.startsWith(prefix))continue
                        val rest=path.removePrefix(prefix)
                        val memoryRoot=spaces.all().any {effectiveFolder==it.prefix+"Agent Memory"}
                        if(memoryRoot&&rest.startsWith("projects/")&&!rest.removePrefix("projects/").contains('/')){entries[path]=note;continue}
                        if(rest.contains('/')) {
                            val target=if(memoryRoot&&rest.startsWith("projects/"))prefix+"projects/"+rest.removePrefix("projects/").substringBefore('/')else prefix+rest.substringBefore('/')
                            entries[target]=JSONObject().put("path",target).put("folder",true)
                        } else entries[path]=note
                    }
                }
                notes=entries.values.sortedWith(compareBy<JSONObject> { !it.optBoolean("folder") }.thenBy { it.optString("label",it.getString("path")) })
            }
            empty.text=if(section=="Search"&&query.isBlank())"Enter a search term."else if(noteFilter=="Recent")"No recently opened notes."else"No notes found."
            (list.adapter as? android.widget.BaseAdapter)?.notifyDataSetChanged()
            if(!scrollRestored&&notes.isNotEmpty()){
                scrollRestored=true
                savedLocation?.let{list.setSelectionFromTop(it.position,it.top)}
            }
        }
        data class RowViews(val title:TextView,val subtitle:TextView,val preview:TextView,val offline:TextView,val arrow:Button,val item:LinearLayout)
        list.adapter=object:android.widget.BaseAdapter(){
            override fun getCount()=notes.size
            override fun getItem(position:Int)=notes[position]
            override fun getItemId(position:Int)=notes[position].getString("path").hashCode().toLong()
            override fun getView(position:Int,convert:View?,parent:ViewGroup):View {
                val outer:LinearLayout;val views:RowViews
                if(convert is LinearLayout && convert.tag is RowViews){outer=convert;views=convert.tag as RowViews}else{
                    outer=LinearLayout(this@MainActivity).apply {orientation=LinearLayout.VERTICAL;setPadding(0,dp(5),0,dp(5))}
                    val item=LinearLayout(this@MainActivity).apply {orientation=LinearLayout.VERTICAL;background=rounded(card,14).apply {setStroke(dp(1),palette.line)};setPadding(dp(16),dp(12),dp(16),dp(12));minimumHeight=dp(84)}
                    val line=row().apply {gravity=android.view.Gravity.CENTER_VERTICAL}
                    val title=text("",16f).apply {id=android.R.id.text1;typeface=android.graphics.Typeface.create("sans-serif-medium",0);maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END}
                    line.addView(title,LinearLayout.LayoutParams(0,-2,1f))
                    val arrow=button("›"){}.apply {isFocusable=false};line.addView(arrow,LinearLayout.LayoutParams(dp(48),dp(48)));item.addView(line)
                    val subtitle=text("",12f).apply {id=android.R.id.text2;setTextColor(muted);maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END};item.addView(subtitle)
                    val preview=text("",13f).apply {setTextColor(muted);maxLines=2;ellipsize=android.text.TextUtils.TruncateAt.END};item.addView(preview)
                    val offline=text("Available offline",11f).apply {setTextColor(muted)};item.addView(offline)
                    views=RowViews(title,subtitle,preview,offline,arrow,item);outer.tag=views;outer.addView(item)
                }
                val n=notes[position];val path=n.getString("path");val isFolder=n.optBoolean("folder")
                outer.setPadding(dp(n.optInt("depth")*12),dp(5),0,dp(5))
                val info=Organization.note(path,n.optString("content"))
                views.title.text=if(isFolder)n.optString("label",Organization.folderLabel(path,spaces.all()))else info.title
                views.subtitle.text=if(isFolder)"Open folder"else Organization.pathLabel(path.substringBeforeLast('/',""),spaces.all())
                views.item.contentDescription=views.title.text.toString()+". "+views.subtitle.text
                views.preview.visibility=if(isFolder)View.GONE else View.VISIBLE;views.offline.visibility=views.preview.visibility
                if(!isFolder){views.preview.text=info.excerpt;views.offline.text=if(info.historical)"Historical memory · Available offline"else"Available offline"}
                views.arrow.visibility=if(isFolder)View.VISIBLE else View.GONE
                views.arrow.text="›"
                views.arrow.contentDescription="Open folder "+views.title.text
                views.arrow.setOnClickListener {openFolder(path)}
                return outer
            }
        }
        refreshLibrary={
            libraryWorker.execute {
                try { val snapshot=db.library();runOnUiThread {if(!isDestroyed && generation==libraryGeneration && current==null){librarySnapshot=snapshot;empty.text="No notes found.";refresh()}} }
                catch(e:Exception){runOnUiThread {if(!isDestroyed)message("Cannot read local notes.")}}
            }
        }
        refresh();refreshLibrary?.invoke()
        search.addTextChangedListener(
            watch {
                query = it
                refresh()
            }
        )
        list.setOnItemClickListener { _, _, position, _ ->
            val note=notes[position]
            if(note.optBoolean("folder")){openFolder(note.getString("path"))}else {rememberLocation();open(note.getString("path"))}
        }
        paintStatus()
    }

    private fun chooseFolder(path:String){
        val crumbs=Organization.crumbs(path,spaces.all()).filter{!projects||it.path in visibleProjectRoots()||visibleProjectRoots().any{root->it.path.startsWith(root+"/")}};val targets=listOf(Organization.Crumb(if(projects)"Projects"else"All folders",""))+crumbs
        dialogBuilder().setTitle("Open folder").setItems(targets.map {it.label}.toTypedArray()){_,i->
            if(saveFailed){message("Retry the local save first.");return@setItems}
            rememberLocation();targets[i].space?.let{spaces.selected=it}
            hideKeyboard();editing=false;if(section!="Projects"){section="Files";projects=false};openFolder(targets[i].path)
        }.setNegativeButton("Cancel",null).show()
    }
    private fun spaceControls(){
        val controls=row()
        val selected=spaces.all().find{it.id==spaces.selected}?.name?:"All spaces"
        controls.addView(button("Space: $selected"){
            val choices=spaces.all();val labels=(choices.map{it.name}+"All spaces"+"Add space…").toTypedArray()
            dialogBuilder().setTitle("Choose space").setItems(labels){_,index->
                if(index==choices.size+1){addSpace()}else{rememberLocation();spaces.selected=if(index==choices.size)"*"else choices[index].id;restoreLocation();library()}
            }.setNegativeButton("Cancel",null).show()
        },LinearLayout.LayoutParams(0,dp(48),1f))
        controls.addView(text(if(spaces.kind=="memory")"Agent memory"else"Notes",14f).apply {gravity=android.view.Gravity.CENTER},LinearLayout.LayoutParams(0,dp(48),1f));layout.addView(controls)
    }

    private fun addSpace(){
        val name=EditText(this).apply{hint="Space name";setSingleLine(true)}
        val id=EditText(this).apply{hint="Space ID, such as side-gig";setSingleLine(true)}
        val box=column();box.addView(text("Keep notes, projects, and agent memory in this space.",14f));box.addView(name);box.addView(id);box.addView(text("The ID stays fixed. A connection is required.",12f))
        name.addTextChangedListener(watch{id.setText(name.text.toString().lowercase().replace(Regex("[^a-z0-9]+"),"-").trim('-'))})
        val dialog=dialogBuilder().setTitle("Add space").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Create space",null).create();dialog.show()
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val value=id.text.toString().trim();val label=name.text.toString().trim()
            if(label.isEmpty()||!value.matches(Regex("[a-z0-9]+(-[a-z0-9]+)*"))){id.error="Enter a name and a valid space ID.";return@setOnClickListener}
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled=false
            worker.execute{try{spaces.create(value,label);runOnUiThread{if(!isDestroyed){dialog.dismiss();section="Notes";folder="";query="";noteFilter=if(spaces.kind=="memory")"All memory"else"All notes";library()}}}catch(e:Exception){runOnUiThread{if(!isDestroyed){id.error=e.message;dialog.getButton(AlertDialog.BUTTON_POSITIVE).isEnabled=true}}}}
        }
    }

    private fun newNote() {
        if(saveFailed){message("Retry the local save before creating a note.");return}
        val targetFolder=folder.takeIf {spaces.containsKind(it+"/New.md")} ?: ""
        val input=EditText(this).apply {hint="Ideas/My note.md";if(targetFolder.isNotEmpty())setText(targetFolder+"/");setTextColor(ink);setHintTextColor(muted);setSingleLine(true)}
        val box=column();box.addView(input)
        val dialog=dialogBuilder().setTitle("New note").setView(box).setNegativeButton("Cancel",null).setPositiveButton("Create",null).create()
        dialog.show();dialog.window?.setBackgroundDrawable(rounded(paper,20))
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            var p=input.text.toString().trim()
            if(p.isBlank()||p.toByteArray().size>1021||p.split('/').any {it.isEmpty()||it.startsWith('.')||it.contains(':')||it.contains('\\')||it.any {c->c.code<32}}){input.error="Use a relative note path.";return@setOnClickListener}
            try{p=spaces.notePath(p)}catch(e:Exception){input.error=e.message;return@setOnClickListener}
            if(!p.endsWith(".md"))p+=".md"
            if(db.note(p)!=null){input.error="A note has this path.";return@setOnClickListener}
            try {db.edit(p,"# "+p.substringAfterLast('/').removeSuffix(".md")+"\n\n");Sync.localChanged(this);dialog.dismiss();editing=true;open(p)}
            catch(e:Exception){input.error="The note was not saved. Try again."}
        }
    }

    private fun open(path: String, fragment:String="") {
        if(saveFailed){message("Retry the local save before leaving this note.");return}
        val targetKind=if(path.split('/').contains("Agent Memory"))"memory"else"notes"
        if(targetKind!=spaces.kind){spaces.kind=targetKind;section=if(targetKind=="memory")"Memory"else"Notes";folder="";query="";noteFilter=allFilter();projects=false}
        current = path
        val pending = db.pending(path)
        editorBase =
            if (pending != null) {
                if (pending.isNull("expected_checksum")) null
                else pending.getString("expected_checksum")
            } else db.serverNote(path)?.optString("checksum")
        content = db.note(path)?.optString("content") ?: ""
        root(Organization.note(path,content).title)
        val parent=path.substringBeforeLast('/',"")
        layout.addView(button(if(parent.isEmpty())"Your library"else Organization.pathLabel(parent,spaces.all())){chooseFolder(parent)}.apply {contentDescription="Full folder path";maxLines=2;textSize=12f})
        val recent=prefs.getString("recent", "")!!.split("\n").filter {it.isNotEmpty()&&it!=path}
        prefs.edit().putString("recent",(listOf(path)+recent).take(40).joinToString("\n")).apply()
        if (db.pending(path)?.has("conflict") == true)
            layout.addView(button("Review conflicting edits") { reviewConflict() })
        val view = WebView(this)
        web = view
        view.setBackgroundColor(paper)
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = false
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        val loader =
            WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
                .build()
        view.webViewClient =
            object : WebViewClient() {
                override fun shouldInterceptRequest(
                    v: WebView,
                    r: WebResourceRequest,
                ): WebResourceResponse? {
                    if (
                        r.url.host == "appassets.androidplatform.net" &&
                            r.url.path == "/api/attachment"
                    ) {
                        val path = r.url.getQueryParameter("path") ?: return null
                        val files = Attachments(this@MainActivity)
                        val bytes =
                            files.bytes(path)
                                ?: return WebResourceResponse(
                                    "text/plain",
                                    "UTF-8",
                                    404,
                                    "Not found",
                                    emptyMap(),
                                    java.io.ByteArrayInputStream(byteArrayOf()),
                                )
                        return WebResourceResponse(
                            files.mime(path),
                            null,
                            java.io.ByteArrayInputStream(bytes),
                        )
                    }
                    return loader.shouldInterceptRequest(r.url)
                }

                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                    if (
                        r.url.host == "appassets.androidplatform.net" &&
                            r.url.path == "/assets/editor.html"
                    )
                        return false
                    if (r.url.scheme == "https" || r.url.scheme == "http")
                        startActivity(Intent(Intent.ACTION_VIEW, r.url))
                    return true
                }
            }
        view.addJavascriptInterface(
            object {
                @JavascriptInterface
                fun ready() {
                    runOnUiThread {
                        if(isDestroyed || current!=path)return@runOnUiThread
                        view.evaluateJavascript(
                            "window.setTheme("+dark+");window.setNote(" + JSONObject.quote(content) + ","+JSONObject.quote(path)+","+JSONObject.quote(fragment)+");window.setEditing("+editing+")",
                            null,
                        )
                    }
                }

                @JavascriptInterface
                fun sourceRequired(){runOnUiThread {if(current==path && source==null){editing=true;editButton?.text="Done";toggleSource()}}}
                @JavascriptInterface
                fun openNote(target: String, from:String) {
                    runOnUiThread {
                        val found=Organization.resolve(target,from,db.library(),spaces.all())
                        if(found!=null)open(found.getString("path"),target.substringAfter('#',"")) else message("The linked note is missing or its name is ambiguous.")
                    }
                }

                @JavascriptInterface
                fun spaceCatalog():String=JSONArray(spaces.all().map{JSONObject().put("id",it.id).put("name",it.name).put("prefix",it.prefix).put("shared_project",it.shared)}).toString()
                @JavascriptInterface
                fun resolveEmbed(target:String,from:String):String = Organization.resolve(target,from,db.library(),spaces.all())?.let {JSONObject().put("path",it.getString("path")).put("content",it.optString("content")).toString()}?:"null"
                @JavascriptInterface
                fun attachmentPaths():String = JSONArray(Attachments(this@MainActivity).all().map{it.getString("path")}).toString()

                @JavascriptInterface
                fun changed(value: String) {
                    runOnUiThread {
                        if(!isDestroyed && current==path) {
                            saveLocal(value)
                        }
                    }
                }
            },
            "Quiccie",
        )
        layout.addView(view, LinearLayout.LayoutParams(-1, 0, 1f))
        localStatus=text(if(saveFailed)"Cannot save. Keep this note open."else"Saved on this device · Available offline",12f).apply {setTextColor(muted)}
        layout.addView(localStatus)
        view.loadUrl("https://appassets.androidplatform.net/assets/editor.html")
    }

    private fun toggleSource() {
        val path = current ?: return
        val v = web ?: return
        if (source != null) {
            v.evaluateJavascript("window.setNote(" + JSONObject.quote(content) + ")", null)
            layout.removeView(source)
            source = null
            v.visibility = View.VISIBLE
            return
        }
        v.visibility = View.GONE
        val editor =
            EditText(this).apply {
                setText(content)
                setTextColor(ink)
                setBackgroundColor(paper)
                gravity = android.view.Gravity.TOP
                typeface = android.graphics.Typeface.MONOSPACE
                textSize = 14f
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            }
        source = editor
        layout.addView(editor, layout.indexOfChild(web), LinearLayout.LayoutParams(-1, 0, 1f))
        editor.addTextChangedListener(
            watch {
                saveLocal(it)
            }
        )
    }

    private fun history() {
        val path = current ?: return
        worker.execute {
            try {
                val rows =
                    JSONArray(
                        Connection(this).request("history?path=" + URLEncoder.encode(path, "UTF-8"))
                    )
                runOnUiThread {
                    val notes = (0 until rows.length()).map { rows.getJSONObject(it) }.reversed()
                    dialogBuilder()
                        .setTitle("Note history")
                        .setItems(notes.map { it.optString("updated") }.toTypedArray()) { _, i ->
                            val n = notes[i]
                            dialogBuilder()
                                .setTitle("Restore this version?")
                                .setMessage(n.getString("content"))
                                .setNegativeButton("Cancel", null)
                                .setPositiveButton("Restore") { _, _ ->
                                    db.edit(path, n.getString("content"))
                                    open(path)
                                    sync()
                                }
                                .show()
                        }
                        .setNegativeButton("Close", null)
                        .show()
                }
            } catch (e: Exception) {
                runOnUiThread { message("Connect to the server to read history.") }
            }
        }
    }

    private fun reviewConflict() {
        val path = current ?: return
        worker.execute {
            try {
                val remote =
                    JSONObject(
                        Connection(this).request("notes?include_deleted=1&path=" + URLEncoder.encode(path, "UTF-8"))
                    )
                runOnUiThread {
                    dialogBuilder()
                        .setTitle("Saved version")
                        .setMessage(remote.getString("content"))
                        .setPositiveButton("Save my version") { _, _ ->
                            db.resolve(path, remote, true)
                            open(path)
                            sync()
                        }
                        .setNeutralButton("Use saved version") { _, _ ->
                            db.resolve(path, remote, false)
                            if(remote.optBoolean("deleted"))library()else open(path)
                            sync()
                        }
                        .setNegativeButton("Cancel", null)
                        .show()
                }
            } catch (e: Exception) {
                runOnUiThread { message(e.message ?: "Connection failed") }
            }
        }
    }

    private fun sync() {
        worker.execute {
            try { Sync.run(this) } catch(e:Exception) { /* Sync publishes the failure state. */ }
        }
    }

    private fun message(s: String) {
        Toast.makeText(this, s, Toast.LENGTH_LONG).show()
    }

    private fun watch(action: (String) -> Unit) =
        object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}

            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}

            override fun afterTextChanged(s: Editable?) {
                action(s.toString())
            }
        }

    @Deprecated("Uses the activity navigation state")
    override fun onBackPressed() {
        val view=web
        if(current!=null && view!=null){view.evaluateJavascript("window.closePropertyDialog ? window.closePropertyDialog() : false"){closed->if(closed!="true")backFromNote()};return}
        backFromNote()
    }
    private fun backFromNote() {
        if(current!=null && editing){toggleEditing();return}
        if (current != null) backToLibrary() else if(folder.isNotEmpty()){openFolder(browseParent())} else if(section!=if(spaces.kind=="memory")"Memory"else"Notes"){navigate(if(spaces.kind=="memory")"Memory"else"Notes")}else super.onBackPressed()
    }

    override fun onSaveInstanceState(out:Bundle){
        rememberLocation()
        val saved=JSONObject();locations.forEach{(key,row)->saved.put(key,JSONObject().put("folder",row.folder).put("query",row.query).put("filter",row.filter).put("position",row.position).put("top",row.top))};out.putString("locations",saved.toString());out.putString("browseModes",JSONObject(browseModes.toMap()).toString())
        super.onSaveInstanceState(out)
        out.putString("section",section);out.putString("filter",noteFilter);out.putString("folder",folder);out.putString("query",query);out.putString("current",current);out.putBoolean("editing",editing);out.putBoolean("source",source!=null)
        out.putStringArrayList("expanded",ArrayList(expandedFolders))
        if(saveFailed){out.putString("failed-base",editorBase);if(content.toByteArray().size<262144)out.putString("failed-buffer",content)}
    }
    @Deprecated("Retains an unsaved buffer during configuration changes")
    override fun onRetainNonConfigurationInstance():Any? = if(saveFailed)FailedDraft(content,editorBase) else null

    override fun onDestroy() {
        Sync.listeners.remove(syncListener)
        web?.destroy()
        worker.shutdown()
        libraryWorker.shutdown()
        db.close()
        super.onDestroy()
    }

    @Deprecated("Uses the activity result API")
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        super.onActivityResult(request, result, data)
        if (request != 100 || result != RESULT_OK) return
        val uri = data?.data ?: return
        val path = current ?: return
        try {
            val bytes =
                contentResolver.openInputStream(uri)!!.use { input ->
                    val out = java.io.ByteArrayOutputStream()
                    val buffer = ByteArray(8192)
                    while (true) {
                        val n = input.read(buffer)
                        if (n < 0) break
                        require(out.size() + n <= 20 * 1024 * 1024) { "The file exceeds 20 MiB." }
                        out.write(buffer, 0, n)
                    }
                    out.toByteArray()
                }
            val mime = contentResolver.getType(uri) ?: "application/octet-stream"
            val name =
                contentResolver.query(uri, null, null, null, null)?.use {
                    if (it.moveToFirst())
                        it.getString(
                            it.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                        )
                    else "file"
                } ?: "file"
            val target = "Attachments/" + java.util.UUID.randomUUID() + "-" + name.replace('/', '-')
            Attachments(this).save(target, bytes, mime, true)
            content +=
                "\n\n" +
                    (if (mime.startsWith("image/")) "!" else "") +
                    "[" +
                    name +
                    "](/api/attachment?path=" +
                    URLEncoder.encode(target, "UTF-8") +
                    ")\n"
            db.edit(path, content, false, editorBase, true)
            Sync.localChanged(this)
            open(path)
        } catch (e: Exception) {
            message(e.message ?: "The file was not saved.")
        }
    }
}
