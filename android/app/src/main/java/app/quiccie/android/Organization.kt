package app.quiccie.android

object Organization {
 private val yamlSettings=org.snakeyaml.engine.v2.api.LoadSettings.builder()
  .setSchema(org.snakeyaml.engine.v2.schema.CoreSchema())
  .setAllowDuplicateKeys(false).setMaxAliasesForCollections(20).setCodePointLimit(1048576).build()
 private fun fields(source:String):Map<*,*> = try {
  org.snakeyaml.engine.v2.api.Load(yamlSettings).loadFromString(source) as? Map<*,*> ?: emptyMap<Any,Any>()
 }catch(_:Exception){emptyMap<Any,Any>()}

 data class Crumb(val label:String,val path:String,val space:String?=null)
 data class Note(val title:String,val excerpt:String,val historical:Boolean)
 private val categories=mapOf("projects" to "Project notes","project" to "Project records","feedback" to "Agent guidance","references" to "References","reference" to "Reference records","indexes" to "Imported indexes","derived" to "Derived notes","user" to "User preferences")
 fun crumbs(path:String,spaces:List<Space>):List<Crumb>{
  val space=spaces.filter{it.prefix.isNotEmpty()&&(path.startsWith(it.prefix)||path==it.prefix.trimEnd('/'))}.maxByOrNull{it.prefix.length}?:spaces.first{it.id=="personal"}
  val prefix=space.prefix;val relative=path.removePrefix(prefix)
  val parts=if(relative.isEmpty())emptyList()else relative.split('/')
  val out=mutableListOf(Crumb(space.name,prefix.trimEnd('/'),space.id))
  for(i in parts.indices){
   if(parts[0]=="Agent Memory"&&i==1&&parts[i]=="projects")continue
   var label=parts[i]
   if(i==0&&label=="Agent Memory")label="Agent memory"
   if(parts[0]=="Agent Memory"&&i==1&&label=="global")label="Shared memory"
   if(parts[0]=="Agent Memory"&&((parts.getOrNull(1)=="projects"&&i==3)||(parts.getOrNull(1)=="global"&&i==2)))label=categories[label]?:label
   out.add(Crumb(label,prefix+parts.take(i+1).joinToString("/")))
  }
  return out
 }
 private fun relative(path:String,spaces:List<Space>):Pair<String,List<String>> {
  val prefix=spaces.filter{it.prefix.isNotEmpty()&&path.startsWith(it.prefix)}.maxByOrNull{it.prefix.length}?.prefix?:""
  return prefix to path.removePrefix(prefix).split('/')
 }
 fun importedIndex(path:String,spaces:List<Space>):Boolean {
  val parts=relative(path,spaces).second;if(parts.firstOrNull()!="Agent Memory")return false
  val category=if(parts.getOrNull(1)=="projects")parts.getOrNull(3)else if(parts.getOrNull(1)=="global")parts.getOrNull(2)else""
  return category=="indexes"||Regex("(?i)memory(?:[_-]summary)?\\.md").matches(parts.last())
 }
 fun noteProjects(paths:List<String>,spaces:List<Space>):List<String> {
  val top=linkedSetOf<String>();val markers=linkedSetOf<String>()
  for(path in paths){val(prefix,parts)=relative(path,spaces);if(parts[0]=="Agent Memory"||parts.size<2)continue
   top.add(prefix+parts[0])
   if(parts.last().equals("overview.md",true))markers.add(path.substringBeforeLast('/'))
  }
  val roots=markers.filter{candidate->markers.none{it!=candidate&&candidate.startsWith(it+"/")}}
  return (roots+top.filter{root->roots.none{it==root||it.startsWith(root+"/")}}).sorted()
 }
 fun browseParent(path:String,projectRoots:List<String>,spaces:List<Space>):String {
  if(path in projectRoots)return ""
  val parent=parent(path,spaces)
  return if(spaces.any{parent==it.prefix.trimEnd('/')||parent==it.prefix+"Agent Memory"})"" else parent
 }
 fun folderLabel(path:String,spaces:List<Space>)=crumbs(path,spaces).last().label
 fun pathLabel(path:String,spaces:List<Space>)=crumbs(path,spaces).joinToString(" / "){it.label}
 fun parent(path:String,spaces:List<Space>)=crumbs(path,spaces).dropLast(1).lastOrNull()?.path?:""
 private fun plain(value:String)=value.replace(Regex("<[^>]*>"),"").replace(Regex("[#*`>]"),"").replace(Regex("\\s+")," ").trim()
 fun matches(content:String,path:String,query:String):Boolean {
  val pattern=Regex("\\[([^\\[\\]:]+)(?::([^\\]]*))?\\]")
  if(!pattern.containsMatchIn(query))return (path+" "+content).contains(query,true)
  val front=Regex("\\A---\\r?\\n((?:[\\s\\S]*?\\r?\\n)?)---(?:\\r?\\n|$)").find(content)
  val data=fields(front?.groupValues?.get(1)?:"{}")
  var matches=true
  val rest=pattern.replace(query){match->
   val key=match.groupValues[1].trim()
   var exists=data.containsKey(key)
   var value:Any?=data[key]
   if(!exists){value=data;exists=true;for(part in key.split('.')){val map=value as? Map<*,*>;if(map==null||!map.containsKey(part)){exists=false;value=null;break};value=map[part]}}
   val wanted=match.groups[2]?.value?.trim()?.removeSurrounding("\"")
   val values=if(value is List<*>)value else listOf(value)
   if(!exists || wanted!=null&&!values.any{(it?.toString()?:"").equals(wanted,true)})matches=false
   ""
  }.trim()
  return matches&&(rest.isEmpty()||(path+" "+content).contains(rest,true))
 }
 fun resolve(target:String,from:String,library:List<org.json.JSONObject>,spaces:List<Space> = listOf(Space("personal","Personal","","global"),Space("work","Work","Work/","work"))):org.json.JSONObject? {
  val source=spaceForPath(from,spaces)?:return null
  val notes=library.filter{spaceForPath(it.optString("path"),spaces)?.id==source.id}
  val name=try { java.net.URLDecoder.decode(target.substringBefore('#').replace("+","%2B"),"UTF-8") }catch(_:Exception){return null}
  if(name.isEmpty())return notes.firstOrNull{it.optString("path")==from}
  if(Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(name)||name.startsWith("//"))return null
  val parent=from.substringBeforeLast('/',"")
  val relative=try{java.net.URI(null,null,"/$parent/$name",null).normalize().path.removePrefix("/")}catch(_:Exception){return null}
  val prefix=source.prefix
  val direct=notes.firstOrNull{it.optString("path") in listOf(name,"$name.md",prefix+name,prefix+name+".md")}?:notes.firstOrNull{it.optString("path")==relative||it.optString("path")=="$relative.md"}
  if(direct!=null)return direct
  val candidates=notes.filter{it.optString("path").substringAfterLast('/')==name.removeSuffix(".md")+".md"}
  if(candidates.isNotEmpty())return candidates.singleOrNull()
  return notes.filter{note->
   val front=Regex("\\A---\\r?\\n((?:[\\s\\S]*?\\r?\\n)?)---(?:\\r?\\n|$)").find(note.optString("content"))
   (fields(front?.groupValues?.get(1)?:"{}")["aliases"] as? List<*>)?.contains(name)==true
  }.singleOrNull()
 }
 fun note(path:String,content:String):Note {
  val front=Regex("\\A---\\r?\\n((?:[\\s\\S]*?\\r?\\n)?)---(?:\\r?\\n|$)").find(content)
  val body=if(front==null)content else content.substring(front.range.last+1)
  val values=fields(front?.groupValues?.get(1)?:"{}")
  fun field(key:String):String = (values[key] as? String)?.let {it.replace(Regex("\\s+")," ").trim()}?:""
  val memory=path.split('/').contains("Agent Memory");val file=path.substringAfterLast('/').removeSuffix(".md")
  fun readable(value:String)=value.isNotEmpty()&&!Regex("^(project|feedback|reference|user)_").containsMatchIn(value)&&!(value==file&&value.contains('_'))
  val name=field("name");val title=field("title");val heading=Regex("(?m)^# +(.+)$").find(body)?.groupValues?.get(1)?:""
  val label=when{readable(name)->name;readable(title)->title;memory&&heading.isNotEmpty()&&readable(heading)->plain(heading);memory->file.replace(Regex("^(project|feedback|reference|user)_"),"").replace(Regex("[_-]+")," ");else->file}
  val historical=memory&&Regex("(?m)^> Historical (?:project |shared )?memory\\b").containsMatchIn(body)
  val preview=field("description").ifEmpty{plain(body.replace(Regex("(?m)^> Historical (?:project |shared )?memory[^\\n]*(?:\\n>[^\\n]*)*"),"").substringBefore("## Original source provenance").replace(Regex("(?m)^# .+\\r?\\n"),"")).take(180)}
  val canonicalMemory=path.split('/').contains("Agent Memory")
  val uuid=Regex("^[0-9a-fA-F]{8}[- ][0-9a-fA-F]{4}[- ][0-9a-fA-F]{4}[- ][0-9a-fA-F]{4}[- ][0-9a-fA-F]{12}[- _]+")
  val display=if(canonicalMemory)label.replace(uuid,"").replace(Regex("[_]+")," ").trim().ifEmpty{label}else label
  return Note(display,preview,historical)
 }
}
