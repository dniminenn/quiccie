package app.quiccie.android

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class Space(val id:String,val name:String,val prefix:String,val shared:String)
class Spaces(private val context:Context) {
    private val prefs=context.getSharedPreferences("spaces",Context.MODE_PRIVATE)
    var selected:String
        get()=prefs.getString("selected","personal")!!
        set(value){prefs.edit().putString("selected",value).commit()}
    var kind:String
        get()=if(prefs.getString("kind","notes")=="memory")"memory"else"notes"
        set(value){prefs.edit().putString("kind",value).commit()}
    fun all():List<Space> {
        val defaults=listOf(Space("personal","Personal","","global"),Space("work","Work","Work/","work"))
        return try {val data=JSONArray(prefs.getString("catalog",null)?:return defaults);(0 until data.length()).map {val s=data.getJSONObject(it);Space(s.getString("id"),s.getString("name"),s.getString("prefix"),s.getString("shared_project"))}} catch(e:Exception){defaults}
    }
    fun refresh(){val data=Connection(context).request("spaces");JSONArray(data);prefs.edit().putString("catalog",data).commit()}
    fun create(id:String,name:String){Connection(context).request("spaces","POST",JSONObject().put("id",id).put("name",name));refresh();selected=id;kind="notes"}
    fun pathSpace(path:String):String=spaceForPath(path,all())?.id?:""

    fun contains(path:String)=selected=="*"||pathSpace(path)==selected
    fun containsKind(path:String)=kind=="all"||(path.split('/').contains("Agent Memory")== (kind=="memory"))
    fun notePath(path:String):String {
        val space=all().find {it.id==selected}?:error("Select one space before creating a note.")
        val prefix=space.prefix+if(kind=="memory")"Agent Memory/global/"else""
        val target=if(space.prefix.isNotEmpty()&&!path.startsWith(space.prefix))prefix+path else if(kind=="memory"&&!path.contains("Agent Memory/"))prefix+path else path
        require(pathSpace(target)==space.id){"The note path belongs to another space."}
        require(kind!="notes"||!target.split('/').contains("Agent Memory")){"Select Agent memory before creating a memory note."}
        return target
    }
}

fun spaceForPath(path:String,catalog:List<Space>):Space?=catalog.filter{it.prefix.isNotEmpty()&&path.startsWith(it.prefix)}.maxByOrNull{it.prefix.length}?:if(path.startsWith("Spaces/"))null else catalog.find{it.prefix.isEmpty()}
