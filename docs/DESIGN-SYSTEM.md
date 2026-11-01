# Interface colour and design

Web and Android use the same colour roles in light and dark modes.
Use violet for a primary action, a link, or a selected destination.
Use neutral colours for surfaces and body text.
Use amber for a warning and red for a destructive action.
Keep a text label with each status. Colour alone must not identify a state.

The light theme uses white reading surfaces and cool grey navigation.
The dark theme uses blue-grey surfaces and a lighter violet accent.
A selected note has a border and a side marker.
A selected navigation button has a filled background and stronger text.
Memory and Projects use different icons.

Use a strong filled button for the main create action.
Use quieter controls for other actions.
Android buttons show touch feedback.
Keep the existing touch targets and system bar clearance.
Do not add movement when the device requests reduced motion.

The browser palette is in `web/src/design.css`.
The native palette is in `android/app/src/main/java/app/quiccie/android/Palette.kt`.
The Android reader also uses the browser palette.
Keep both palettes aligned when you change a colour role.

Browser tests measure rendered text contrast in both themes.
Android tests check text contrast and the colours of native controls.
The tested normal text pairs must have a contrast ratio of at least 4.5:1.
These checks do not establish full accessibility conformance.
Review screenshots at desktop and phone sizes before release.
