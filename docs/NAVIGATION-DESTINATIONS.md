# Notes and memory navigation

Select a space first. Notes and Agent memory are separate destinations.
The phone and Android apps have four main buttons:
Notes, Memory, Browse, and Search.
Browse contains the Folders and Projects views.
The desktop sidebar has the same folder and project views.

Notes and Memory start with the full list.
Recent is an explicit filter. It is empty until you open a note.
It does not substitute the full list when there is no recent note.
The reader closes a memory document when you change to Notes.
The app saves a pending edit before this change.

Each destination keeps its location during tab changes.
The saved location belongs to one space and one content kind.
Browse keeps separate locations for Folders and Projects.
Search shows the selected space and content kind beside its query.
Search includes all folders in that scope and excludes imported indexes.
A restored web query runs the same server search again.

Projects uses folders with Overview.md as project roots.
If one marked root contains another, the outer root takes precedence.
A top-level folder without a marked project below it remains a project root.
Adding a note to a parent collection does not change its project roots.
At a project root, Up returns to Projects.
Within a project, Up opens the visible parent folder.
Project breadcrumbs omit hidden collection folders.
Folders gives access to the complete folder tree.

Select Imported indexes to read imported index files.
Folders and project subfolders also give access to these files.
This rule applies only within a registered Agent Memory root.
It includes the indexes category, MEMORY.md, and memory summary files.
Display titles omit a leading UUID in an imported memory name.
The original path remains available in note details.
These display changes do not move files or change MCP paths.

## Release checks

Android 0.3.6-test and the matching web release include these changes.
Browser checks cover full lists, explicit Recent, retained locations,
project Up, search scope, restored search results, and offline edits.
Android checks cover navigation, scroll retention, Activity recreation,
space selection, and system bar clearance.
An independent agent repeated the failed navigation paths after the build.
The review found a restored-search error. The corrected build passed that check.
